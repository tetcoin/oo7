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

const SpookCache = require('./spookCache');

var subscripted = {};
// Any names which should never be subscripted.
const reservedNames = { toJSON: true, toString: true, subscription: true };

function symbolValues (o) {
	return Object.getOwnPropertySymbols(o).map(k => o[k]);
}

function equivalent (a, b) {
	return JSON.stringify(a) === JSON.stringify(b);
}

let globalCount = 0;

/**
 * An object which tracks a single, potentially variable, value.
 * {@link Spook}s may be updated to new values with {@link Spook#changed} and reset to an indeterminate
 * ("not ready") value with {@link Spook#reset}.
 *
 * {@link Spook}s track their dependents - aspects of the program, including other {@link Spook}s,
 * which reference their current value. Dependents may be added with {@link Spook#use} and
 * removed with {@link Spook#drop}.
 *
 * A {@link Spook} may be tied to a particular function to ensure it is called whenever
 * the value changes. This implies a dependency, and can be registered with {@link Spook#tie} and
 * dropped with {@link Spook#untie}. A function may also be called should the {@link Spook} be reverted
 * to an undefined value; in this case {@link Spook#notify} and {@link Spook#unnotify} should
 * be used.
 *
 * {@link Spook}s can be made to execute a function once their value becomes ready
 * using {@link Spook#then}, which in some sense replicates the same function in the
 * context of a `Promise`. The similar function {@link Spook#done} is also supplied which
 * executes a given function when the {@link Spook} reaches a value which is considered
 * "final", determined by {@link Spook#isDone} being implemented and `true`. Precisely
 * what any given {@link Spook} considers final depends entirely on the subclass of
 * {@link Spook}; for the {@link Spook} class itself, `isDone` always returns `false` and thus
 * {@link Spook#done} is unusable. The value of the {@link Spook}, once _ready_, may
 * be logged to the console with the {@link Spook#log} function.
 *
 * A {@link Spook} can provide a derivative {@link Spook} whose value reflects the "readiness"
 * of the original, using {@link Spook#ready} and conversely {@link Spook#notReady}. This
 * can also be queried normally with {@link Spook#isReady}.
 *
 * One or a number of {@link Spook}s can be converted into a single {Promise} with the
 * {@link Spook#promise} function.
 *
 * `Spooks` can be composed. {@link Spook#map} creates a new {@link Spook} whose value is a
 * transformation. {@link Spook.all} creates a new {@link Spook} which evaluates to the array
 * of values of each of a number of dependent {@link Spook}s. {@link Spook.mapAll} combines
 * both. {@link Spook#reduce} allows a {@link Spook} that evaluates to array to be
 * transformed into some other value recursively.
 *
 * {@link Spook#sub} forms a derivative {@link Spook} as the subscript (square-bracket
 * indexing). {@link Spook#subscriptable} may be used to return a `Proxy` object that
 * allows the {@link Spook} to be subscripted (square-bracket indexed) directly without
 * need of the {@link Spook#sub} function.
 *
 * {@link Spook} is built to be subclassed. When subclassing, three functions are
 * useful to implement. {@link Spook#isDone} may be implemented
 * in order to make {@link Spook#done} be useful. {@link Spook#initialise} is called exactly once
 * when there becomes at least one dependent; {@link Spook#finalise} is called when there
 * are no longer any dependents.
 *
 * _WARNING_: You should not attempt to use the `toString` function with this
 * class. It cannot be meaningfully converted into a string, and to attempt it
 * will give an undefined result.
 */
