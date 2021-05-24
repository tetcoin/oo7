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

const Spook = require('./spook');

/**
 * Derivative {@link Spook} representing the non-readiness of another {@link Spook}.
 */
class NotReadySpook extends Spook {
	constructor (targetSpook) {
		super(false);

		this._poll = () => this.changed(!targetSpook._ready);
		this._targetSpook = targetSpook;
	}

	initialise () {
		this._notifyId = this._targetSpook.notify(this._poll);
		this._poll();
	}

	finalise () {
		this._targetSpook.unnotify(this._notifyId);
	}
}

module.exports = NotReadySpook;
