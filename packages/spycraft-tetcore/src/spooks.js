const { camel } = require('change-case');
const { Spook, TransformSpook, TimeSpook } = require('spycraft')
const { nodeService } = require('./nodeService')
const { SubscriptionSpook } = require('./subscriptionSpook')
const { BlockNumber, Hash } = require('./types');
const { decode, encode } = require('./codec');
const { stringToBytes, hexToBytes, bytesToHex, toLE } = require('./utils')
const { StorageSpook } = require('./storageSpook')
const { setMetadata } = require('./metadata')

let chain = (() => {
	let head = new SubscriptionSpook('chain_newHead').subscriptable()
	let finalizedHead = new SubscriptionSpook('chain_finalizedHead').subscriptable()
	let height = head.map(h => new BlockNumber(h.number))
	let finalizedHeight = finalizedHead.map(h => new BlockNumber(h.number))
	let lag = Spook.all([height, finalizedHeight]).map(([h, f]) => new BlockNumber(h - f))
	let header = hashSpook => new TransformSpook(hash => nodeService().request('chain_getHeader', [hash]), [hashSpook]).subscriptable()
	let block = hashSpook => new TransformSpook(hash => nodeService().request('chain_getBlock', [hash]), [hashSpook]).subscriptable()
	let hash = numberSpook => new TransformSpook(number => nodeService().request('chain_getBlockHash', [number]).then(hexToBytes), [numberSpook])
	return { head, finalizedHead, height, finalizedHeight, header, hash, block, lag }
})()

let system = (() => {
	let time = new TimeSpook
	let name = new TransformSpook(() => nodeService().request('system_name')).subscriptable()
	let version = new TransformSpook(() => nodeService().request('system_version')).subscriptable()
	let chain = new TransformSpook(() => nodeService().request('system_chain')).subscriptable()
	let properties = new TransformSpook(() => nodeService().request('system_properties')).subscriptable()
	let health = new TransformSpook(() => nodeService().request('system_health'), [], [time]).subscriptable()
	let peers = new TransformSpook(() => nodeService().request('system_peers'), [], [time]).subscriptable()
	let pendingTransactions = new TransformSpook(() => nodeService().request('author_pendingExtrinsics')).subscriptable()
	return { name, version, chain, properties, pendingTransactions, health, peers }
})()

let version = (new SubscriptionSpook('state_runtimeVersion', [], r => {
	let apis = {}
	r.apis.forEach(([id, version]) => {
		if (typeof id !== 'string') {
			id = String.fromCharCode.apply(null, id)
		}
		apis[id] = version
	})
	return {
		authoringVersion: r.authoringVersion,
		implName: r.implName,
		implVersion: r.implVersion,
		specName: r.specName,
		specVersion: r.specVersion,
		apis
	}
})).subscriptable()

let runtime = {
	version, 
	metadata: new Spook,
	core: (() => {
		let authorityCount = new SubscriptionSpook('state_storage', [['0x' + bytesToHex(stringToBytes(':auth:len'))]], r => decode(hexToBytes(r.changes[0][1]), 'u32'))
		let authorities = authorityCount.map(
			n => [...Array(n)].map((_, i) =>
				new SubscriptionSpook('state_storage',
					[[ '0x' + bytesToHex(stringToBytes(":auth:")) + bytesToHex(toLE(i, 4)) ]],
					r => decode(hexToBytes(r.changes[0][1]), 'AccountId')
				)
			), 2)
		let code = new SubscriptionSpook('state_storage', [['0x' + bytesToHex(stringToBytes(':code'))]], r => hexToBytes(r.changes[0][1]))
		let codeHash = new TransformSpook(() => nodeService().request('state_getStorageHash', ['0x' + bytesToHex(stringToBytes(":code"))]).then(hexToBytes), [], [version])
		let codeSize = new TransformSpook(() => nodeService().request('state_getStorageSize', ['0x' + bytesToHex(stringToBytes(":code"))]), [], [version])
		let heapPages = new SubscriptionSpook('state_storage', [['0x' + bytesToHex(stringToBytes(':heappages'))]], r => decode(hexToBytes(r.changes[0][1]), 'u64'))
		return { authorityCount, authorities, code, codeHash, codeSize, version, heapPages }
	})()
}

let calls = {}

class RuntimeUp extends Spook {
	initialise() {
		let that = this
		initRuntime(() => that.trigger(true))
	}
}
let runtimeUp = new RuntimeUp

let onRuntimeInit = []