class Spook {
	/**
	 * Constructs a new {@link Spook} object whose value is _not ready_.
	 *
	 * @param {boolean} mayBeNull - `true` if this instance's value may ever
	 * validly be `null`. If `false`, then setting this object's value to `null`
	 * is equivalent to reseting back to being _not ready_.
	 */
	constructor (mayBeNull = true, cache = null) {
		this._uid = globalCount++;
		// Functions that should execute whenever we resolve to a new, "ready"
		// value. They are passed the new value as a single parameter.
		// Each function is mapped to from a `Symbol`, which can be used to
		// remove it.
		this._subscribers = {};
		// Equivalent to `_subscribers`, except that after executing, the
		// function is removed from this array. No mapping is provided so they
		// cannot be removed except by triggering.
		this._thens = [];
		// Functions that should execute whenever either the resolved value
		// changes, or our readiness changes. No parameters are passed.
		// Each function is mapped to from a `Symbol`, which can be used to
		// remove it.
		this._notifies = {};

		// Are we resolved to a value at all. If `false`, we are not yet
		// resolved to a value and `_value` is meaningless.
		this._ready = false;
		// Our currently resolved value, if any.
		this._value = null;
		// Is the value in the middle of having an update triggered?
		this._triggering = null;

		// Is it valid to resolve to `null`? By default it is value.
		this._mayBeNull = mayBeNull;

		// The reference count of the number of dependents. If zero, then there
		// is no need to go to any effort to track changes. This is used for
		// specialisations where tracking changes requires holding or managing
		// resources.
		// This is never smaller but can be larger than the total number of
		// callbacks registered between `_subscribers`, `_thens` and
		// `_notifies`.
		this._users = 0;

		// The Universally Unique ID, a string used to manage caching and
		// inter-tab result sharing.
		this._uuid = cache ? cache.id : null;
		// A method for stringifying this Spook's result when using with the cache.
		this._stringify = cache ? cache.stringify : null;
		// A method for unstringifying this Spook's result when using with the cache.
		this._parse = cache ? cache.parse : null;
	}

	toString () {
		// Spooks make little sense as strings, and our subscripting trick (where
		// we are able to use Spooks as keys) only works if we can coerce into a
		// string. We store the reverse lookup (symbol -> Spook) in a global
		// table `subscripted` so that it can be retrieved while interpreting
		// the subscript in the code Proxy code found in `subscriptable`.
		let s = Symbol('Spook');
		subscripted[s] = this;
		return s;
	}

	/**
	 * Provides a transparently subscriptable version of this object.
	 *
	 * The object that is returned from this function is a convenience `Proxy`
	 * which acts exactly equivalent
	 * to the original {@link Spook}, except that any subscripting of fields that are
	 * not members of the {@link Spook} object will create a new {@link Spook} that
	 * itself evaluates to this {@link Spook}'s value when subscripted with the same
	 * field.
	 *
	 * @example
	 * let x = (new Spook).subscriptable();
	 * let y = x.foo;
	 * y.log(); // nothing yet
	 * x.changed({foo: 42, bar: 69});	// logs 42
	 *
	 * @param {number} depth - The maximum number of levels of subscripting that
	 * the returned `Proxy` will support.
	 * @returns {Proxy} - `Proxy` object that acts as a subscriptable variation
	 * for convenience.
	 */
	subscriptable (depth = 1) {
		// No subscripting at all if depth is 0.
		// We will recurse if > 1.
		if (depth === 0) { return this; }

		let r = new Proxy(this, {
			// We proxy the get object field:
			get (receiver, name) {
				// Skip the magic proxy and just interpret directly if the field
				// name is a string/number and it's either an extent key in the
				// underlying `Spook` or it's a reserved field name (e.g. toString).
				if (
					(typeof (name) === 'string' || typeof (name) === 'number')				&&
					(reservedNames[name] || typeof (receiver[name]) !== 'undefined')
				) {
					return receiver[name];
				}

				// If it's a symbolic key, then it's probably a `Spook` symbolified
				// in our toString function. Look it up in the global Spook symbol
				// table and recurse into one less depth.
				if (typeof (name) === 'symbol') {
					if (Spook._knowSymbol(name)) {
						return receiver
							.sub(Spook._fromSymbol(name))
							.subscriptable(depth - 1);
					} else {
						//						console.warn(`Unknown symbol given`);
						return null;
					}
				}
				// console.log(`Subscripting: ${JSON.stringify(name)}`)
				// Otherwise fall back with a simple subscript and recurse
				// back with one less depth.
				return receiver.sub(name).subscriptable(depth - 1);
			}
		});
		return r;
	}

	// Check to see if there's a symbolic reference for a Spook.
	static _knowSymbol (name) {
		return !!subscripted[name];
	}
	// Lookup a symbolic Spook reference and remove it from the global table.
	static _fromSymbol (name) {
		let sub = subscripted[name];
		delete subscripted[name];
		return sub;
	}

