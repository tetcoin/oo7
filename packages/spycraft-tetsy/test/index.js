var should = require('chai').should();
var spycrafttetsy = require('../src/index');

describe('spooks', () => {
	it('should be constructable', () => {
		let t = new spycrafttetsy.Spooks();

		t.should.be.a('object');
	});
});
