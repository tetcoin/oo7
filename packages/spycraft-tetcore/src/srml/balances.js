const { Spook } = require('spycraft')
const { Balance } = require('../types')

function augment(runtime, chain) {
	let balances = runtime.balances
	if (balances._extras) {
		return
	} else {
		balances._extras = true
	}

	balances.balance = who => Spook
		.all([balances.freeBalance(who), balances.reservedBalance(who)])
		.map(([f, r]) => new Balance(f + r));
	balances.totalBalance = balances.balance;
}

module.exports = { augment }