	/**
	 * Alters this object so that it is always _ready_.
	 *
	 * If this object is ever {@link Spook#reset}, then it will be changed to the
	 * value given.
	 *
	 * @example
	 * let x = (new Spook).defaultTo(42);
	 * x.log();	// 42
	 * x.changed(69);
	 * x.log();	// 69
	 * x.reset();
	 * x.log() // 42
	 *
	 * @param {*} x - The value that this object represents if it would otherwise
	 * be _not ready_.
	 * @returns {@link Spook} - This (mutated) object.
	 */
	defaultTo (_defaultValue) {
		this._defaultTo = _defaultValue;
		if (!this._ready) {
			this.trigger(_defaultValue);
		}
		return this;
	}

	/**
	 * Resets the state of this Spook into being _not ready_.
	 *
	 * Any functions that are registered for _notification_ (see {@link Spook#notify})
	 * will be called if this {@link Spook} is currently _ready_.
	 */
	reset () {
		if (this._defaultTo !== undefined) {
			this.trigger(this._defaultTo);
			return;
		}
		if (this._ready) {
			this._ready = false;
			this._value = null;
			symbolValues(this._notifies).forEach(callback => callback());
		}
	}
	/**
	 * Makes the object _ready_ and sets its current value.
	 *
	 * Any functions that are registered for _notification_ (see {@link Spook#notify})
	 * or are _tied_ (see {@link Spook#tie}) will be called if this {@link Spook} is not
	 * currently _ready_ or is _ready_ but has a different value.
	 *
	 * This function is a no-op if the JSON representations of `v` and of the
	 * current value, if any, are equal.
	 *
	 * @param {*} v - The new value that this object should represent. If `undefined`
	 * then the function does nothing.
	 */
	changed (newValue) {
		if (typeof (newValue) === 'undefined') {
			return;
		}
		//		console.log(`maybe changed (${this._value} -> ${v})`);
		if (!this._mayBeNull && newValue === null) {
			this.reset();
		} else if (!this._ready || !equivalent(newValue, this._value)) {
			this.trigger(newValue);
		}
	}

	/**
	 * Makes the object _ready_ and sets its current value.
	 *
	 * Any functions that are registered for _notification_ (see {@link Spook#notify})
	 * or are _tied_ (see {@link Spook#tie}) will be called if this {@link Spook} is not
	 * currently _ready_ or is _ready_ but has a different value.
	 *
	 * Unlike {@link Spook#changed}, this function doesn't check equivalence
	 * between the new value and the current value.
	 *
	 * @param {*} v - The new value that this object should represent. By default,
	 * it will reissue the current value. It is an error to call it without
	 * an argument if it is not _ready_.
	 */
	trigger (newValue = this._value) {
		// Cannot trigger to an undefined value (just reset it or call with `null`).
		if (typeof (newValue) === 'undefined') {
			console.error(`Trigger called with undefined value`);
			return;
		}
		// Cannot trigger as a recourse to an existing trigger.
		if (this._triggering !== null) {
			console.error(`Trigger cannot be called while already triggering.`, this._triggering.becoming, newValue);
			return;
		}
		this._triggering = { becoming: newValue };

		if (!this._mayBeNull && newValue === null) {
			this.reset();
		} else {
			//			console.log(`firing (${JSON.stringify(v)})`);
			this._ready = true;
			this._value = newValue;
			symbolValues(this._notifies).forEach(callback => callback());
			symbolValues(this._subscribers).forEach(callback => callback(this._value));
			this._thens.forEach(callback => {
				callback(this._value);
				this.drop();
			});
			this._thens = [];
		}

		this._triggering = null;

		if (this._uuid && !this._noCache && Spook.cache) {
			Spook.cache.changed(this._uuid, newValue);
		}
	}

	/**
	 * Register a single dependency for this object.
	 *
	 * Notes that the object's value is in use, and that it should be computed.
	 * {@link Spook} sub-classes are allowed to not work properly unless there is
	 * at least one dependency registered.
	 *
	 * @see {@link Spook#initialise}, {@link Spook#finalise}.
	 */
	use () {
		if (this._users === 0) {
			if (!this._uuid || !!this._noCache || !Spook.cache) {
				this.initialise();
			} else {
				Spook.cache.initialise(this._uuid, this, this._stringify, this._parse);
			}
		}
		this._users++;
		return this;
	}

