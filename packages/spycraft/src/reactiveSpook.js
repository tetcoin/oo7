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

/* Determines whether a `resolvable` value is actually resolved.
 * If true, then `resolvable` is not an unready {@link Spook} or
 * a {@link Promise}, nor is a possibly recursive structure that contains such
 * a thing up to a depth `depthLeft` into it.
 */
function isReady (resolvable, depthLeft) {
	if (typeof (resolvable) === 'object' && resolvable !== null) {
		if (Spook.instanceOf(resolvable)) { return resolvable._ready; } else if (resolvable instanceof Promise) { return typeof (resolvable._value) !== 'undefined'; } else if (depthLeft > 0 && resolvable.constructor === Array) { return resolvable.every(index => isReady(index, depthLeft - 1)); } else if (depthLeft > 0 && resolvable.constructor === Object) {
			return Object.keys(resolvable).every(key =>
				isReady(resolvable[key], depthLeft - 1)
			);
		} else { return true; }
	} else { return true; }
}

/* Determines whether a `value` is an array which has at least one item which is
 * either a {@link Spook} or a {@link Promise}, or, if `depthLeft` is greater
 * than 1, another array or object. Returns `false` if `depthLeft` is zero.
 */
function isArrayWithNonPlainItems (array, depthLeft) {
	return depthLeft > 0 &&
		array.constructor === Array &&
		(
			(depthLeft === 1 && array.findIndex(item =>
				Spook.instanceOf(item) ||
				item instanceof Promise
			) !== -1)		||
			(depthLeft > 1 && array.findIndex(item =>
				Spook.instanceOf(item) ||
				item instanceof Promise ||
				item instanceof Array ||
				item instanceof Object
			) !== -1)
		);
}

/* Determines whether a `value` is an object which has at least one item which is
 * either a {@link Spook} or a {@link Promise}, or, if `depthLeft` is greater
 * than 1, another array or object. Returns `false` if `depthLeft` is zero.
 */
function isObjectWithNonPlainItems (object, depthLeft) {
	return depthLeft > 0 &&
		object.constructor === Object &&
		(
			(depthLeft === 1 && Object.keys(object).findIndex(item =>
				Spook.instanceOf(object[item]) ||
				object[item] instanceof Promise
			) !== -1)		||
			(depthLeft > 1 && Object.keys(object).findIndex(item =>
				Spook.instanceOf(object[item]) ||
				object[item] instanceof Promise ||
				object[item] instanceof Array ||
				object[item] instanceof Object
			) !== -1)
		);
}

/* Returns the value represented by `resolvable`, resolving Spooks and
 * Promises as necessary up to a depth of `depthLeft`.
 */
function resolved (resolvable, depthLeft) {
	/* if (!isReady(resolvable, depthLeft)) {
		throw `Internal error: Unready value being resolved`;
	} */
	//	console.log(`resolvable info: ${resolvable} ${typeof(resolvable)} ${resolvable.constructor.name} ${JSON.stringify(resolvable)}; depthLeft: ${depthLeft}`);
	if (typeof (resolvable) === 'object' && resolvable !== null) {
		if (Spook.instanceOf(resolvable)) {
			if (resolvable._ready !== true) {
				throw new Error(`Internal error: Unready Spook being resolved`);
			}
			if (typeof (resolvable._value) === 'undefined') {
				throw new Error(`Internal error: Ready Spook with undefined value in resolved`);
			}
			//			console.log(`Spook: ${JSON.stringify(resolvable._value)}}`);
			return resolvable._value;
		} else if (resolvable instanceof Promise) {
			if (typeof (resolvable._value) === 'undefined') {
				throw new Error(`Internal error: Ready Promise has undefined value`);
			}
			//			console.log(`Promise: ${JSON.stringify(resolvable._value)}}`);
			return resolvable._value;
		} else if (isArrayWithNonPlainItems(resolvable, depthLeft)) {
			//			console.log(`Deep array...`);
			return resolvable.slice().map(item =>
				resolved(item, depthLeft - 1)
			);
		} else if (isObjectWithNonPlainItems(resolvable, depthLeft)) {
			var result = {};
			//			console.log(`Deep object...`);
			Object.keys(resolvable).forEach(key => {
				result[key] = resolved(resolvable[key], depthLeft - 1);
			});
			//			console.log(`...Deep object: ${JSON.stringify(o)}`);
			return result;
		} else {
			//			console.log(`Shallow object.`);
			return resolvable;
		}
	} else {
		//		console.log(`Basic value.`);
		return resolvable;
	}
}

/* Recurses up to `depthLeft` levels into the possibly deep structure
 * `resolvable`, placing a notify callback `callback` onto any `Spook`s found
 * and a then callback `callback` onto any `Promise`s found.
 * All resultant identifiers for the `notify` callbacks are added to `notifyKeys`s in
 * depth-first order of traveral of the possible deep structure `resolvable`.
 *
 * Returns `true` if there were any `Spook`s or `Promise`s encountered.
 */
function deepNotify (resolvable, callback, notifyKeys, depthLeft) {
//	console.log(`Setitng up deep notification on object: ${JSON.stringify(resolvable)} - ${typeof(resolvable)}/${resolvable === null}/${resolvable.constructor.name} (depthLeft: ${depthLeft})`);
	if (typeof (resolvable) === 'object' && resolvable !== null) {
		if (Spook.instanceOf(resolvable)) {
			notifyKeys.push(resolvable.notify(callback));
			return true;
		} else if (resolvable instanceof Promise) {
			resolvable.then(resolved => {
				resolvable._value = resolved;
				callback();
			});
			return true;
		} else if (isArrayWithNonPlainItems(resolvable, depthLeft)) {
			let result = false;
			resolvable.forEach(item => {
				result = deepNotify(item, callback, notifyKeys, depthLeft - 1) || result;
			});
			return result;
		} else if (isObjectWithNonPlainItems(resolvable, depthLeft)) {
			let result = false;
			Object.keys(resolvable).forEach(key => {
				result = deepNotify(resolvable[key], callback, notifyKeys, depthLeft - 1) || result;
			});
			return result;
		} else {
			return false;
		}
	} else {
		return false;
	}
}

