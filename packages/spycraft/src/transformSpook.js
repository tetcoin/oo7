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
const ReactiveSpook = require('./reactiveSpook');

let defaultContext = typeof (global.parity) === 'undefined' ? null : global.parity.api;

/* Determines whether a `value` is not a {@link Spook} or
 * a {@link Promise}, nor a possibly recursive structure that contains such
 * a thing up to a depth `depthLeft` into it.
 */
function isPlain (value, depthLeft) {
	if (typeof (value) !== 'object' || value === null) {
		return true;
	}

	if (Spook.instanceOf(value)) {
		return false;
	}

	if (value instanceof Promise) {
		return false;
	}

	if (depthLeft > 0 && value.constructor === Array) {
		return value.every(index => isPlain(index, depthLeft - 1));
	}

	if (depthLeft > 0 && value.constructor === Object) {
		return Object.keys(value).every(key =>
			isPlain(value[key], depthLeft - 1)
		);
	}

	return true;
}

/**
 * @summary Configurable {@link Spook}-derivation representing a functional transformation
 * of a number of other items.
 * @description This is the underlying class which powers the {@link Spook#map} and {@link Spook#mapAll}
 * functions; you'll generally want to use those unless there is some particular
 * aspect of this class's configurability that you need.
 *
 * It is constructed with a transform function and a number of args; this
 * {@link Spook} represents the result of the function when applied to those arguemnts'
 * representative values. `Spook`s and `Promises`, are resolved automatically at
 * a configurable depth within complex structures, both as input items and
 * the value resulting from the transform function.
 */
class TransformSpook extends ReactiveSpook {
	/**
	 * Constructs a new object.
	 *
	 * @param {function} transform - The transformation function. It is called with
	 * values corresponding (in order) to the items of `args`. It may return a
	 * {@link Spook}, {Promise} or plain value resolving to representative values.
	 * @param {array} args - A list of items whose representative values should be
	 * passed to `transform`.
	 * @defaultValue [].
	 * @param {array} dependencies - A list of {@link Spook}s on which `transform` indirectly
	 * depends.
	 * @defaultValue [].
	 * @param {number} outResolveDepth - The depth in any returned structure
	 * that a {@link Spook} may be for it to be resolved.
	 * @defaultValue 0.
	 * @param {number} resolveDepth - The depth in a structure (array or object)
	 * that a {@link Spook} may be in any of `args`'s items for it to be resolved
	 * (in place) to its representative value. Beyond this depth, {@link Spook}s amd
	 * {Promise}s will be left alone.
	 * @defaultValue 1.
	 * @param {number} latched - If `false`, this object becomes _not ready_ as
	 * long as there is an output value waiting for resolution.
	 * @defaultValue `true`
	 * @param {boolean} mayBeNull - If `false`, a resultant value of `null` from
	 * `transform` causes this {@link Spook} to become _not ready_. Optional.
	 * @defaultValue `true`
	 * @param {object} context - The context (i.e. `this` object) that `transform`
	 * is bound to. Optional; defaults to the value set by {@link setDefaultTransformSpookContext}.
	 * @defaultValue `null`
	 */
	constructor (
		transform,
		args = [],
		dependencies = [],
		outResolveDepth = 3,
		resolveDepth = 3,
		cache = { id: null, stringify: JSON.stringify, parse: JSON.parse },
		latched = false,
		mayBeNull = true,
		context = defaultContext
	) {
		super(args, dependencies, function (resolvedArguments) {
			//			console.log(`Applying: ${JSON.stringify(args)}`);
			// Cancel any previous result-resolving.
			this.dropOut();

			// Apply transform to the resolved argument values.
			let result = transform.apply(context, resolvedArguments);

			// Assue an undefined result means "reset".
			if (typeof (result) === 'undefined') {
				console.warn(`Transformation returned undefined: Applied ${transform} to ${JSON.stringify(resolvedArguments)}.`);
				this.reset();
			} else if (result instanceof Promise) {
				// If we're not latching, we reset while we resolve the
				// resultant promise.
				if (!latched) {
					this.reset();
				}
				// Then resolve the Promise; by calling `changed`, we recurse
				// as necessary.
				result.then(this.changed.bind(this));
			} else if (!isPlain(result, outResolveDepth)) {
				//				console.log(`Using ReactiveSpook to resolve and trigger non-plain result (at depth ${outResolveDepth})`);
				// If we're not latching, we reset while we resolve the
				// resultant Spook(s)/Promise(s).
				if (!latched) {
					this.reset();
				}
				// Then create a new `Spook` which we own to maintain the
				// resultant complex resolvable structure.
				this.useOut(new ReactiveSpook([result], [], ([resolvedResult]) => {
					//					console.log(`Resolved results: ${JSON.stringify(v)}. Triggering...`);
					// Call `changed` to recurse as neccessary.
					this.changed.bind(this)(resolvedResult);
				}, false, outResolveDepth));
			} else {
				// Nothing special here - just call changed with the result.
				this.changed(result);
			}
		}, mayBeNull, resolveDepth, cache);

		// the current Spook used to resolve the result (output) value if the
		// result of our transform is itself a Spook.
		this._outSpook = null;
	}

	// Register `newOutSpook` as our result-resolving spook. Ensures it knows
	// we depend on it via `use`.
	useOut (newOutSpook) {
		this._outSpook = newOutSpook.use();
	}

	// Unregister our current result-resolving spook. Ensures it knows
	// we no longer depend on it via `drop`.
	dropOut () {
		if (this._outSpook !== null) {
			this._outSpook.drop();
		}
		this._outSpook = null;
	}

	// If nobody depends on us (anymore), then drop our result-resolving Spook.
	finalise () {
		this.dropOut();
		ReactiveSpook.prototype.finalise.call(this);
	}

	/**
	 * Set the default context under which {@link Spook} transformations run.
	 *
	 * @see {@link Spook#map} {@link Spook#mapAll} {@link TransformSpook}
	 */
	static setDefaultContext (c) {
		defaultContext = c;
	}
}

module.exports = TransformSpook;