	/**
	 * Unregister a single dependency for this object.
	 *
	 * Notes that a previously registered dependency has since expired. Must be
	 * called exactly once for each time {@link Spook#use} was called.
	 */
	drop () {
		if (this._users === 0) {
			throw new Error(`mismatched use()/drop(): drop() called once more than expected!`);
		}
		this._users--;
		if (this._users === 0) {
			if (!this._uuid || !!this._noCache || !Spook.cache) {
				this.finalise();
			} else {
				Spook.cache.finalise(this._uuid, this);
			}
		}
	}

	/**
	 * Initialise the object.
	 *
	 * Will be called at most once before an accompanying {@link Spook#finalise}
	 * and should initialise/open/create any resources that are required for the
	 * sub-class to maintain its value.
	 *
	 * @access protected
	 */
	initialise () {}

	/**
	 * Uninitialise the object.
	 *
	 * Will be called at most once after an accompanying {@link Spook#initialise}
	 * and should close/finalise/drop any resources that are required for the
	 * sub-class to maintain its value.
	 *
	 * @access protected
	 */
	finalise () {}

	/**
	 * Returns whether the object is currently in a terminal state.
	 *
	 * _WARNING_: The output of this function should not change outside of a
	 * value change. If it ever changes without the value changing, `trigger`
	 * should be called to force an update.
	 *
	 * @returns {boolean} - `true` when the value should be interpreted as being
	 * in a final state.
	 *
	 * @access protected
	 * @see {@link Spook#done}
	 */
	isDone () { return false; }

	/**
	 * Notification callback.
	 * @callback Spook~notifyCallback
	 */

	/**
	 * Register a function to be called when the value or the _readiness_
	 * changes.
	 *
	 * Calling this function already implies calling {@link Spook#use} - there
	 * is no need to call both.
	 *
	 * Use this only when you need to be notified should the object be reset to
	 * a not _ready_ state. In general you will want to use {@link Spook#tie}
	 * instead.
	 *
	 * @param {Spook~notifyCallback} f - The function to be called. Takes no parameters.
	 * @returns {Symbol} An identifier for this registration. Must be provided
	 * to {@link Spook#unnotify} when the function no longer needs to be called.
	 */
	notify (callback) {
		this.use();
		let id = Symbol('notify::id');
		this._notifies[id] = callback;
		if (this._ready) {
			callback();
		}
		return id;
	}

	/**
	 * Unregister a function previously registered with {@link Spook#notify}.
	 *
	 * Calling this function already implies calling {@link Spook#drop} - there
	 * is no need to call both.
	 *
	 * @param {Symbol} id - The identifier returned from the corresponding
	 * {@link Spook#notify} call.
	 */
	unnotify (id) {
		if (this._notifies[id]) {
			delete this._notifies[id];
			this.drop();
		} else {
			console.warn('untie on from old or non-existent notifyee ID');
		}
	}

	/**
	 * Tie callback.
	 * @callback Spook~tieCallback
	 * @param {&} value - The current value to which the object just changed.
	 * @param {Symbol} id - The identifier of the registration for this callback.
	 */

	/**
	 * Register a function to be called when the value changes.
	 *
	 * Calling this function already implies calling {@link Spook#use} - there
	 * is no need to call both.
	 *
	 * Unlike {@link Spook#notify}, this does not get
	 * called should the object become reset into being not _ready_.
	 *
	 * @param {Spook~tieCallback} f - The function to be called.
	 * @returns {Symbol} - An identifier for this registration. Must be provided
	 * to {@link Spook#untie} when the function no longer needs to be called.
	 */
	tie (callback) {
		this.use();
		let id = Symbol('tie::id');
		this._subscribers[id] = callback;
		if (this._ready) {
			callback(this._value, id);
		}
		return id;
	}

	/**
	 * Unregister a function previously registered with {@link Spook#tie}.
	 *
	 * Calling this function already implies calling {@link Spook#drop} - there
	 * is no need to call both.
	 *
	 * @param {Symbol} id - The identifier returned from the corresponding
	 * {@link Spook#tie} call.
	 */
	untie (id) {
		if (this._subscribers[id]) {
			delete this._subscribers[id];
			this.drop();
		} else {
			console.warn('untie on from old or non-existent subscriber ID');
		}
	}

