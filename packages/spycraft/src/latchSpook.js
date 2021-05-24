// (C) Copyright 2016-2017 Parity Technologies (UK) Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License")
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

const Spook = require('./spook');

/**
 * Derivative {@link Spook} resolving to a default value when not ready.
 * Once inputSpook is ready, its value remains fixed indefinitely.
 */
class LatchSpook extends Spook {
	constructor (targetSpook, def = undefined, mayBeNull = undefined, cache = null) {
		super(typeof mayBeNull === 'undefined' ? targetSpook._mayBeNull : mayBeNull, cache);

		if (typeof (def) !== 'undefined') {
			this._ready = true;
			this._value = def;
		}

		let that = this;
		this._targetSpook = targetSpook;
		this._poll = () => {
			if (that._targetSpook) {
				if (that._targetSpook._ready) {
					that.changed(targetSpook._value);
					if (that._notifyId) {
						that._targetSpook.unnotify(that._notifyId);
						delete that._targetSpook;
					}
					delete that._poll;
				}
			} else {
				console.warn('poll called when targetSpook is not set. This cannot happen.');
			}
		};
	}

	initialise () {
		if (this._poll) {
			let notifyId = this._targetSpook.notify(this._poll);
			// line above might have killed it (if the target is already ready):
			// we should only save it that wasn't the case
			if (this._poll) {
				// It didn't delete it. Carry on.
				this._notifyId = notifyId;
				this._poll();
			} else {
				// It did delete it; unnotify immediately.
				this._targetSpook.unnotify(notifyId);
				delete this._targetSpook;
			}
		}
	}

	finalise () {
		if (this._targetSpook) {
			this._targetSpook.unnotify(this._notifyId);
		}
	}
}

module.exports = LatchSpook;
