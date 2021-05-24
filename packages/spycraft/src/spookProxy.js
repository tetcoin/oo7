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

// Prepare value `v` for being sent over `window.postMessage`.
function prepUpdate (uuid, spook) {
	let value = spook.isReady() ? spook._value : undefined;

	if (typeof value === 'object' && value !== null && spook._stringify) {
		return { uuid, valueString: spook._stringify(value) };
	}

	return { uuid, value };
}

class SpookProxy {
	constructor (deferParentPrefix, fromUuid, surrogateWindow = null) {
		this.spooks = {};
		this.deferParentPrefix = deferParentPrefix;
		this.fromUuid = fromUuid;
		this.window = surrogateWindow || (typeof window === 'undefined' ? null : window);

		// set up listener so that we get notified by our child.
		this.window.addEventListener('message', this.onMessage.bind(this));
	}

	onMessage (e) {
		if (e.source.parent !== this.window) {
			console.warn(`SpookProxy.onMessage: Unknown client at ${e.origin} attempting to message proxy with ${e.data}. Ignoring.`);
			return;
		}
		if (typeof e.data === 'object' && e.data !== null) {
			consoleDebug('SpookProxy.onMessage: Received message from child: ', e.data);
			if (e.data.helloSpookProxy) {
				e.source.postMessage({ spookProxyInfo: { deferParentPrefix: this.deferParentPrefix } }, '*');
			} else if (typeof e.data.useSpook === 'string') {
				let uuid = e.data.useSpook;
				let entry = this.spooks[uuid];
				consoleDebug('SpookProxy.onMessage: useSpook ', uuid, entry);
				if (entry) {
					// already here - increase refs.
					if (entry.users.indexOf(e.source) !== -1) {
						console.warn(`SpookProxy.onMessage: Source using UUID ${uuid} more than once.`);
					}
					consoleDebug('SpookProxy.onMessage: Another user');
					entry.users.push(e.source);
				} else {
					// create it.
					let newSpook = this.fromUuid(uuid);
					if (newSpook) {
						consoleDebug('SpookProxy.onMessage: Creating new spook');
						entry = this.spooks[uuid] = { spook: newSpook, users: [e.source] };
						entry.notifyKey = newSpook.notify(() => {
							let spookCacheUpdate = prepUpdate(uuid, newSpook);
							consoleDebug('SpookProxy.onMessage: Spook changed. Updating child:', spookCacheUpdate);
							entry.users.forEach(u =>
								u.postMessage({ spookCacheUpdate }, '*')
							);
						});
					} else {
						console.warn(`SpookProxy.onMessage: UUID ${uuid} is unknown - cannot create a Spook for it.`);
						e.source.postMessage({ spookUnknown: { uuid } }, '*');
						return;
					}
				}
				let spookCacheUpdate = prepUpdate(uuid, entry.spook);
				consoleDebug('SpookProxy.onMessage: Posting update back to child', spookCacheUpdate);
				e.source.postMessage({ spookCacheUpdate }, '*');
			} else if (typeof e.data.dropSpook === 'string') {
				let uuid = e.data.dropSpook;
				let entry = this.spooks[uuid];
				consoleDebug('SpookProxy.onMessage: dropSpook ', uuid, entry);
				if (entry) {
					let i = entry.users.indexOf(e.source);
					if (i !== -1) {
						consoleDebug('SpookProxy.onMessage: Removing child from updates list');
						entry.users.splice(i, 1);
					} else {
						console.warn(`SpookProxy.onMessage: Source asking to drop UUID ${uuid} that they do not track. They probably weren't getting updates.`);
					}
					if (entry.users.length === 0) {
						consoleDebug('SpookProxy.onMessage: No users - retiring spook');
						entry.spook.unnotify(entry.notifyKey);
						delete this.spooks[uuid];
					}
				} else {
					console.warn(`SpookProxy.onMessage: Cannot drop a Spook (${uuid}) that we do not track.`);
				}
			}
		}
	}
}

module.exports = SpookProxy;
