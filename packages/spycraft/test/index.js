/* eslint-disable  no-return-assign */

require('chai').should();

const { Spook, TimeSpook, ReactiveSpook, TransformSpook } = require('../index');

const testIntervals = TimeSpook.testIntervals;

describe('Spook', function () {
	it('should be constructable', () => {
		let t = new Spook();

		t.should.be.a('object');
		t.should.have.property('_ready');
		t.isReady().should.equal(false);
	});

	it('should be triggerable', () => {
		let t = new Spook();
		var x = null;
		var z = null;
		t.then(y => { z = y; });
		t.trigger(69);
		t.then(y => { x = y; });

		t.isReady().should.equal(true);
		x.should.equal(69);
		z.should.equal(69);
	});

	it('should be transformable', () => {
		let t = new Spook();
		var x = null;

		let u = new TransformSpook(n => n + 1, [t]);
		u.then(n => { x = n; });

		// when
		t.trigger(68);

		// then
		x.should.equal(69);
	});

	it('should have subscripts which fall back properly', () => {
		let t = new Spook().subscriptable();

		var x = 0;
		t.tie(a => { x = a; });

		x.should.equal(0);

		// when
		t.trigger(42);

		// then
		x.should.equal(42);
	});

	it('should have subscripts which work with normals', () => {
		let t = new Spook().subscriptable();

		var x = 0;
		t[2].use().tie(a => { x = a; });

		x.should.equal(0);

		// when
		t.trigger([0, 0, 42, 0]);

		// then
		x.should.equal(42);
	});

	it('should have subscripts which work with spooks', () => {
		let t = new Spook().subscriptable();
		let u = new Spook();

		var x = 0;
		t[u].tie(a => { x = a; });

		x.should.equal(0);

		// when
		t.trigger([0, 0, 42, 0]);

		// then
		x.should.equal(0);

		// when
		u.trigger(2);

		// then
		x.should.equal(42);
	});

	it('should use cache', () => {
		const cacheConfig = {
			id: 'myNumber',
			stringify: JSON.stringify,
			parse: JSON.parse
		};

		let t = new Spook(true, cacheConfig);
		var x = 0;
		let a = t.tie(_ => { x = _; });

		t.trigger(42);
		x.should.equal(42);

		let u = new Spook(true, cacheConfig);
		var y = 0;
		let b = u.tie(_ => { y = _; });

		y.should.equal(42);

		t.trigger(69);
		x.should.equal(69);
		y.should.equal(69);

		t.untie(a);
		u.untie(b);
	});

	it('should switch cache master as necessary', () => {
		const cacheConfig = {
			id: 'myNumberTwo',
			stringify: JSON.stringify,
			parse: JSON.parse
		};

		let t = new Spook(true, cacheConfig);
		var x = 0;
		let a = t.tie(_ => { x = _; });

		t.trigger(42);
		x.should.equal(42);

		let u = new Spook(true, cacheConfig);
		var y = 0;
		let b = u.tie(_ => { y = _; });

		y.should.equal(42);

		t.trigger(69);
		x.should.equal(69);
		y.should.equal(69);

		let v = new Spook(true, cacheConfig);
		var z = 0;
		let c = v.tie(_ => { z = _; });

		t.untie(a);	// should result in u becoming the master spook.

		u.trigger(42);
		y.should.equal(42);
		z.should.equal(42);

		u.untie(b);
		v.untie(c);
	});
});
	// Won't work as then gets called async.
	// it('should work with trivial all', () => {
	// 	let v = 6;
	//
	// 	var x = null;
	//
	// 	let a = Spook.all([v]).then(i => { console.log(`Resolved ${i}. Setting x.`); x = i; });
	//
	// 	sleep(1);
	// 	console.log(`Checking x ${x}...`);
	// 	JSON.stringify(x).should.equal(JSON.stringify([6]));
	// })
	// it('should work with complex all', () => {
	// 	let t = new Spook();
	// 	var uResolve = null;
	// 	let u = new Promise((resolve, reject)=>{uResolve = resolve;});
	// 	let v = 6;
	//
	// 	var x = null;
	//
	// 	let a = Spook.all([t, u, v]).then(i => x = i);
	// 	JSON.stringify(x).should.equal("null");
	//
	// 	t.trigger(6);
	// 	JSON.stringify(x).should.equal("null");
	//
	// 	uResolve(6);
	// 	JSON.stringify(x).should.equal(JSON.stringify([6, 6, 6]));
	// })
	// });