	/**
	 * Determine if there is a definite value that this object represents at
	 * present.
	 *
	 * @returns {boolean} - `true` if there is presently a value that this object represents.
	 */
	isReady () { return this._ready; }

	/**
	 * Provide a derivative {@link Spook} which represents the same as this object
	 * except that before it is ready it evaluates to a given default value and
	 * after it becomes ready for the first time it stays fixed to that value
	 * indefinitely.
	 *
	 * @param {Symbol} defaultValue - The value that the new spook should take when
	 * this spook is not ready.
	 * @returns {@link Spook} - Object representing the value returned by
	 * this {@link Spook} except that it evaluates to the given default value when
	 * this spook is not ready and sticks to the first value that made it ready.
	 */
	latched (defaultValue = undefined, mayBeNull = undefined, cache = null) {
		const LatchSpook = require('./latchSpook');

		return new LatchSpook(
			this,
			typeof defaultValue === 'undefined' ? undefined : defaultValue,
			typeof mayBeNull === 'undefined' ? undefined : mayBeNull,
			cache
		);
	}

	/**
	 * Provide a {@link Spook} which represents the same as this object except that
	 * it takes a particular value when this would be unready.
	 *
	 * @param {Symbol} defaultValue - The value that the new spook should take when
	 * this spook is not ready.
	 * @returns {@link Spook} - Object representing the value returned by
	 * this {@link Spook} except that it evaluates to the given default value when
	 * this spook is not ready. The returned object itself is always _ready_.
	 */
	default (defaultValue = null) {
		const DefaultSpook = require('./defaultSpook');

		return new DefaultSpook(defaultValue, this);
	}

	/**
	 * Provide a {@link Spook} which represents whether this object itself represents
	 * a particular value.
	 *
	 * @returns {@link Spook} - Object representing the value returned by
	 * this {@link Spook}'s {@link Spook#isReady} result. The returned object is
	 * itself always _ready_.
	 */
	ready () {
		const ReadySpook = require('./readySpook');

		if (!this._readySpook) {
			this._readySpook = new ReadySpook(this);
		}
		return this._readySpook;
	}

	/**
	 * Convenience function for the logical negation of {@link Spook#ready}.
	 *
	 * @example
	 * // These two expressions are exactly equivalent:
	 * spook.notReady();
	 * spook.ready().map(_ => !_);
	 *
	 * @returns {@link Spook} Object representing the logical opposite
	 * of the value returned by
	 * this {@link Spook}'s {@link Spook#isReady} result. The returned object is
	 * itself always _ready_.
	 */
	notReady () {
		const NotReadySpook = require('./notReadySpook');

		if (!this._notReadySpook) {
			this._notReadySpook = new NotReadySpook(this);
		}
		return this._notReadySpook;
	}

	/**
	 * Then callback.
	 * @callback Spook~thenCallback
	 * @param {*} value - The current value to which the object just changed.
	 */

	/**
	 * Register a function to be called when this object becomes _ready_.
	 *
	 * For an object to be considered _ready_, it must represent a definite
	 * value. In this case, {@link Spook#isReady} will return `true`.
	 *
	 * If the object is already _ready_, then `f` will be called immediately. If
	 * not, `f` will be deferred until the object assumes a value. `f` will be
	 * called at most once.
	 *
	 * @param {Spook~thenCallback} f The callback to be made once the object is ready.
	 *
	 * @example
	 * let x = new Spook;
	 * x.then(console.log);
	 * x.changed(42); // 42 is written to the console.
	 */
	then (callback) {
		this.use();
		if (this._ready) {
			callback(this._value);
			this.drop();
		} else {
			this._thens.push(callback);
		}
		return this;
	}

