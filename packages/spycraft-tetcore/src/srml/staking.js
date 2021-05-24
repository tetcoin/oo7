const { Spook, TransformSpook } = require('spycraft')
const { ss58Encode } = require('../ss58')
const { Balance } = require('../types')
const balancesModule = require('./balances')
const sessionModule = require('./session')

function augment (runtime, chain) {
	sessionModule.augment(runtime, chain)
	balancesModule.augment(runtime, chain)
	let session = runtime.session
	let staking = runtime.staking
	let balances = runtime.balances
	if (staking._extras) {
		return
	} else {
		staking._extras = true
	}

	oldStakers = staking.stakers
	staking.stakers = who => oldStakers(who, false)
	oldValidators = staking.validators
	staking.validators = who => oldValidators(who, false)
	staking.validators.all = oldValidators.all
	staking.validators.head = oldValidators.head
	oldNominators = staking.nominators
	staking.nominators = who => oldNominators(who, false)
	staking.nominators.all = oldNominators.all
	staking.nominators.head = oldNominators.head

	staking.thisSessionReward = new TransformSpook(
		(r, l) => Math.round(r / l),
		[
			staking.sessionReward,
			session.lateness
		]
	)

	staking.spooking = either => new TransformSpook(
		(ledger, controller) => {
			if (ledger) {			// was controller
				return {
					ledger,
					controller: either,
					key: 'controller'
				}
			} else if (controller) {	// was stash
				return {
					ledger: staking.ledger(controller),
					controller,
					key: 'stash'
				}
			} else {
				return undefined
			}
		},
		[staking.ledger(either), staking.spooked(either)]
	).subscriptable(2)

	staking.info = either => new TransformSpook(
		({spooking, vals, noms, slashCount, payee, currentElected, invulnerables}) => spooking && ({
			ledger: spooking.ledger,
			controller: spooking.controller,
			key: spooking.key,
			role: vals ? { validator: vals } : noms ? { nominator: noms } : { idle: 'null' },
			payee
		}),
		[staking.spooking(either).map(spooking => spooking ? ({
			spooking,
			vals: staking.validators(spooking.ledger.stash),
			noms: staking.nominators(spooking.ledger.stash),
			payee: staking.payee(spooking.ledger.stash),
		}) : ({
			spooking: null
		}))]
	).subscriptable(2)

	staking.exposure = new TransformSpook((validators, invulns) => {
		let r = {}
		validators.forEach(validator => {
			r[ss58Encode(validator)] = new TransformSpook((stakers, controller) => Object.assign({
				validator,
				controller,
				invulnerable: validator.memberOf(invulns),
			}, stakers || {others: [], own: new Balance(0), total: new Balance(0)}), [staking.stakers(validator), staking.spooked(validator)])
		})
		return r
	}, [staking.currentElected, staking.invulnerables]).subscriptable(2)

	staking.exposureOf = nominator => new TransformSpook((exposure, nominator, slotStake) => {
		let slot = exposure[ss58Encode(nominator)];
		if (slot) {
			// Validator
			return { validating: slot }
		} else {
			// Maybe a nominator?
			let nominations = {}
			Object.keys(exposure).forEach(k => {
				let slot = exposure[k]
				let n = slot.others.find(x => x.who.compare(nominator))
				if (n) {
					nominations[k] = Object.assign({
						share: n.value
					}, slot)
				}
			})
			if (Object.keys(nominations).length > 0) {
				return { nominating: nominations }
			} else {
				return { idle: true }
			}
		}
	}, [staking.exposure, nominator, staking.slotStake]).subscriptable(2)

	staking.eraLength = new TransformSpook(
		(a, b) => a * b,
		[
			staking.sessionsPerEra,
			session.sessionLength
		])
	
	staking.eraSessionsRemaining = new TransformSpook(
		(spe, si, lec) => (spe - 1 - (si - lec) % spe),
		[
			staking.sessionsPerEra,
			session.currentIndex,
			staking.lastEraLengthChange
		])

	staking.eraBlocksRemaining = new TransformSpook(
		(sl, sr, br) => br + sl * sr, 
		[
			session.sessionLength,
			staking.eraSessionsRemaining,
			session.blocksRemaining
		])
}

module.exports = { augment }