describe('ReactiveSpook', function () {
	it('should have this set in execute', () => {
		let t = new Spook();

		class MySpook extends ReactiveSpook {
			constructor (d) {
				super([d], [], () => { this.itWorks = true; });
				this.itWorks = false;
			}
		}

		let u = new MySpook(t).use();

		// when
		t.trigger(69);

		// then
		u.itWorks.should.equal(true);

		// finally
		u.drop();
	});

	it('should not propagate undefined values', () => {
		let t = new Spook();

		class MySpook extends ReactiveSpook {
			constructor (a) {
				super([a], [], (args) => { this.argsType = typeof args[0]; });
				this.argsType = '';
			}
		}

		let u = new MySpook(t).use();

		u.argsType.should.equal('');

		// when
		t.reset();

		// then
		u.argsType.should.equal('');

		// when
		t.trigger(69);

		// then
		u.argsType.should.equal('number');

		// finally
		u.drop();
	});

	it('should not try to use/drop basic values', () => {
		let t = new Spook();

		class MySpook extends ReactiveSpook {
			constructor (d) {
				super([d], [], () => { this.itWorks = true; });
				this.itWorks = false;
			}
		}

		let u = new MySpook(t).use();
		u.drop();
	});

	it('should resolve depth 2 dependencies', () => {
		let t = new Spook();
		var x = null;

		class MySpook extends ReactiveSpook {
			constructor (d) {
				super([[{foo: d}]], [], v => x = v[0], false, 2);
			}
		}

		let u = new MySpook(t).use();

		// initially
		(x === null).should.equal(true);

		// when
		t.trigger(69);

		// then
		x[0].foo.should.equal(69);

		// finally
		u.drop();
	});
});