	/**
	 * Register a function to be called when this object becomes _done_.
	 *
	 * For an object to be considered `done`, it must be _ready_ and the
	 * function {@link Spook#isDone} should exist and return `true`.
	 *
	 * If the object is already _done_, then `f` will be called immediately. If
	 * not, `f` will be deferred until the object assumes a value. `f` will be
	 * called at most once.
	 *
	 * @param {Spook~thenCallback} f The callback to be made once the object is ready.
	 *
	 * @example
	 * let x = new Spook;
	 * x.then(console.log);
	 * x.changed(42); // 42 is written to the console.
	 */
	done (callback) {
		if (this.isDone === undefined) {
			throw new Error('Cannot call done() on Spook that has no implementation of isDone.');
		}
		var id;
		let cleanupCallback = newValue => {
			if (this.isDone(newValue)) {
				callback(newValue);
				this.untie(id);
			}
		};
		id = this.tie(cleanupCallback);
		return this;
	}

	/**
	 * Logs the current value to the console.
	 *
	 * @returns {@link Spook} The current object.
	 */
	log () { this.then(console.log); return this; }

	/**
	 * Maps the represented value to a string.
	 *
	 * @returns {@link Spook} A new {link Spook} which represents the `toString`
	 * function on whatever value this {@link Spook} represents.
	 */
	mapToString () {
		return this.map(_ => _.toString());
	}

	/**
	 * Make a new {@link Spook} which is the functional transformation of this object.
	 *
	 * @example
	 * let b = new Spook;
	 * let t = b.map(_ => _ * 2);
	 * t.tie(console.log);
	 * b.changed(21); // logs 42
	 * b.changed(34.5); // logs 69
	 *
	 * @example
	 * let b = new Spook;
	 * let t = b.map(_ => { let r = new Spook; r.changed(_ * 2); return r; });
	 * t.tie(console.log);
	 * b.changed(21); // logs 42
	 * b.changed(34.5); // logs 69
	 *
	 * @example
	 * let b = new Spook;
	 * let t = b.map(_ => { let r = new Spook; r.changed(_ * 2); return [r]; }, 1);
	 * t.tie(console.log);
	 * b.changed(21); // logs [42]
	 * b.changed(34.5); // logs [69]
	 *
	 * @param {function} transform - The transformation to apply to the value represented
	 * by this {@link Spook}.
	 * @param {number} outResolveDepth - The number of levels deep in any array
	 * object values of the result of the transformation that {@link Spook} values
	 * will be resolved.
	 * @default 3
	 * @param {*} cache - Cache information. See constructor.
	 * @default null
	 * @param {*} latched - Should the value be latched so that once ready it stays ready?
	 * @default false
	 * @param {*} mayBeNull - Should the value be allowed to be `null` such that if it ever becomes
	 * null, it is treated as being unready?
	 * @default true
	 * @returns {@link Spook} - An object representing this object's value with
	 * the function `transform` applied to it.
	 */
	map (transform, outResolveDepth = 3, cache = undefined, latched = false, mayBeNull = true) {
		const TransformSpook = require('./transformSpook');
		return new TransformSpook(transform, [this], [], outResolveDepth, 3, cache, latched, mayBeNull);
	}

	/**
	 * Just like `map`, except that it defaults to no latching and mayBeNull.
	 * @param {function} transform - The transformation to apply to the value represented
	 * by this {@link Spook}.
	 * @param {number} outResolveDepth - The number of levels deep in any array
	 * object values of the result of the transformation that {@link Spook} values
	 * will be resolved.
	 * @default 3
	 * @param {*} cache - Cache information. See constructor.
	 * @default null
	 * @param {*} latched - Should the value be latched so that once ready it stays ready?
	 * @default true
	 * @param {*} mayBeNull - Should the value be allowed to be `null` such that if it ever becomes
	 * null, it is treated as being unready?
	 * @default false
	 * @returns {@link Spook} - An object representing this object's value with
	 * the function `transform` applied to it.
	 */
	xform (transform, outResolveDepth = 3, cache = undefined, latched = true, mayBeNull = false) {
		const TransformSpook = require('./transformSpook');
		return new TransformSpook(transform, [this], [], outResolveDepth, 3, cache, latched, mayBeNull);
	}

	/**
	 * Create a new {@link Spook} which represents this object's array value with
	 * its elements transformed by a function.
	 *
	 * @example
	 * let b = new Spook;
	 * let t = b.mapEach(_ => _ * 2);
	 * t.tie(console.log);
	 * b.changed([1, 2, 3]); // logs [2, 4, 6]
	 * b.changed([21]); // logs [42]
	 *
	 * @param {function} transform - The transformation to apply to each element.
	 * @returns The new {@link Spook} object representing the element-wise
	 * Transformation.
	 */
	mapEach (transform, cache = undefined, latched = false, mayBeNull = true) {
		return this.map(item => item.map(transform), 3, cache, latched, mayBeNull);
	}