function initialiseFromMetadata (md) {
	console.log("initialiseFromMetadata", md)
	setMetadata(md)
	let callIndex = 0;
	md.modules.forEach((m) => {
		let o = {}
		let c = {}
		if (m.storage) {
			let storePrefix = m.prefix
			m.storage.forEach(item => {
				switch (item.type.option) {
					case 'Plain': {
						o[camel(item.name)] = new StorageSpook(`${storePrefix} ${item.name}`, item.type.value, [], item.modifier.option == 'Default' ? item.default : null, 'Twox128')
						break
					}
					case 'Map': {
						let keyType = item.type.value.key
						let valueType = item.type.value.value
						let hasDefault = item.modifier.option == 'Default'
						
						o[camel(item.name)] = (keySpook, useDefault = hasDefault) => new TransformSpook(
							key => new StorageSpook(`${storePrefix} ${item.name}`, valueType, encode(key, keyType), useDefault ? item.default : null, item.type.value.hasher.option),
							[keySpook]
						).subscriptable()
						if (item.type.value.iterable) {
							o[camel(item.name)].head = new StorageSpook(`head of ${storePrefix} ${item.name}`, keyType)
							let prefix = `${storePrefix} ${item.name}`;
							let rest
							rest = (pre, head) => {
								if (head == null) {
									return pre
								} else {
									return new TransformSpook(
										l => l && l[0]
											? rest([...pre, { key: head, value: l[0][0] }], l[0][2])
											: pre,
										[new StorageSpook(prefix, [valueType, `Option<${keyType}>`, `Option<${keyType}>`], encode(head, keyType))]
									)
								}
							}
							o[camel(item.name)].all = o[camel(item.name)].head.map(x => rest([], x))
						}
						break
					}
				}
			})
		}
		if (m.calls) {
			let thisCallIndex = callIndex
			callIndex++
			m.calls.forEach((item, id) => {
				if (item.arguments.length > 0 && item.arguments[0].name == 'origin' && item.arguments[0].type == 'Origin') {
					item.arguments = item.arguments.slice(1)
				}
				c[camel(item.name)] = function (...spookArgs) {
					if (spookArgs.length != item.arguments.length) {
						throw `Invalid number of argments (${spookArgs.length} given, ${item.arguments.length} expected)`
					}
					return new TransformSpook(args => {
						let encoded_args = encode(args, item.arguments.map(x => x.type))
						let res = new Uint8Array([thisCallIndex, id, ...encoded_args]);
//						console.log(`Encoding call ${m.name}.${item.name} (${thisCallIndex}.${id}): ${bytesToHex(res)}`)
						return res
					}, [spookArgs], [], 3, 3, undefined, true)
				}
				c[camel(item.name)].help = item.arguments.map(a => a.name)
			})				
		}
		runtime[camel(m.name)] = o
		calls[camel(m.name)] = c
	})
	md.modules.forEach(m => {
		if (m.storage) {
			try {
				require(`./srml/${m.name}`).augment(runtime, chain)
			}
			catch (e) {
				if (!e.toString().startsWith('Error: Cannot find module')) {
					throw e
				}
			}
		}
	})
	if (onRuntimeInit !== null) {
		onRuntimeInit.forEach(f => { if (f) f() })
		onRuntimeInit = null
	}

	runtime.metadata.trigger(md)
}

function decodeMetadata(bytes) {
	let input = { data: bytes }
	let head = decode(input, 'MetadataHead')
	if (head.magic === 0x6174656d) {
		if (head.version == 1) {
			return decode(input, 'MetadataBodyV1')
		} else if (head.version == 2) {
			return decode(input, 'MetadataBodyV2')
		} else if (head.version == 3) {
			return decode(input, 'MetadataBodyV3')
		} else if (head.version == 4) {
			return decode(input, 'MetadataBody')
		} else {
			throw `Metadata version ${head.version} not supported`
		}
	} else {
		let md = decode(bytes, 'Legacy_RuntimeMetadata')
		md.modules = md.modules.map(m => {
			m.name = m.prefix
			m.prefix = m.storage ? m.storage.prefix : null
			m.storage = m.storage ? m.storage.items : null
			m.calls = m.module && m.module.call ? m.module.call.functions : null
			return m
		})
		return md
	}
}

function initRuntime (callback = null) {
	if (onRuntimeInit instanceof Array) {
		onRuntimeInit.push(callback)
		version.tie(() => {
//			console.info("Initialising runtime")
			nodeService().request('state_getMetadata')
				.then(blob => decodeMetadata(hexToBytes(blob)))
				.then(initialiseFromMetadata)
		})
	} else {
		// already inited runtime
		if (callback) {
			callback()
		}
	}
}

function runtimePromise() {
	return new Promise((resolve, reject) => initRuntime(() => resolve(runtime)))
}

function callsPromise() {
	return new Promise((resolve, reject) => initRuntime(() => resolve(calls)))
}

module.exports = { initRuntime, runtimeUp, runtimePromise, callsPromise, runtime, calls, chain, system }