/* Recurses up to `depthLeft` levels into the possibly deep structure
 * `resolvable`, placing an unnotify call onto any `Spook`s found, using
 * `notifyKeys` as the depth-first sequence of notify key identifiers.
 */
function deepUnnotify (resolvable, notifyKeys, depthLeft) {
	if (typeof (resolvable) === 'object' && resolvable !== null) {
		if (Spook.instanceOf(resolvable)) {
			resolvable.unnotify(notifyKeys.shift());
			return true;
		} else if (isArrayWithNonPlainItems(resolvable, depthLeft)) {
			let result = false;
			resolvable.forEach(item => {
				result = deepUnnotify(item, notifyKeys, depthLeft - 1) || result;
			});
			return result;
		} else if (isObjectWithNonPlainItems(resolvable, depthLeft)) {
			let result = false;
			Object.keys(resolvable).forEach(key => {
				result = deepUnnotify(resolvable[key], notifyKeys, depthLeft - 1) || result;
			});
			return result;
		} else {
			return false;
		}
	} else {
		return false;
	}
}

/**
 * @summary A {@link Spook} which retains dependencies on other {@link Spook}s.
 * @description This inherits from the {@link Spook} class, providing its full API,
 * but also allows for dependencies to other `Spook`s to be registered. When
 * any dependency changes value (or _readiness_), a callback is executed and
 * is passed the new set of underlying values corresponding to each dependency.
 *
 * The callback is made if and only if this object is in use (i.e. {@link Spook#use}
 * or one of its dependents has been called).
 */
class ReactiveSpook extends Spook {
	/**
	 * Constructs a new object.
	 *
	 * @param {array} args - Each item that this object's representative value
	 * is dependent upon, and which needs to be used by the callback function
	 * (presumably to determine that value to be passed into {@link Spook#changed}).
	 * @param {array} dependencies - {@link Spook}s or {Promise}s that the representative
	 * value is dependent on, but which are not needed for passing into the
	 * callback.
	 * @param {function} execute - The callback function which is called when
	 * any item of `args` or `deps` changes its underlying value. A value corresponding
	 * to each item in `args` are passed to the callback:
	 * items that are {@link Spook}s are resolved to the value they represent before
	 * being passed into the callback `execute` function. {Promise} objects are
	 * likewise resolved for their underlying value. Structures such as arrays
	 * and objects are traversed recursively and likewise interpreted. Other
	 * types are passed straight through.
	 * The callback is only made when all items of `args` are considered _ready_.
	 * @param {boolean} mayBeNull - Noramlly, `null` is a valid value for dependent `Spook`s
	 * and `Promise`s to represent. Pass `false` here to disallow `null` to be
	 * considered valid (and thus any `null` dependencies in `args` will mean that
	 * dependency is considered not _ready_ and no callback will happen).
	 * @defaultValue true
	 * @param {number} resolveDepth - The maximum number of times to recurse into
	 * arrays or objects of `args` items in searching for {@link Spook}s or {Promise}s
	 * to resolve.
	 * @defaultValue 1
	 */
	constructor (
		args,
		dependencies,
		execute,
		mayBeNull = true,
		resolveDepth = 3,
		cache = { id: null, stringify: JSON.stringify, parse: JSON.parse }
	) {
		super(mayBeNull, cache);

		this._execute = (execute ? typeof execute === 'object' ? execute.ready : execute : this.changed).bind(this);
		this._executeReset = (execute && typeof execute === 'object' ? execute.reset : this.reset).bind(this);
		this._active = false;
		this._dependencies = dependencies.slice();
		this._args = args.slice();
		this._resolveDepth = resolveDepth;
	}

	_notified () {
		//		console.log(`Polling ReactiveSpook with resolveDepth ${resolveDepth}`);
		if (this._args.every(item => isReady(item, this._resolveDepth))) {
			//			console.log(`poll: All dependencies good...`, a, resolveDepth);
			let resolvedArgs = this._args.map(argument =>
				resolved(argument, this._resolveDepth)
			);
			//			console.log(`poll: Mapped dependencies:`, am);
			this._execute(resolvedArgs);
		} else {
			//			console.log("poll: One or more dependencies undefined");
			this._executeReset();
		}
	}

	// TODO: implement isDone.
	initialise () {
		//		console.log(`Initialising ReactiveSpook for resolveDepth ${this.resolveDepth}`);
		this._notifyKeys = [];
		this._dependencies.forEach(dependency =>
			this._notifyKeys.push(dependency.notify(this._notified.bind(this)))
		);

		// true if any of our args are/contain Spooks/Promises.
		var active = false;
		this._args.forEach(argument => {
			if (deepNotify(
				argument,
				this._notified.bind(this),
				this._notifyKeys,
				this._resolveDepth
			)) {
				active = true;
			}
		});

		// no active args, no dependencies - nothing will happen. make the
		// _notified call now.
		if (!active && this._dependencies.length === 0) {
			this._notified();
		}
	}

	finalise () {
		//		console.log(`Finalising ReactiveSpook with resolveDepth ${this.resolveDepth}`);
		this._dependencies.forEach(dependency =>
			dependency.unnotify(this._notifyKeys.shift())
		);
		this._args.forEach(argument =>
			deepUnnotify(argument, this._notifyKeys, this._resolveDepth)
		);
	}
}

module.exports = ReactiveSpook;