	/**
	 * Create a new {@link Spook} which represents this object's value when
	 * subscripted.
	 *
	 * @example
	 * let b = new Spook;
	 * let t = b.sub('foo');
	 * t.tie(console.log);
	 * b.changed({foo: 42}); // logs 42
	 * b.changed({foo: 69}); // logs 69
	 *
	 * @example
	 * let b = new Spook;
	 * let c = new Spook;
	 * let t = b.sub(c);
	 * t.tie(console.log);
	 * b.changed([42, 4, 2]);
	 * c.changed(0); // logs 42
	 * c.changed(1); // logs 4
	 * b.changed([68, 69, 70]); // logs 69
	 *
	 * @param {string|number} name - The field or index by which to subscript this object's
	 * represented value. May itself be a {@link Spook}, in which case, the
	 * resolved value is used.
	 * @param {number} outResolveDepth - The depth in any returned structure
	 * that a {@link Spook} may be for it to be resolved.
	 * @returns {@link Spook} - The object representing the value which is the
	 * value represented by this object subscripted by the value represented by
	 * `name`.
	 */
	sub (name, outResolveDepth = 3, cache = undefined, latched = false, mayBeNull = true) {
		const TransformSpook = require('./transformSpook');
		return new TransformSpook(
			(object, field) => object[field],
			[this, name],
			[],
			outResolveDepth,
			3,
			cache
		);
	}

	/**
	 * Create a new {@link Spook} which represents the array of many objects'
	 * representative values.
	 *
	 * This object will be _ready_ if and only if all objects in `list` are
	 * themselves _ready_.
	 *
	 * @example
	 * let b = new Spook;
	 * let c = new Spook;
	 * let t = Spook.all([b, c]);
	 * t.tie(console.log);
	 * b.changed(42);
	 * c.changed(69); // logs [42, 69]
	 * b.changed(3); // logs [3, 69]
	 *
	 * @example
	 * let b = new Spook;
	 * let c = new Spook;
	 * let t = Spook.all(['a', {b, c}, 'd'], 2);
	 * t.tie(console.log);
	 * b.changed(42);
	 * c.changed(69); // logs ['a', {b: 42, c: 69}, 'd']
	 * b.changed(null); // logs ['a', {b: null, c: 69}, 'd']
	 *
	 * @param {array} list - An array of {@link Spook} objects, plain values or
	 * structures (arrays/objects) which contain either of these.
	 * @param {number} resolveDepth - The depth in a structure (array or object)
	 * that a {@link Spook} may be in any of `list`'s items for it to be resolved.
	 * @returns {@link Spook} - The object representing the value of the array of
	 * each object's representative value in `list`.
	 */
	static all (list, resolveDepth = 3, cache = undefined, latched = false, mayBeNull = true) {
		const TransformSpook = require('./transformSpook');
		return new TransformSpook((...args) => args, list, [], 3, resolveDepth, cache, latched, mayBeNull);
	}

	/**
	 * Create a new {@link Spook} which represents a functional transformation of
	 * many objects' representative values.
	 *
	 * @example
	 * let b = new Spook;
	 * b.changed(23);
	 * let c = new Spook;
	 * c.changed(3);
	 * let multiply = (x, y) => x * y;
	 * // These two are exactly equivalent:
	 * let bc = Spook.all([b, c]).map(([b, c]) => multiply(b, c));
	 * let bc2 = Spook.mapAll([b, c], multiply);
	 *
	 * @param {array} list - An array of {@link Spook} objects or plain values.
	 * @param {function} f - A function which accepts as many parameters are there
	 * values in `list` and transforms it into a {@link Spook}, {@link Promise}
	 * or other value.
	 * @param {number} resolveDepth - The depth in a structure (array or object)
	 * that a {@link Spook} may be in any of `list`'s items for it to be resolved.
	 * @param {number} outResolveDepth - The depth in any returned structure
	 * that a {@link Spook} may be for it to be resolved.
	 */
	static mapAll (list, transform, outResolveDepth = 3, resolveDepth = 3, cache = undefined, latched = false, mayBeNull = true) {
		const TransformSpook = require('./transformSpook');
		return new TransformSpook(transform, list, [], outResolveDepth, resolveDepth, cache, latched, mayBeNull);
	}

