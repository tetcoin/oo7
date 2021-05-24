/* eslint-disable  no-return-assign */

require('chai').should();

const { Spook, SpookCache, SpookProxy } = require('../index');

class Setup {
	constructor () {
		let messageQueue = [];
		let parentWindow = { localStorage: {}, messages: [], listeners: { message: [] } };
		parentWindow.addEventListener = (type, f) => {
			if (parentWindow.listeners[type]) {
				parentWindow.listeners[type].push(f);
			}
		};
		let childWindow = { localStorage: {}, parent: parentWindow, messages: [], listeners: { message: [] } };
		childWindow.addEventListener = (type, f) => {
			if (childWindow.listeners[type]) {
				childWindow.listeners[type].push(f);
			}
		};

		parentWindow.postMessage = m => messageQueue.push(
			() => (parentWindow.listeners.message || []).forEach(l =>
				l({source: childWindow, data: m})
			)
		);
		childWindow.postMessage = m => messageQueue.push(
			() => (childWindow.listeners.message || []).forEach(l =>
				l({source: parentWindow, data: m})
			)
		);

		this.messageQueue = messageQueue;
		this.parentWindow = parentWindow;
		this.childWindow = childWindow;
	}

	play () {
		while (this.messageQueue.length > 0) {
			this.messageQueue.splice(0, 1)[0]();
		}
	}
}

describe('SpookCache', function () {
	it('should have working scene', () => {
		let scene = new Setup();

		let roundTripsComplete = 0;
		scene.parentWindow.addEventListener('message', m => { if (m.data === 'ping') m.source.postMessage('pong'); });
		scene.parentWindow.addEventListener('message', m => { if (m.data === 'ping') m.source.postMessage('pong'); });
		scene.childWindow.addEventListener('message', m => { if (m.data === 'pong') roundTripsComplete++; });
		scene.childWindow.addEventListener('message', m => { if (m.data === 'pong') roundTripsComplete++; });
		scene.parentWindow.postMessage('ping');
		scene.play();

		roundTripsComplete.should.equal(4);
	});
	it('should work', () => {
		let scene = new Setup();

		let fireSpooks = {};
		class FireSpook extends Spook {
			constructor (uuid) {
				const cacheConfig = {
					id: uuid,
					stringify: JSON.stringify,
					parse: JSON.parse
				};
				super(true, cacheConfig);
			}
			initialise () {
				if (typeof fireSpooks[this._uuid] === 'undefined') {
					fireSpooks[this._uuid] = [];
				}
				fireSpooks[this._uuid].push(this);
			}
			finalise () {
				fireSpooks[this._uuid].splice(fireSpooks[this._uuid].indexOf(this), 1);
				if (fireSpooks[this._uuid].length === 0) {
					delete fireSpooks[this._uuid];
				}
			}
		}
		FireSpook.fire = (uuid, value) => fireSpooks[uuid].forEach(b => b.trigger(value));

		let fireInstance = new FireSpook('test/fireInstance');
		fireInstance._noCache = true;
		function fromUuid(uuid) {
			if (uuid === 'test/fireInstance') { return fireInstance; }
			return null;
		}

		Object.keys(fireSpooks).length.should.equal(0);

		let proxy = new SpookProxy('test/', fromUuid, scene.parentWindow);
		let cache = new SpookCache(undefined, 'test/', scene.childWindow);
		Spook.cache = cache;
		let childSpook = new FireSpook('test/fireInstance');

		Object.keys(fireSpooks).length.should.equal(0);

		{
			let x = 0;
			let xt = childSpook.tie(n => x = n);

			scene.play();

			fireSpooks['test/fireInstance'].length.should.equal(1);
			fireSpooks['test/fireInstance'][0].should.equal(fireInstance);

			// Server fires.
			FireSpook.fire('test/fireInstance', 69);
			fireInstance._value.should.equal(69);

			x.should.equal(0);

			scene.play();
			x.should.equal(69);

			childSpook.untie(xt);
			fireSpooks['test/fireInstance'].length.should.equal(1);

			scene.play();
			Object.keys(fireSpooks).length.should.equal(0);
		}
	});
});
