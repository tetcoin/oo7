// (C) Copyright 2016-2017 Parity Technologies (UK) Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//         http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// The parent-side cache-server to which child-side SpookCaches can connect.
// Will send messages of the form { spookCacheUpdate: { uuid: '...', value: ... }}
// value, if provided is the actual Spook value, not a stringification of it.
// Will try to send these only for UUIDs that it knows the child is interested
// in - child can register interest with a message { useSpook: uuid } and
// unregister interest with { dropSpook: uuid }.
//
// If you construct SpookCache passing a deferParentPrefix arg, then it's up to
// you to ensure that the parent actually has a SpookCacheProxy constructed. If
// it doesn't, things will go screwy.

let consoleDebug = typeof window !== 'undefined' && window.debugging ? console.debug : () => {};

class SpookCache {
	constructor (backupStorage, deferParentPrefix, surrogateWindow = null) {
		this.window = surrogateWindow || (typeof window === 'undefined' ? null : window);
		if (this.window) {
			this.window.addEventListener('storage', this.onStorageChanged.bind(this));
			this.window.addEventListener('unload', this.onUnload.bind(this));
			this.window.addEventListener('message', this.onMessage.bind(this));
		}

		this.deferParentPrefix = this.window && this.window.parent ? deferParentPrefix : null;

		this.regs = {};

		// TODO: would be nice if this were better.
		this.sessionId = Math.floor((1 + Math.random()) * 0x100000000).toString(16).substr(1);
		consoleDebug('SpookCache: Constructing', this.sessionId);

		try {
			this.storage = this.window ? this.window.localStorage : backupStorage;
		} catch (e) {
			this.storage = backupStorage;
		}
	}

	initialise (uuid, spook, stringify, parse) {
		consoleDebug('SpookCache.initialise', this.sessionId, uuid, spook, this.regs);
		if (!this.regs[uuid]) {
			consoleDebug('SpookCache.initialise: creating...');
			this.regs[uuid] = { owned: false, deferred: false, users: [spook], primary: null, stringify, parse };
			let key = '$_Spooks.' + uuid;
			if (this.storage[key] !== undefined) {
				consoleDebug('SpookCache.initialise: restoring from persistent cache');
				spook.changed(parse(this.storage[key]));
			}
			this.ensureActive(uuid);
			consoleDebug('SpookCache.initialise: Created reg', this.regs);
		} else if (this.regs[uuid].primary === spook) {
			consoleDebug('SpookCache.initialise: Reactivating an inactive primary.');
			if (this.regs[uuid].owned) {
				console.error('SpookCache.initialise: initialise called on already-active Spook.');
			}
			this.regs[uuid].owned = true;
		} else {
			consoleDebug('SpookCache.initialise: appending to pre-existing entry', JSON.parse(JSON.stringify(this.regs[uuid])));
			if (!this.regs[uuid].primary && !this.regs[uuid].deferred) {
				console.error('SpookCache.initialise: Registered Spook that has neither primary nor deferred.');
			}
			this.regs[uuid].users.push(spook);
			let equivSpook = (this.regs[uuid].primary || this.regs[uuid].users[0]);
			if (equivSpook.isReady()) {
				consoleDebug('SpookCache.initialise: restoring from equivalent active');
				spook.changed(equivSpook._value);
			}
		}
		if (typeof window !== 'undefined' && window.debugging) {
			this.checkConsistency();
		}
	}

	checkConsistency () {
		Object.keys(this.regs).forEach(uuid => {
			let item = this.regs[uuid];
			if (
				(item.primary === null &&
					!item.deferred &&
					item.users.length > 0 &&
					(this.storage['$_Spooks^' + uuid] === this.sessionId ||
						!this.storage['$_Spooks^' + uuid])
				) || (item.primary === null && item.owned)
			) {
				console.error('SpookCache consistency failed!', this.regs);
			}
		});
	}

	changed (uuid, value) {
		consoleDebug('SpookCache.changed', this.sessionId, uuid, value, this.regs);
		let item = this.regs[uuid];
		if (item && this.storage['$_Spooks^' + uuid] === this.sessionId) {
			let key = '$_Spooks.' + uuid;
			if (value === undefined) {
				delete this.storage[key];
				item.users.forEach(spook => spook.reset());
			} else {
				this.storage[key] = item.stringify(value);
				item.users.forEach(spook => spook.changed(value));
			}
		}
		consoleDebug('SpookCache.changed: complete', this.regs[uuid]);
	}