	// Takes a Spook which evaluates to a = [a[0], a[1], ...]
	// Returns Spook which evaluates to:
	// null iff a.length === 0
	// f(i, a[0])[0] iff f(i, a[0])[1] === true
	// fold(f(0, a[0]), a.mid(1)) otherwise
	/**
	 * Lazily transforms the contents of this object's value when it is an array.
	 *
	 * This operates on a {@link Spook} which should represent an array. It
	 * transforms this into a value based on a number of elements at the
	 * beginning of that array using a recursive _reduce_ algorithm.
	 *
	 * The reduce algorithm works around an accumulator model. It begins with
	 * the `init` value, and incremenetally accumulates
	 * elements from the array by changing its value to one returned from the
	 * `accum` function, when passed the current accumulator and the next value
	 * from the array. The `accum` function may return a {@link Spook}, in which case it
	 * will be resolved (using {@link Spook#then}) and that value used.
	 *
	 * The `accum` function returns a value (or a {@link Spook} which resolves to a value)
	 * of an array with exactly two elements; the first is the new value for the
	 * accumulator. The second is a boolean _early exit_ flag.
	 *
	 * Accumulation will continue until either there are no more elements in the
	 * array to be processed, or until the _early exit_ flag is true, which ever
	 * happens first.
	 *
	 * @param {function} accum - The reduce's accumulator function.
	 * @param {*} init - The initialisation value for the reduce algorithm.
	 * @returns {Spook} - A {@link Spook} representing `init` when the input array is empty,
	 * otherwise the reduction of that array.
	 */
	reduce (accum, init, cache = undefined, latched = false, mayBeNull = true) {
		var nextItem = function (acc, rest) {
			let next = rest.pop();
			return accum(acc, next).map(([result, finished]) =>
				finished
					? result
					: rest.length > 0
						? nextItem(result, rest)
						: null
			);
		};
		return this.map(array => array.length > 0 ? nextItem(init, array) : init, 3, cache, latched, mayBeNull);
	}

	/**
	 * Create a Promise which represents one or more {@link Spook}s.
	 *
	 * @example
	 * let b = new Spook;
 	 * let p = Spook.promise([b, 42])
	 * p.then(console.log);
	 * b.changed(69); // logs [69, 42]
	 * b.changed(42); // nothing.
	 *
	 * @param {array} list - A list of values, {Promise}s or {@link Spook}s.
	 * @returns {Promise} - A object which resolves to an array of values
	 * corresponding to those passed in `list`.
	 */
	static promise (list) {
		return new Promise((resolve, reject) => {
			var finished = 0;
			var resolved = [];
			resolved.length = list.length;

			let done = (index, value) => {
				//				console.log(`done ${i} ${v}`);
				resolved[index] = value;
				finished++;
				//				console.log(`finished ${finished}; l.length ${l.length}`);
				if (finished === resolved.length) {
					//					console.log(`resolving with ${l}`);
					resolve(resolved);
				}
			};

			list.forEach((unresolvedObject, index) => {
				if (Spook.instanceOf(unresolvedObject)) {
					// unresolvedObject is a Spook.
					unresolvedObject.then(value => done(index, value));
				} else if (unresolvedObject instanceof Promise) {
					// unresolvedObject is a Promise.
					unresolvedObject.then(value => done(index, value), reject);
				} else {
					// unresolvedObject is actually just a normal value.
					done(index, unresolvedObject);
				}
			});
		});
	}

	/**
	 * Duck-typed alternative to `instanceof Spook`, when multiple instantiations
	 * of `Spook` may be available.
	 */
	static instanceOf (b) {
		return (
			typeof (b) === 'object' &&
			b !== null &&
			typeof (b.reset) === 'function' &&
			typeof (b.changed) === 'function'
		);
	}
}

Spook.backupStorage = {};
Spook.cache = new SpookCache(Spook.backupStorage);

module.exports = Spook;