describe('TransformSpook', function () {
	// TODO [ToDr] Temporary disabling due to recent changes.
	xit('should react to in-object dependencies', () => {
		var x = 0;
		let t = new Spook();
		let u = new Spook();
		let v = new Spook();
		let w = new Spook();
		let b = new TransformSpook((a, b, c) => {
			x = a + b.n + c[0];
			return true;
		}, [t, {n: u, m: {w}}, [v]]).use();

		b.isReady().should.equal(false);
		x.should.equal(0);

		t.trigger(60);
		b.isReady().should.equal(false);
		x.should.equal(0);

		u.trigger(6);
		b.isReady().should.equal(false);
		x.should.equal(0);

		v.trigger(3);
		b.isReady().should.equal(true);
		x.should.equal(69);

		// finally
		b.drop();
	});

	it('should deal with returned Spooks', () => {
		var x = null;
		let t = new Spook();
		let b = new TransformSpook(() => t, [], []);

		b.map(v => x = v).use();

		b.isReady().should.equal(false);
		t.trigger(60);
		b.isReady().should.equal(true);
		x.should.equal(60);

		b.drop();
	});

	it('should not deal with level 1 returned Spooks at 0 depth resolution', () => {
		var x = null;
		let t = new Spook();
		let b = new TransformSpook(() => [t], [], [], 0, 1);

		b.map(v => x = v).use();

		b.isReady().should.equal(true);
		Object.getPrototypeOf(x[0]).constructor.name.should.equal('Spook');

		b.drop();
	});

	it('should deal with level 1 returned Spooks at 1 depth resolution', () => {
		var x = null;
		let t = new Spook();
		let b = new TransformSpook(() => [t], [], [], 1, 1);

		b.map(v => x = v).use();

		b.isReady().should.equal(false);
		t.trigger(60);
		b.isReady().should.equal(true);
		x[0].should.equal(60);

		b.drop();
	});

	it('should deal with level 1 returned Spooks at 2 depth resolution', () => {
		var x = null;
		let t = new Spook();
		let b = new TransformSpook(() => [t], [], [], 2, 1);

		b.map(v => x = v).use();

		b.isReady().should.equal(false);
		t.trigger(60);
		b.isReady().should.equal(true);
		x[0].should.equal(60);

		b.drop();
	});

	it('should not deal with level 2 returned Spooks at 0 depth resolution', () => {
		var x = null;
		let t = new Spook();
		let b = new TransformSpook(() => [{foo: t}], [], [], 0, 1);

		b.map(v => x = v).use();

		b.isReady().should.equal(true);
		Object.getPrototypeOf(x[0].foo).constructor.name.should.equal('Spook');

		b.drop();
	});

	it('should not deal with level 2 returned Spooks at 1 depth resolution', () => {
		var x = null;
		let t = new Spook();
		let b = new TransformSpook(() => [{foo: t}], [], [], 1, 1);
		let c = b.map(v => x = v).use();

		b.isReady().should.equal(true);
		Object.getPrototypeOf(x[0].foo).constructor.name.should.equal('Spook');

		c.drop();
	});

	it('should deal with level 2 returned Spooks at 2 depth resolution', () => {
		var x = null;
		let t = new Spook();
		let b = new TransformSpook(() => [{foo: t}], [], [], 2, 1);
		let c = b.map(v => x = v).use();

		b.isReady().should.equal(false);
		t.trigger(60);
		b.isReady().should.equal(true);
		x[0].foo.should.equal(60);

		c.drop();
	});
	it('should be inheritable', () => {
		class TestTransformSpook extends TransformSpook {
			constructor () {
				super (() => 1);
			}
		}
		let b = new TestTransformSpook();
		b.use();
		b.isReady().should.equal(true);
		b.drop();
	});
});

function intervalCount () { return Object.keys(TimeSpook.testIntervals()).length; }
TimeSpook.useTestIntervals = true;

describe('TimeSpook', function () {
	it('should be testable', () => {
		Object.keys(TimeSpook.testIntervals()).length.should.equal(0);
	});

	it('should be constructable', () => {
		let t = new TimeSpook();
		t.should.be.a('object');
		t.should.have.property('then');
	});

	it('should create timer when used', () => {
		let t = new TimeSpook().use();
		intervalCount().should.equal(1);
		t.drop();
	});

	it('should kill timer when dropped', () => {
		let t = new TimeSpook().use();
		t.drop();
		intervalCount().should.equal(0);
	});

	it('should kill timer when mapped', () => {
		let t = new TimeSpook().map(x => +x * 2).use();
		intervalCount().should.equal(1);

		t.drop();
		intervalCount().should.equal(0);
	});

	it('should kill timers when multiple mapped', () => {
		let t = Spook.all([new TimeSpook(), new TimeSpook()]).map(([a, b]) => +a + +b).use();
		intervalCount().should.equal(2);

		t.drop();
		intervalCount().should.equal(0);
	});

	it('should kill timer when multiply-refered', () => {
		let t = new TimeSpook();
		let t1 = t.map(x => +x * 2).use();
		let t2 = t.map(x => +x * 3).use();
		intervalCount().should.equal(1);

		t1.drop();
		intervalCount().should.equal(1);

		t2.drop();
		intervalCount().should.equal(0);
	});

	it('should kill timer when multiply-refered via Spook.all', () => {
		let tb = new TimeSpook();
		let t = Spook.all([tb, tb]).map(([a, b]) => +a + +b).use();
		intervalCount().should.equal(1);

		t.drop();
		intervalCount().should.equal(0);
	});
});