	finalise (uuid, spook) {
		consoleDebug('SpookCache.finalise', uuid, spook, this.regs);
		let item = this.regs[uuid];
		if (typeof item === 'undefined') {
			console.error(`SpookCache.finalise: called for unregistered UUID ${uuid}`, spook);
			return;
		}
		if (item.primary === spook) {
			consoleDebug('SpookCache.finalise: We own; finalising Spook');

			// TODO: decide whether to delete directly, or keep around.
			let keepAround = true;

			if (keepAround) {
				item.owned = false;
				// TODO: record the current time as an LRU and place the spook in a map for eventual deletion.
			} else {
				item.primary.finalise();
				item.primary = null;
				if (item.users.length === 0) {
					consoleDebug('SpookCache.finalise: No users; deleting entry and unreging from storage.');
					// no owner and no users. we shold be the owner in
					// storage. if we are, remove our key to signify to other
					// tabs we're no longer maintaining this.
					let storageKey = '$_Spooks^' + uuid;
					let owner = this.storage[storageKey];
					if (owner === this.sessionId) {
						delete this.storage[storageKey];
					}
				} else {
					consoleDebug('SpookCache.finalise: Still users; ensuring active.');
					// we removed the owner and there are users, must ensure that
					// the spook is maintained.
					this.ensureActive(uuid);
				}
			}
		} else {
			consoleDebug('SpookCache.finalise: Not owner. Removing self from users.');
			// otherwise, just remove the exiting spook from the users.
			item.users = item.users.filter(b => b !== spook);

			// If we're the last user from a parent-deferred Spook, then notify
			// parent we're no longer bothered about further updates.
			if (item.users.length === 0 && this.regs[uuid].deferred) {
				consoleDebug('SpookCache.finalise: dropping deferral from parent frame', uuid);
				this.window.parent.postMessage({ dropSpook: uuid }, '*');
				this.regs[uuid].deferred = false;
			}
		}
		if (item.primary === null && !item.deferred && item.users.length === 0) {
			delete this.regs[uuid];
		}
		if (typeof window !== 'undefined' && window.debugging) {
			this.checkConsistency();
		}
	}

	ensureActive (uuid, key = '$_Spooks^' + uuid) {
		consoleDebug('SpookCache.ensureActive', uuid);
		let item = this.regs[uuid];
		if (item && item.users.length > 0 && item.primary && !item.owned) {
			// would-be owners (users). no need for the primary any more.
			consoleDebug('SpookCache.ensureActive: Cleaning up orphan primary.');
			item.primary.finalise();
			item.primary = null;
			item.owned = false;
		}
		if (item && item.users.length > 0 && item.primary === null && !item.deferred) {
			consoleDebug('SpookCache.ensureActive: Activating...');
			if (item.owned) {
				console.error('SpookCache.ensureActive: INCONSISTENT. Cannot have no primary but be owned.');
			}
			if (this.deferParentPrefix && uuid.startsWith(this.deferParentPrefix)) {
				consoleDebug('SpookCache.ensureActive: deferring to parent frame', uuid);
				item.deferred = true;
				this.window.parent.postMessage({ useSpook: uuid }, '*');
			// One that we use - adopt it if necessary.
			} else {
				consoleDebug('SpookCache.ensureActive: One that we use - adopt it if necessary.', this.storage[key], this.sessionId);
				if (!this.storage[key]) {
					consoleDebug('SpookCache.ensureActive: No registered owner yet. Adopting');
					this.storage[key] = this.sessionId;
				}
				if (this.storage[key] === this.sessionId) {
					consoleDebug('SpookCache.ensureActive: We are responsible for this UUID - initialise');
					item.primary = item.users.pop();
					item.owned = true;
					item.primary.initialise();
				}
			}
		}
	}

	reconstruct (updateMessage, spook) {
		if (updateMessage.valueString) {
			return spook._parse(updateMessage.valueString);
		}
		return updateMessage.value;
	}

	onMessage (e) {
		//		console.log('Received message', e);
		if (this.window && e.source === this.window.parent) {
			// Comes from parent.
			//			console.log('Message is from parent');
			if (typeof e.data === 'object' && e.data !== null) {
				let up = e.data.spookCacheUpdate;
				if (up && this.regs[up.uuid]) {
					consoleDebug('SpookCache.onMessage: Spook cache update that we care about:', up.uuid);
					let item = this.regs[up.uuid];
					if (item.users.length > 0) {
						let value = this.reconstruct(up, item.users[0]);
						if (typeof value !== 'undefined') {
							consoleDebug('SpookCache.onMessage: Updating spook:', up.uuid, value, item.users);
							item.users.forEach(spook => spook.changed(value));
						} else {
							consoleDebug('SpookCache.onMessage: Resetting spook:', up.uuid, item.users);
							item.users.forEach(spook => spook.reset());
						}
					}
				}
			}
		}
	}

	onStorageChanged (e) {
		if (!e.key.startsWith('$_Spooks')) {
			return;
		}
		let uuid = e.key.substr(8);
		let item = this.regs[uuid];
		consoleDebug('SpookCache.onStorageChanged', uuid, item);
		if (!item) {
			return;
		}
		if (e.key[7] === '.') {
			// Spook changed...
			if (typeof (this.storage[e.key]) === 'undefined') {
				item.users.forEach(spook => spook.reset());
			} else {
				let v = item.parse(this.storage[e.key]);
				item.users.forEach(spook => spook.changed(v));
			}
		} else if (e.key[7] === '^') {
			// Owner going offline...
			this.ensureActive(uuid, e.key);
		}
	}

	onUnload () {
		consoleDebug('SpookCache.onUnload');
		// Like drop for all items, except that we don't care about usage; we
		// drop anyway.
		Object.keys(this.regs).forEach(uuid => {
			if (this.regs[uuid].deferred) {
				consoleDebug('SpookCache.onUnload: dropping deferral from parent frame', uuid);
				this.window.parent.postMessage({ dropSpook: uuid }, '*');
			} else {
				consoleDebug('SpookCache.onUnload: dropping ownership key from storage', uuid);
				let storageKey = '$_Spooks^' + uuid;
				let owner = this.storage[storageKey];
				if (owner === this.sessionId) {
					delete this.storage[storageKey];
				}
			}
		});
		this.regs = {};
	}
}

module.exports = SpookCache;
