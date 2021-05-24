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

/* eslint-disable no-return-assign */
/* eslint-disable no-proto */

// TODO [Document auxilary types]

const spycraft = require('spycraft');
const ParityApi = require('@parity/api');

const {
	asciiToHex,
	bytesToHex,
	hexToAscii,
	isAddressValid,
	toChecksumAddress,
	sha3,
	capitalizeFirstLetter,
	singleton,
	denominations,
	denominationMultiplier,
	interpretRender,
	combineValue,
	defDenom,
	formatValue,
	formatValueNoDenom,
	formatToExponential,
	interpretQuantity,
	splitValue,
	formatBalance,
	formatBlockNumber,
	isNullData,
	splitSignature,
	removeSigningPrefix,
	cleanup
} = require('./utils');

const {
	abiPolyfill,
	RegistryABI,
	RegistryExtras,
	GitHubHintABI,
	OperationsABI,
	BadgeRegABI,
	TokenRegABI,
	BadgeABI,
	TokenABI
} = require('./abis');

function defaultProvider () {
	if (typeof window !== 'undefined' && window.ethereum) {
		return window.ethereum;
	}

	try {
		if (typeof window !== 'undefined' && window.parent && window.parent.ethereum) {
			return window.parent.ethereum;
		}
	} catch (e) {}

	return new ParityApi.Provider.Http('http://localhost:8545');
}

class Spooks {
	/**
	 * Creates a new spycraft-tetsy spooks aggregate object with given ethereum provider.
	 *
	 * Additional documentation can be found at https://wiki.parity.io/spycraft-Parity-Reference.html
	 *
	 * @param {?Provider} provider Web3-compatible transport Provider (i.e. `window.ethereum`). Uses a sane default if not provided.
	 * @returns {Spooks}
	 */
	constructor (provider = defaultProvider()) {
		if (!this) {
			return createSpooks({ api: new ParityApi(provider) });
		}

		/**
		 *
		 * A {@link Spook} representing latest time. Updated every second.
		 *
		 * @type {TimeSpook}
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.time
		 *	.tie(console.log) // prints time periodically
		 */
		this.time = null;

		/**
		 * A {@link Spook} representing latest block number.
		 * Alias for {@link Spooks.blockNumber}
		 *
		 * @type {Spook.<Number>}
		 */
		this.height = null;

		/**
		 * A {@link Spook} representing latest block number.
		 *
		 * @type {Spook.<Number>}
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.blockNumber
		 *	.tie(console.log) // prints latest block number when it changes
		 */
		this.blockNumber = null;

		/**
		 * A function returning spook that represents given block content.
		 *
		 * @param {string|number|Spook} number block number
		 * @returns {Spook.<Block>} block spook
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.blockByNumber(spooks.height)
		 *	.tie(console.log) // prints latest block
		 */
		this.blockByNumber = null;

		/**
		 * A function returning spook that represents given block content.
		 *
		 * @param {string|number|Spook} hash block hash
		 * @returns {Spook.<Block>} block spook
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.blockByHash('0x2b23d04567313fa141ca396f1e2620b62ab0c5d69f8c77157118f8d7671e1f4d')
		 *	.tie(console.log) // prints block with given hash
		 */
		this.blockByHash = null;

		/**
		 * Similar to {@link Spooks.blockByNumber} and {@link Spooks.blockByHash},
		 * but accepts both hashes and numbers as arguments.
		 *
		 * @param {string|number|Spook} hashOrNumber block hash or block number
		 * @returns {Spook.<Block>} block spook
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.findBlock('0x2b23d04567313fa141ca396f1e2620b62ab0c5d69f8c77157118f8d7671e1f4d')
		 *	.tie(console.log) // prints block with given hash
		 */
		this.findBlock = null;

		/**
		 * A subscriptable version of {@link Spooks.findBlock}
		 *
		 * You can retrieve spooks given block numbers or hashes or other Spooks.
		 *
		 * @type {Object.<string|number|Spook, Spook>}
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.blocks['0x2b23d04567313fa141ca396f1e2620b62ab0c5d69f8c77157118f8d7671e1f4d']
		 *	.tie(console.log) // prints block with given hash
		 *
		 * spooks
		 *	.blocks[spooks.height]
		 *	.tie(console.log) // prints latest block every time it changes
		 */
		this.blocks = null;

		/**
		 * A {@link Spook} for latest block.
		 *
		 * @type {Spook.<Block>}
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.head
		 *	.tie(console.log) // prints latest block every time it changes
		 *
		 */
		this.head = null;

		/**
		 * A {@link Spook} for currently set block author.
		 * Represents a result of `eth_coinbase` RPC call.
		 *
		 * @type {Spook.<Address>}
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.author
		 *	.tie(console.log) // prints currently set block author (coinbase/miner) every time it changes
		 *
		 */
		this.author = null;

		/**
		 * List of accounts managed by the node.
		 *
		 * @type {Spook.<Address[]>}
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.accounts
		 *	.tie(console.log) // prints accounts list every time it changes
		 *
		 */
		this.accounts = null;

		/**
		 * User-selected default account for this dapp.
		 *
		 * @type {Spook.<Address>}
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.defaultAccount
		 *	.tie(console.log) // prints default account every time it changes
		 *
		 */
		this.defaultAccount = null;

		/**
		 * Alias for {@link Spooks.defaultAccount}
		 *
		 * @type {Spook.<Address>}
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.me
		 *	.tie(console.log) // prints default account every time it changes
		 *
		 */
		this.me = null;
		/**
		 * Posts a transaction to the network.
		 *
		 * @param {TransactionRequest} tx Transaction details
		 * @returns {ReactivePromise.<TransactionStatus>}
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.post({ to: spooks.me, value: 0  })
		 *	.tie(console.log) // Reports transaction progress
		 */
		this.post = null;
		/**
		 * Returns a signature of given message
		 *
		 * @param {Hash|Spook} hash Hash to sign
		 * @param {?Address|Spook} from Optional account that should be used for signing.
		 * @returns {ReactivePromise.<SignStatus>}
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.sign('0x2ea2e504d09c458dbadc703112125564d53ca03c27a5b28e7b3e2b5804289c45')
		 *	.tie(console.log) // Reports signing progress
		 */
		this.sign = null;

		/**
		 * Returns balance of given address.
		 *
		 * @param {string|Spook.<Address>} address
		 * @returns {Spook.<BigNumber>}
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.balance(spooks.me)
		 *	.tie(console.log) // prints default account balance every time any of them changes
		 *
		 */
		this.balance = null;

		/**
		 * Returns code of given address.
		 *
		 * @param {string|Spook.<Address>} address
		 * @returns {Spook.<Bytes>}
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.code(spooks.me)
		 *	.tie(console.log) // prints default account code every time any of them changes
		 *
		 */
		this.code = null;

		/**
		 * Returns the nonce of given address.
		 *
		 * @param {string|Spook.<Address>} address
		 * @returns {Spook.<BigNumber>}
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.nonce(spooks.me)
		 *	.tie(console.log) // prints default account nonce every time any of them changes
		 *
		 */
		this.nonce = null;

		/**
		 * Returns storage at given index of an address.
		 *
		 * @param {string|Spook.<Address>} address Contract address
		 * @param {string|number|Spook.<H256>} storageIdx Contract storage index
		 * @returns {Spook.<BigNumber>}
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.storageAt(spooks.me, 0)
		 *	.tie(console.log) // prints default account storage at position 0 every time any of them changes
		 *
		 */
		this.storageAt = null;

		/**
		 * Returns node's syncing status.
		 * If the node is fully synced this will return `false`.
		 *
		 * @type {Spook.<bool>}
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.syncing
		 *	.tie(console.log) // prints sync status every time it changes
		 *
		 */
		this.syncing = null;
		/**
		 * Returns node's authoring status.
		 * If the node is not authoring blocks this will return `false`.
		 *
		 * @type {Spook.<bool>}
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.authoring
		 *	.tie(console.log) // prints authoring status every time it changes
		 *
		 */
		this.authoring = null;
		/**
		 * Reported hashrate.
		 * If there is an external miner connected to the node it will return reported values.
		 *
		 * @type {Spook.<BigNumber>}
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.hashrate
		 *	.tie(console.log) // prints current average hashrate
		 *
		 */
		this.hashrate = null;
		this.ethProtocolVersion = null;
		/**
		 * Suggested gas price value. (Gas Price Oracle)
		 * This returns a suggested gas price for next transaction. The estimation is based on statistics from last blocks.
		 *
		 * @type {Spook.<BigNumber>}
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.gasPrice
		 *	.tie(console.log) // prints current gas price suggestion
		 *
		 */
		this.gasPrice = null;
		/**
		 * Estimates gas required to execute given transaction
		 *
		 * @param {{ from: ?Address, to: ?Address, data: ?Bytes }} call Transaction request
		 * @returns {Spook.<BigNumber>} gas estimate
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.estimateGas({ from: spooks.me, to: '0x00D6Cc1BA9cf89BD2e58009741f4F7325BAdc0ED' })
		 *	.tie(console.log) // prints current gas estimate
		 *
		 */
		this.estimateGas = null;

		/**
		 * Returns block transaction count given block number or hash.
		 *
		 * @param {string|number|Spook} block block number or hash
		 * @returns {Spook.<Number>} number of transactions in block
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.blockTransactionCount(spooks.blockNumber)
		 *	.tie(console.log) // prints number of transactions in latest block
		 *
		 */
		this.blockTransactionCount = null;
		/**
		 * Returns uncle count given block number or hash.
		 *
		 * @param {string|number|Spook} block block number or hash
		 * @returns {Spook.<Number>} number of uncles in a block
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.uncleCount(spooks.blockNumber)
		 *	.tie(console.log) // prints number of uncles in latest block
		 *
		 */
		this.uncleCount = null;
		/**
		 * Returns uncle given block number or hash and uncle index
		 *
		 * @param {string|number|Spook} block block number or hash
		 * @param {string|number|Spook} index index of an uncle within a block
		 * @returns {Spook.<Header>} uncle header at that index
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.uncle(spooks.blockNumber, 0)
		 *	.tie(console.log) // prints the first uncle in latest block
		 *
		 */
		this.uncle = null;
		/**
		 * Returns transaction given block number or hash and transaction index
		 *
		 * @param {string|number|Spook} block block number or hash
		 * @param {string|number|Spook} index index of a transaction within a block
		 * @returns {Spook.<Transaction>} transaction at that index
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.transaction(spooks.blockNumber, 0)
		 *	.tie(console.log) // prints the first uncle in latest block
		 *
		 */
		this.transaction = null;
		/**
		 * Returns receipt given transaction hash.
		 *
		 * @param {string|number|Spook} hash transaction hash
		 * @returns {Spook.<TransactionReceipt>} transaction at that index
		 *
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.receipt(spooks.transaction(spooks.height, 0).map(x => x ? x.hash : undefined))
		 *	.tie(console.log) // prints receipt of first transaction in latest block
		 *
		 */
		this.receipt = null;

		/**
		 * Returns client version string. (`web3_clientVersion`).
		 *
		 * @type {Spook.<String>}
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.clientVersion
		 *	.tie(console.log)
		 *
		 */
		this.clientVersion = null;

		/**
		 * Returns current peer count. (`net_peerCount`).
		 *
		 * @type {Spook.<Number>}
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.peerCount
		 *	.tie(console.log)
		 *
		 */
		this.peerCount = null;
		/**
		 * Returns true if the node is actively listening for network connections.
		 *
		 * @type {Spook.<bool>}
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.listening
		 *	.tie(console.log)
		 *
		 */
		this.listening = null;
		/**
		 * Returns chain id (used for chain replay protection).
		 * NOTE: It's _not_ network id.
		 *
		 * @type {Spook.<Number>}
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.chainId
		 *	.tie(console.log)
		 *
		 */
		this.chainId = null;

		/**
		 * Returns a hash of content under given URL.
		 *
		 * @param {string|Spook} url URL of the content
		 * @returns {Spook.<string>} hash of the content
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.hashContent('https://google.com')
		 *	.tie(console.log)
		 *
		 */
		this.hashContent = null;
		this.gasPriceHistogram = null;
		this.accountsInfo = null;
		this.allAccountsInfo = null;
		this.hardwareAccountsInfo = null;
		this.mode = null;

		this.defaultExtraData = null;
		this.extraData = null;
		this.gasCeilTarget = null;
		this.gasFloorTarget = null;
		this.minGasPrice = null;
		this.transactionsLimit = null;
		/**
		 * Returns a string name of currently connected chain.
		 *
		 * @type {Spook.<string>}
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.chainName
		 *	.tie(console.log)
		 */
		this.chainName = null;
		/**
		 * Returns a status of currently connected chain.
		 *
		 * @type {Spook.<object>}
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.chainStatus
		 *	.tie(console.log)
		 */
		this.chainStatus = null;

		this.peers = null;
		this.enode = null;
		this.nodePort = null;
		this.nodeName = null;
		this.signerPort = null;
		this.dappsPort = null;
		this.dappsInterface = null;

		this.nextNonce = null;
		this.pending = null;
		this.local = null;
		this.future = null;
		this.pendingStats = null;
		this.unsignedCount = null;

		this.releaseInfo = null;
		this.versionInfo = null;
		this.consensusCapability = null;
		this.upgradeReady = null;

		/**
		 * Replays (re-executes) a transaction. Returns requested traces of execution.
		 *
		 * @param {string} hash Transaction hash
		 * @param {String[]} traces Any subset of `trace`,`vmTrace`,`stateDiff`.
		 * @returns {Spook.<object>}
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.replayTx('0x2ea2e504d09c458dbadc703112125564d53ca03c27a5b28e7b3e2b5804289c45', ['trace'])
		 *	.tie(console.log)
		 */
		this.replayTx = null;
		/**
		 * Executs a transaction and collects traces.
		 *
		 * @param {TransactionRequest} transaction Transaction request
		 * @param {String[]} traces Any subset of `trace`,`vmTrace`,`stateDiff`.
		 * @param {string|number|Spook} block Block number or hash
		 * @returns {Spook.<object>}
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.callTx({
		 *		from: spooks.me,
		 *		to: spooks.registry.address
		 *	}, ['trace'], 'latest')
		 *	.tie(console.log)
		 */
		this.callTx = null;

		/**
		 * Deploys a new contract
		 *
		 * @param {string|Bytes} init Initialization bytecode
		 * @param {ABI} abi Contract ABI
		 * @param {{from: ?Address, gas: ?BigNumber, gasPrice: ?BigNumber, nonce: ?BigNumber}} options Deployment options
		 * @returns {ReactivePromise.<DeployStatus>}
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.deployContract('0x1234', abi, {})
		 *	.tie(console.log) // Reports deployment progress
		 */
		this.deployContract = null;
		/**
		 * Creates spook-enabled contract object for existing contract.
		 *
		 * @param {string|Spook} address Contract address
		 * @param {ABI} abi Contract ABI
		 * @param {?ABI} extras Additional methods not defined in the ABI.
		 * @returns {Contract}
		 * @example
		 * const { spooks } = require('spycraft-tetsy')
		 *
		 * spooks
		 *	.makeContract(spooks.me, abi)
		 *	.someMethod()
		 *	.tie(console.log) // returns a result of someMethod call
		 */
		this.makeContract = null;

		/**
		 * Parity registry contract instance.
		 * @type {Contract.<Registry>}
		 */
		this.registry = null;

		/**
		 * Parity registry contract instance.
		 * @type {Contract.<GithubHint>}
		 */
		this.githubhint = null;
		/**
		 * Parity registry contract instance.
		 * @type {Contract.<Operations>}
		 */
		this.operations = null;
		/**
		 * Parity registry contract instance.
		 * @type {Contract.<BadgeReg>}
		 */
		this.badgereg = null;
		/**
		 * Parity registry contract instance.
		 * @type {Contract.<TokenReg>}
		 */
		this.tokenreg = null;

		/**
		 * A {@link Spook} representing all currently registered badges from BadgeReg.
		 *
		 * @type {Spook.<{id:string,name:string,img:string,caption:string,badge:Contract}[]>}
		 */
		this.badges = null;
		/**
		 * Returns a list of badges for given address.
		 *
		 * @param {Address} address
		 * @returns {Spook.<Badge[]>} see {@link Spooks.badges}
		 */
		this.badgesOf = null;

		/**
		 * A {@link Spook} representing all currently registered tokens from TokenReg.
		 *
		 * @type {Spook.<{id:string,tla:string,base:string,name:string,owner:address,img:string,caption:string}[]>}
		 */
		this.tokens = null;
		/**
		 * Returns a list of tokens with a non-empty balance for given address.
		 *
		 * @param {Address} address
		 * @returns {Spook.<Token[]>} see {@link Spooks.tokens}
		 */
		this.tokensOf = null;

		return this;
	}
}

function isNumber (n) {
	return typeof (n) === 'number' || (typeof (n) === 'string' && n.match(/^[0-9]+$/));
}

function memoized (f) {
	var memo;
	return function () {
		if (memo === undefined) { memo = f(); }
		return memo;
	};
}

function overlay (base, top) {
	Object.keys(top).forEach(k => {
		base[k] = top[k];
	});
	return base;
}

function transactionPromise (api, tx, progress, f) {
	progress({ initialising: null });
	let condition = tx.condition || null;
	Promise.all([api().eth.accounts(), api().eth.gasPrice()])
		.then(([a, p]) => {
			progress({ estimating: null });
			tx.from = tx.from || a[0];
			tx.gasPrice = tx.gasPrice || p;
			return tx.gas || api().eth.estimateGas(tx);
		})
		.then(g => {
			progress({ estimated: g });
			tx.gas = tx.gas || g;
			return api().parity.postTransaction(tx);
		})
		.then(signerRequestId => {
			progress({ requested: signerRequestId });
			return api().pollMethod('parity_checkRequest', signerRequestId);
		})
		.then(transactionHash => {
			if (condition) {
				progress(f({ signed: transactionHash, scheduled: condition }));
				return { signed: transactionHash, scheduled: condition };
			} else {
				progress({ signed: transactionHash });
				return api()
					.pollMethod('eth_getTransactionReceipt', transactionHash, (receipt) => receipt && receipt.blockNumber && !receipt.blockNumber.eq(0))
					.then(receipt => {
						progress(f({ confirmed: receipt }));
						return receipt;
					});
			}
		})
		.catch(error => {
			progress({ failed: error });
		});
}

class DeployContract extends spycraft.ReactivePromise {
	constructor (initSpook, abiSpook, optionsSpook, api) {
		super([initSpook, abiSpook, optionsSpook, spooks.registry], [], ([init, abi, options, registry]) => {
			options.data = init;
			delete options.to;
			let progress = this.trigger.bind(this);
			transactionPromise(api, options, progress, status => {
				if (status.confirmed) {
					status.deployed = spooks.makeContract(status.confirmed.contractAddress, abi, options.extras || []);
				}
				return status;
			});
			// TODO: consider allowing registry of the contract here.
		}, false);
		this.then(_ => null);
	}
	isDone (s) {
		return !!(s.failed || s.confirmed);
	}
}

class Transaction extends spycraft.ReactivePromise {
	constructor (tx, api) {
		super([tx], [], ([tx]) => {
			let progress = this.trigger.bind(this);
			transactionPromise(api, tx, progress, _ => _);
		}, false);
		this.then(_ => null);
	}
	isDone (s) {
		return !!(s.failed || s.confirmed);
	}
}

/**
 * @param {{api: ParityApi}} Options object
 * @returns {Spooks}
 */
function createSpooks (options) {
	const spooks = new Spooks();

	// We only ever use api() at call-time of this function; this allows the
	// options (particularly the transport option) to be changed dynamically
	// and the datastructure to be reused.
	const api = () => options.api;
	const util = ParityApi.util;

	class TransformSpook extends spycraft.TransformSpook {
		constructor (f, a = [], d = [], outResolveDepth = 0, resolveDepth = 1, latched = true, mayBeNull = true) {
			super(f, a, d, outResolveDepth, resolveDepth, latched, mayBeNull, api());
		}
		map (f, outResolveDepth = 0, resolveDepth = 1) {
			return new TransformSpook(f, [this], [], outResolveDepth, resolveDepth);
		}
		sub (name, outResolveDepth = 0, resolveDepth = 1) {
			return new TransformSpook((r, n) => r[n], [this, name], [], outResolveDepth, resolveDepth);
		}
		static all (list) {
			return new TransformSpook((...args) => args, list);
		}
	}

	class SubscriptionSpook extends spycraft.Spook {
		constructor (module, rpcName, options = []) {
			super();
			this.module = module;
			this.rpcName = rpcName;
			this.options = [(_, n) => this.trigger(n), ...options];
		}
		initialise () {
			// promise instead of id because if a dependency triggers finalise() before id's promise is resolved the unsubscribing would call with undefined
			this.subscription = api().pubsub[this.module][this.rpcName](...this.options);
		}
		finalise () {
			this.subscription.then(id => api().pubsub.unsubscribe([id]));
		}
		map (f, outResolveDepth = 0, resolveDepth = 1) {
			return new TransformSpook(f, [this], [], outResolveDepth, resolveDepth);
		}
		sub (name, outResolveDepth = 0, resolveDepth = 1) {
			return new TransformSpook((r, n) => r[n], [this, name], [], outResolveDepth, resolveDepth);
		}
		static all (list) {
			return new TransformSpook((...args) => args, list);
		}
	}

	class Signature extends spycraft.ReactivePromise {
		constructor (message, from) {
			super([message, from], [], ([message, from]) => {
				api().parity.postSign(from, asciiToHex(message))
					.then(signerRequestId => {
						this.trigger({ requested: signerRequestId });
						return api().pollMethod('parity_checkRequest', signerRequestId);
					})
					.then(signature => {
						this.trigger({
							signed: splitSignature(signature)
						});
					})
					.catch(error => {
						console.error(error);
						this.trigger({ failed: error });
					});
			}, false);
			this.then(_ => null);
		}
		isDone (s) {
			return !!s.failed || !!s.signed;
		}
	}

	function call (addr, method, args, options) {
		let data = util.abiEncode(method.name, method.inputs.map(f => f.type), args);
		let decode = d => util.abiDecode(method.outputs.map(f => f.type), d);
		return api().eth.call(overlay({ to: addr, data: data }, options)).then(decode);
	}

	function post (addr, method, args, options) {
		let toOptions = (addr, method, options, ...args) => {
			return overlay({ to: addr, data: util.abiEncode(method.name, method.inputs.map(f => f.type), args) }, options);
		};
		// inResolveDepth is 2 to allow for Spooked `condition`values which are
		// object values in `options`.
		return new Transaction(new TransformSpook(toOptions, [addr, method, options, ...args], [], 0, 2), api);
	}

	function presub (f) {
		return new Proxy(f, {
			get (receiver, name) {
				if (typeof (name) === 'string' || typeof (name) === 'number') {
					return typeof (receiver[name]) !== 'undefined' ? receiver[name] : receiver(name);
				} else if (typeof (name) === 'symbol' && spycraft.Spook.knowSymbol(name)) {
					return receiver(spycraft.Spook.fromSymbol(name));
				} else {
					throw new Error(`Weird value type to be subscripted by: ${typeof (name)}: ${JSON.stringify(name)}`);
				}
			}
		});
	}

	let useSubs = false;

	spooks.time = new spycraft.TimeSpook();

	if (!useSubs) {
		spooks.height = new TransformSpook(() => api().eth.blockNumber().then(_ => +_), [], [spooks.time]);

		let onAccountsChanged = spooks.time; // TODO: more accurate notification
		let onHardwareAccountsChanged = spooks.time; // TODO: more accurate notification
		let onHeadChanged = spooks.height;	// TODO: more accurate notification
		//	let onReorg = undefined;	// TODO make more accurate.
		let onSyncingChanged = spooks.time;
		let onAuthoringDetailsChanged = spooks.time;
		let onPeerNetChanged = spooks.time; // TODO: more accurate notification
		let onPendingChanged = spooks.time; // TODO: more accurate notification
		let onUnsignedChanged = spooks.time; // TODO: more accurate notification
		let onAutoUpdateChanged = spooks.height;

		// eth_
		spooks.blockNumber = spooks.height;
		spooks.blockByNumber = x => new TransformSpook(x => api().eth.getBlockByNumber(x), [x], []).subscriptable();// TODO: chain reorg that includes number x
		spooks.blockByHash = x => new TransformSpook(x => api().eth.getBlockByHash(x), [x]).subscriptable();
		spooks.findBlock = hashOrNumberSpook => new TransformSpook(hashOrNumber => isNumber(hashOrNumber)
			? api().eth.getBlockByNumber(hashOrNumber)
			: api().eth.getBlockByHash(hashOrNumber),
		[hashOrNumberSpook], [/* onReorg */]).subscriptable();// TODO: chain reorg that includes number x, if x is a number
		spooks.blocks = presub(spooks.findBlock);
		spooks.block = spooks.blockByNumber(spooks.height);	// TODO: DEPRECATE AND REMOVE
		spooks.head = new TransformSpook(() => api().eth.getBlockByNumber('latest'), [], [onHeadChanged]).subscriptable();// TODO: chain reorgs
		spooks.author = new TransformSpook(() => api().eth.coinbase(), [], [onAccountsChanged]);
		spooks.accounts = new TransformSpook(a => a.map(util.toChecksumAddress), [new TransformSpook(() => api().eth.accounts(), [], [onAccountsChanged])]).subscriptable();
		spooks.defaultAccount = spooks.accounts[0];	// TODO: make this use its subscription
		spooks.me = spooks.accounts[0];
		// TODO [ToDr] document (Post & Sign)
		spooks.post = tx => new Transaction(tx, api);
		spooks.sign = (message, from = spooks.me) => new Signature(message, from);

		spooks.balance = x => new TransformSpook(x => api().eth.getBalance(x), [x], [onHeadChanged]);
		spooks.code = x => new TransformSpook(x => api().eth.getCode(x), [x], [onHeadChanged]);
		spooks.nonce = x => new TransformSpook(x => api().eth.getTransactionCount(x).then(_ => +_), [x], [onHeadChanged]);
		spooks.storageAt = (x, y) => new TransformSpook((x, y) => api().eth.getStorageAt(x, y), [x, y], [onHeadChanged]);

		spooks.syncing = new TransformSpook(() => api().eth.syncing(), [], [onSyncingChanged]);
		spooks.hashrate = new TransformSpook(() => api().eth.hashrate(), [], [onAuthoringDetailsChanged]);
		spooks.authoring = new TransformSpook(() => api().eth.mining(), [], [onAuthoringDetailsChanged]);
		spooks.ethProtocolVersion = new TransformSpook(() => api().eth.protocolVersion(), [], []);
		spooks.gasPrice = new TransformSpook(() => api().eth.gasPrice(), [], [onHeadChanged]);
		spooks.estimateGas = x => new TransformSpook(x => api().eth.estimateGas(x), [x], [onHeadChanged, onPendingChanged]);

		spooks.blockTransactionCount = hashOrNumberSpook => new TransformSpook(
			hashOrNumber => isNumber(hashOrNumber)
				? api().eth.getBlockTransactionCountByNumber(hashOrNumber).then(_ => +_)
				: api().eth.getBlockTransactionCountByHash(hashOrNumber).then(_ => +_),
			[hashOrNumberSpook], [/* onReorg */]);
		spooks.uncleCount = hashOrNumberSpook => new TransformSpook(
			hashOrNumber => isNumber(hashOrNumber)
				? api().eth.getUncleCountByBlockNumber(hashOrNumber).then(_ => +_)
				: api().eth.getUncleCountByBlockHash(hashOrNumber).then(_ => +_),
			[hashOrNumberSpook], [/* onReorg */]).subscriptable();
		spooks.uncle = (hashOrNumberSpook, indexSpook) => new TransformSpook(
			(hashOrNumber, index) => isNumber(hashOrNumber)
				? api().eth.getUncleByBlockNumber(hashOrNumber, index)
				: api().eth.getUncleByBlockHash(hashOrNumber, index),
			[hashOrNumberSpook, indexSpook], [/* onReorg */]).subscriptable();
		spooks.transaction = (hashOrNumberSpook, indexOrNullSpook) => new TransformSpook(
			(hashOrNumber, indexOrNull) =>
				indexOrNull === undefined || indexOrNull === null
					? api().eth.getTransactionByHash(hashOrNumber)
					: isNumber(hashOrNumber)
						? api().eth.getTransactionByBlockNumberAndIndex(hashOrNumber, indexOrNull)
						: api().eth.getTransactionByBlockHashAndIndex(hashOrNumber, indexOrNull),
			[hashOrNumberSpook, indexOrNullSpook], [/* onReorg */]).subscriptable();
		spooks.receipt = hashSpook => new TransformSpook(x => api().eth.getTransactionReceipt(x), [hashSpook], []).subscriptable();

		// web3_
		spooks.clientVersion = new TransformSpook(() => api().web3.clientVersion(), [], []);

		// net_
		spooks.peerCount = new TransformSpook(() => api().net.peerCount().then(_ => +_), [], [onPeerNetChanged]);
		spooks.listening = new TransformSpook(() => api().net.listening(), [], [onPeerNetChanged]);
		spooks.chainId = new TransformSpook(() => api().net.version(), [], []);

		// parity_
		spooks.hashContent = u => new TransformSpook(x => api().parity.hashContent(x), [u], [], false);
		spooks.gasPriceHistogram = new TransformSpook(() => api().parity.gasPriceHistogram(), [], [onHeadChanged]).subscriptable();
		spooks.accountsInfo = new TransformSpook(() => api().parity.accountsInfo(), [], [onAccountsChanged]).subscriptable(2);
		spooks.allAccountsInfo = new TransformSpook(() => api().parity.allAccountsInfo(), [], [onAccountsChanged]).subscriptable(2);
		spooks.hardwareAccountsInfo = new TransformSpook(() => api().parity.hardwareAccountsInfo(), [], [onHardwareAccountsChanged]).subscriptable(2);
		spooks.mode = new TransformSpook(() => api().parity.mode(), [], [spooks.height]);

		// ...authoring
		spooks.defaultExtraData = new TransformSpook(() => api().parity.defaultExtraData(), [], [onAuthoringDetailsChanged]);
		spooks.extraData = new TransformSpook(() => api().parity.extraData(), [], [onAuthoringDetailsChanged]);
		spooks.gasCeilTarget = new TransformSpook(() => api().parity.gasCeilTarget(), [], [onAuthoringDetailsChanged]);
		spooks.gasFloorTarget = new TransformSpook(() => api().parity.gasFloorTarget(), [], [onAuthoringDetailsChanged]);
		spooks.minGasPrice = new TransformSpook(() => api().parity.minGasPrice(), [], [onAuthoringDetailsChanged]);
		spooks.transactionsLimit = new TransformSpook(() => api().parity.transactionsLimit(), [], [onAuthoringDetailsChanged]);

		// ...chain info
		spooks.chainName = new TransformSpook(() => api().parity.netChain(), [], []);
		spooks.chainStatus = new TransformSpook(() => api().parity.chainStatus(), [], [onSyncingChanged]).subscriptable();

		// ...networking
		spooks.peers = new TransformSpook(() => api().parity.netPeers(), [], [onPeerNetChanged]).subscriptable(2);
		spooks.enode = new TransformSpook(() => api().parity.enode(), [], []);
		spooks.nodePort = new TransformSpook(() => api().parity.netPort().then(_ => +_), [], []);
		spooks.nodeName = new TransformSpook(() => api().parity.nodeName(), [], []);
		spooks.signerPort = new TransformSpook(() => api().parity.signerPort().then(_ => +_), [], []);
		spooks.dappsPort = new TransformSpook(() => api().parity.dappsPort().then(_ => +_), [], []);
		spooks.dappsInterface = new TransformSpook(() => api().parity.dappsInterface(), [], []);

		// ...transaction queue
		spooks.nextNonce = new TransformSpook(() => api().parity.nextNonce().then(_ => +_), [], [onPendingChanged]);
		spooks.pending = new TransformSpook(() => api().parity.pendingTransactions(), [], [onPendingChanged]);
		spooks.local = new TransformSpook(() => api().parity.localTransactions(), [], [onPendingChanged]).subscriptable(3);
		spooks.future = new TransformSpook(() => api().parity.futureTransactions(), [], [onPendingChanged]).subscriptable(2);
		spooks.pendingStats = new TransformSpook(() => api().parity.pendingTransactionsStats(), [], [onPendingChanged]).subscriptable(2);
		spooks.unsignedCount = new TransformSpook(() => api().parity.parity_unsignedTransactionsCount().then(_ => +_), [], [onUnsignedChanged]);

		// ...auto-update
		spooks.releasesInfo = new TransformSpook(() => api().parity.releasesInfo(), [], [onAutoUpdateChanged]).subscriptable();
		spooks.versionInfo = new TransformSpook(() => api().parity.versionInfo(), [], [onAutoUpdateChanged]).subscriptable();
		spooks.consensusCapability = new TransformSpook(() => api().parity.consensusCapability(), [], [onAutoUpdateChanged]);
		spooks.upgradeReady = new TransformSpook(() => api().parity.upgradeReady(), [], [onAutoUpdateChanged]).subscriptable();
	} else {
		spooks.height = new TransformSpook(_ => +_, [new SubscriptionSpook('eth', 'blockNumber')]).subscriptable();

		let onAutoUpdateChanged = spooks.height;

		// eth_
		spooks.blockNumber = spooks.height;
		spooks.blockByNumber = numberSpook => new TransformSpook(number => new SubscriptionSpook('eth', 'getBlockByNumber', [number]), [numberSpook]).subscriptable();
		spooks.blockByHash = x => new TransformSpook(x => new SubscriptionSpook('eth', 'getBlockByHash', [x]), [x]).subscriptable();
		spooks.findBlock = hashOrNumberSpook => new TransformSpook(hashOrNumber => isNumber(hashOrNumber)
			? new SubscriptionSpook('eth', 'getBlockByNumber', [hashOrNumber])
			: new SubscriptionSpook('eth', 'getBlockByHash', [hashOrNumber]),
		[hashOrNumberSpook]).subscriptable();
		spooks.blocks = presub(spooks.findBlock);
		spooks.block = spooks.blockByNumber(spooks.height);	// TODO: DEPRECATE AND REMOVE
		spooks.head = new SubscriptionSpook('eth', 'getBlockByNumber', ['latest']).subscriptable();
		spooks.author = new SubscriptionSpook('eth', 'coinbase');
		spooks.me = new SubscriptionSpook('parity', 'defaultAccount');
		spooks.defaultAccount = spooks.me;	// TODO: DEPRECATE
		spooks.accounts = new SubscriptionSpook('eth', 'accounts').subscriptable();
		spooks.post = tx => new Transaction(tx, api);
		spooks.sign = (message, from = spooks.me) => new Signature(message, from);

		spooks.balance = x => new TransformSpook(x => new SubscriptionSpook('eth', 'getBalance', [x]), [x]);
		spooks.code = x => new TransformSpook(x => new SubscriptionSpook('eth', 'getCode', [x]), [x]);
		spooks.nonce = x => new TransformSpook(x => new SubscriptionSpook('eth', 'getTransactionCount', [x]), [x]); // TODO: then(_ => +_) Depth 2 if second TransformSpook or apply to result
		spooks.storageAt = (x, y) => new TransformSpook((x, y) => new SubscriptionSpook('eth', 'getStorageAt', [x, y]), [x, y]);

		spooks.syncing = new SubscriptionSpook('eth', 'syncing');
		spooks.hashrate = new SubscriptionSpook('eth', 'hashrate');
		spooks.authoring = new SubscriptionSpook('eth', 'mining');
		spooks.ethProtocolVersion = new SubscriptionSpook('eth', 'protocolVersion');
		spooks.gasPrice = new SubscriptionSpook('eth', 'gasPrice');
		spooks.estimateGas = x => new TransformSpook(x => new SubscriptionSpook('eth', 'estimateGas', [x]), [x]);

		spooks.blockTransactionCount = hashOrNumberSpook => new TransformSpook(
			hashOrNumber => isNumber(hashOrNumber)
				? new TransformSpook(_ => +_, [new SubscriptionSpook('eth', 'getBlockTransactionCountByNumber', [hashOrNumber])])
				: new TransformSpook(_ => +_, [new SubscriptionSpook('eth', 'getBlockTransactionCountByHash', [hashOrNumber])]),
			[hashOrNumberSpook]);
		spooks.uncleCount = hashOrNumberSpook => new TransformSpook(
			hashOrNumber => isNumber(hashOrNumber)
				? new TransformSpook(_ => +_, [new SubscriptionSpook('eth', 'getUncleCountByBlockNumber', [hashOrNumber])])
				: new TransformSpook(_ => +_, [new SubscriptionSpook('eth', 'getUncleCountByBlockHash', [hashOrNumber])]),
			[hashOrNumberSpook]).subscriptable();
		spooks.uncle = (hashOrNumberSpook, indexSpook) => new TransformSpook(
			(hashOrNumber, index) => isNumber(hashOrNumber)
				? new SubscriptionSpook('eth', 'getUncleByBlockNumberAndIndex', [hashOrNumber, index])
				: new SubscriptionSpook('eth', 'getUncleByBlockHashAndIndex', [hashOrNumber, index]),
			[hashOrNumberSpook, indexSpook]).subscriptable();

		spooks.transaction = (hashOrNumberSpook, indexOrNullSpook) => new TransformSpook(
			(hashOrNumber, indexOrNull) =>
				indexOrNull === undefined || indexOrNull === null
					? new SubscriptionSpook('eth', 'getTransactionByHash', [hashOrNumber])
					: isNumber(hashOrNumber)
						? new SubscriptionSpook('eth', 'getTransactionByBlockNumberAndIndex', [hashOrNumber, indexOrNull])
						: new SubscriptionSpook('eth', 'getTransactionByBlockHashAndIndex', [hashOrNumber, indexOrNull]),
			[hashOrNumberSpook, indexOrNullSpook]).subscriptable();
		spooks.receipt = hashSpook => new TransformSpook(x => new SubscriptionSpook('eth', 'getTransactionReceipt', [x]), [hashSpook]).subscriptable();

		// web3_
		spooks.clientVersion = new TransformSpook(() => api().web3.clientVersion(), [], []);

		// net_
		spooks.peerCount = new TransformSpook(_ => +_, [new SubscriptionSpook('net', 'peerCount')]);
		spooks.listening = new SubscriptionSpook('net', 'listening');
		spooks.chainId = new SubscriptionSpook('net', 'version');

		// parity_
		spooks.hashContent = u => new TransformSpook(x => api().parity.hashContent(x), [u], [], false);
		spooks.gasPriceHistogram = new SubscriptionSpook('parity', 'gasPriceHistogram').subscriptable();
		spooks.mode = new SubscriptionSpook('parity', 'mode');
		spooks.accountsInfo = new SubscriptionSpook('parity', 'accountsInfo').subscriptable(2);
		spooks.allAccountsInfo = new SubscriptionSpook('parity', 'allAccountsInfo').subscriptable(2);
		spooks.hardwareAccountsInfo = new SubscriptionSpook('parity', 'hardwareAccountsInfo').subscriptable(2);

		// ...authoring
		spooks.defaultExtraData = new SubscriptionSpook('parity', 'defaultExtraData');
		spooks.extraData = new SubscriptionSpook('parity', 'extraData');
		spooks.gasCeilTarget = new SubscriptionSpook('parity', 'gasCeilTarget');
		spooks.gasFloorTarget = new SubscriptionSpook('parity', 'gasFloorTarget');
		spooks.minGasPrice = new SubscriptionSpook('parity', 'minGasPrice');
		spooks.transactionsLimit = new SubscriptionSpook('parity', 'transactionsLimit');

		// ...chain info
		spooks.chainName = new SubscriptionSpook('parity', 'netChain');
		spooks.chainStatus = new SubscriptionSpook('parity', 'chainStatus').subscriptable();

		// ...networking
		spooks.peers = new SubscriptionSpook('parity', 'netPeers').subscriptable(2);
		spooks.enode = new SubscriptionSpook('parity', 'enode');
		spooks.nodePort = new TransformSpook(_ => +_, [new SubscriptionSpook('parity', 'netPort')]);
		spooks.nodeName = new SubscriptionSpook('parity', 'nodeName');
		// Where defined ?
		spooks.signerPort = new TransformSpook(() => api().parity.signerPort().then(_ => +_), [], []);
		spooks.dappsPort = new TransformSpook(() => api().parity.dappsPort().then(_ => +_), [], []);
		spooks.dappsInterface = new TransformSpook(() => api().parity.dappsInterface(), [], []);

		// ...transaction queue
		spooks.nextNonce = new TransformSpook(_ => +_, [new SubscriptionSpook('parity', 'nextNonce')]);
		spooks.pending = new SubscriptionSpook('parity', 'pendingTransactions').subscriptable();
		spooks.local = new SubscriptionSpook('parity', 'localTransactions').subscriptable(3);
		spooks.future = new SubscriptionSpook('parity', 'futureTransactions').subscriptable(2);
		spooks.pendingStats = new SubscriptionSpook('parity', 'pendingTransactionsStats').subscriptable(2);
		spooks.unsignedCount = new TransformSpook(_ => +_, [new SubscriptionSpook('parity', 'unsignedTransactionsCount')]);
		spooks.requestsToConfirm = new SubscriptionSpook('signer', 'requestsToConfirm');

		// ...auto-update
		spooks.releasesInfo = new SubscriptionSpook('parity', 'releasesInfo').subscriptable();
		spooks.versionInfo = new SubscriptionSpook('parity', 'versionInfo').subscriptable();
		spooks.consensusCapability = new SubscriptionSpook('parity', 'consensusCapability').subscriptable();
		spooks.upgradeReady = new TransformSpook(() => api().parity.upgradeReady(), [], [onAutoUpdateChanged]).subscriptable();
	}

	// trace TODO: Implement contract object with new trace_many feature
	spooks.replayTx = (x, whatTrace) => new TransformSpook((x, whatTrace) => api().trace.replayTransaction(x, whatTrace), [x, whatTrace], []).subscriptable();
	spooks.callTx = (x, whatTrace, blockNumber) => new TransformSpook((x, whatTrace, blockNumber) => api().trace.call(x, whatTrace, blockNumber), [x, whatTrace, blockNumber], []).subscriptable();

	function traceCall (addr, method, args, options) {
		let data = util.abiEncode(method.name, method.inputs.map(f => f.type), args);
		let decode = d => util.abiDecode(method.outputs.map(f => f.type), d);
		let traceMode = options.traceMode;
		delete options.traceMode;
		return api().trace.call(overlay({ to: addr, data: data }, options), traceMode, 'latest').then(decode);
	}

	spooks.deployContract = function (init, abi, options = {}) {
		return new DeployContract(init, abi, options, api);
	};

	spooks.makeContract = function (address, abi, extras = [], debug = false) {
		var r = { address: address };
		let unwrapIfOne = a => a.length === 1 ? a[0] : a;
		abi.forEach(i => {
			if (i.type === 'function' && i.constant) {
				let f = function (...args) {
					var options = args.length === i.inputs.length + 1 ? args.pop() : {};
					if (args.length !== i.inputs.length) {
						throw new Error(`Invalid number of arguments to ${i.name}. Expected ${i.inputs.length}, got ${args.length}.`);
					}
					let f = (addr, ...fargs) => debug
						? traceCall(address, i, args, options)
						: call(addr, i, fargs, options)
							.then(rets => rets.map((r, o) => cleanup(r, i.outputs[o].type, api)))
							.then(unwrapIfOne);
					return new TransformSpook(f, [address, ...args], [spooks.height]).subscriptable();	// TODO: should be subscription on contract events
				};
				r[i.name] = (i.inputs.length === 0) ? memoized(f) : (i.inputs.length === 1) ? presub(f) : f;
				r[i.name].args = i.inputs;
			}
		});
		extras.forEach(i => {
			let f = function (...args) {
				let expectedInputs = (i.numInputs || i.args.length);
				var options = args.length === expectedInputs + 1 ? args.pop() : {};
				if (args.length !== expectedInputs) {
					throw new Error(`Invalid number of arguments to ${i.name}. Expected ${expectedInputs}, got ${args.length}. ${args}`);
				}
				let c = abi.find(j => j.name === i.method);
				let f = (addr, ...fargs) => {
					let args = i.args.map((v, index) => v === null ? fargs[index] : typeof (v) === 'function' ? v(fargs[index]) : v);
					return debug
						? traceCall(address, i, args, options)
						: call(addr, c, args, options).then(unwrapIfOne);
				};
				return new TransformSpook(f, [address, ...args], [spooks.height]).subscriptable();	// TODO: should be subscription on contract events
			};
			r[i.name] = (i.args.length === 1) ? presub(f) : f;
			r[i.name].args = i.args;
		});
		abi.forEach(i => {
			if (i.type === 'function' && !i.constant) {
				r[i.name] = function (...args) {
					var options = args.length === i.inputs.length + 1 ? args.pop() : {};
					if (args.length !== i.inputs.length) { throw new Error(`Invalid number of arguments to ${i.name}. Expected ${i.inputs.length}, got ${args.length}. ${args}`); }
					return debug
						? traceCall(address, i, args, options)
						: post(address, i, args, options).subscriptable();
				};
				r[i.name].args = i.inputs;
			}
		});
		var eventLookup = {};
		abi.filter(i => i.type === 'event').forEach(i => {
			eventLookup[util.abiSignature(i.name, i.inputs.map(f => f.type))] = i.name;
		});

		function prepareIndexEncode (v, t, top = true) {
			if (v instanceof Array) {
				if (top) {
					return v.map(x => prepareIndexEncode(x, t, false));
				} else {
					throw new Error('Invalid type');
				}
			}
			var val;
			if (t === 'string' || t === 'bytes') {
				val = util.sha3(v);
			} else {
				val = util.abiEncode(null, [t], [v]);
			}
			if (val.length !== 66) {
				throw new Error('Invalid length');
			}
			return val;
		}

		abi.forEach(i => {
			if (i.type === 'event') {
				r[i.name] = function (indexed = {}, params = {}) {
					return new TransformSpook((addr, indexed) => {
						var topics = [util.abiSignature(i.name, i.inputs.map(f => f.type))];
						i.inputs.filter(f => f.indexed).forEach(f => {
							try {
								topics.push(indexed[f.name] ? prepareIndexEncode(indexed[f.name], f.type) : null);
							} catch (e) {
								throw new Error(`Couldn't encode indexed parameter ${f.name} of type ${f.type} with value ${indexed[f.name]}`);
							}
						});
						return api().eth.getLogs({
							address: addr,
							fromBlock: params.fromBlock || 0,
							toBlock: params.toBlock || 'pending',
							limit: params.limit || 10,
							topics: topics
						}).then(logs => logs.map(l => {
							l.blockNumber = +l.blockNumber;
							l.transactionIndex = +l.transactionIndex;
							l.logIndex = +l.logIndex;
							l.transactionLogIndex = +l.transactionLogIndex;
							var e = {};
							let unins = i.inputs.filter(f => !f.indexed);
							util.abiDecode(unins.map(f => f.type), l.data).forEach((v, j) => {
								let f = unins[j];
								if (v instanceof Array && !f.type.endsWith(']')) {
									v = util.bytesToHex(v);
								}
								if (f.type.substr(0, 4) === 'uint' && +f.type.substr(4) <= 48) {
									v = +v;
								}
								e[f.name] = v;
							});
							i.inputs.filter(f => f.indexed).forEach((f, j) => {
								if (f.type === 'string' || f.type === 'bytes') {
									e[f.name] = l.topics[1 + j];
								} else {
									var v = util.abiDecode([f.type], l.topics[1 + j])[0];
									if (v instanceof Array) {
										v = util.bytesToHex(v);
									}
									if (f.type.substr(0, 4) === 'uint' && +f.type.substr(4) <= 48) {
										v = +v;
									}
									e[f.name] = v;
								}
							});
							e.event = eventLookup[l.topics[0]];
							e.log = l;
							return e;
						}));
					}, [address, indexed], [spooks.height]).subscriptable();
				};
				r[i.name].args = i.inputs;
			}
		});
		return r;
	};

	if (useSubs) {
		spooks.registry = spooks.makeContract(new SubscriptionSpook('parity', 'registryAddress'), RegistryABI, RegistryExtras);
	} else {
		spooks.registry = spooks.makeContract(new TransformSpook(() => api().parity.registryAddress(), [], [spooks.time]), RegistryABI, RegistryExtras);
	}

	spooks.githubhint = spooks.makeContract(spooks.registry.lookupAddress('githubhint', 'A'), GitHubHintABI);
	spooks.operations = spooks.makeContract(spooks.registry.lookupAddress('operations', 'A'), OperationsABI);
	spooks.badgereg = spooks.makeContract(spooks.registry.lookupAddress('badgereg', 'A'), BadgeRegABI);
	spooks.tokenreg = spooks.makeContract(spooks.registry.lookupAddress('tokenreg', 'A'), TokenRegABI);

	spooks.badges = new TransformSpook(n => {
		var ret = [];
		for (var i = 0; i < +n; ++i) {
			let id = i;
			ret.push(spycraft.Spook.all([
				spooks.badgereg.badge(id),
				spooks.badgereg.meta(id, 'IMG'),
				spooks.badgereg.meta(id, 'CAPTION')
			]).map(([[addr, name, owner], img, caption]) => ({
				id,
				name,
				img,
				caption,
				badge: spooks.makeContract(addr, BadgeABI)
			}))
			);
		}
		return ret;
	}, [spooks.badgereg.badgeCount()], [], 1);

	spooks.badgesOf = address => new TransformSpook(
		(addr, bads) => bads.map(b => ({
			certified: b.badge.certified(addr),
			badge: b.badge,
			id: b.id,
			img: b.img,
			caption: b.caption,
			name: b.name
		})),
		[address, spooks.badges], [], 2
	).map(all => all.filter(_ => _.certified));

	spooks.tokens = new TransformSpook(n => {
		var ret = [];
		for (var i = 0; i < +n; ++i) {
			let id = i;
			ret.push(spycraft.Spook.all([
				spooks.tokenreg.token(id),
				spooks.tokenreg.meta(id, 'IMG'),
				spooks.tokenreg.meta(id, 'CAPTION')
			]).map(([[addr, tla, base, name, owner], img, caption]) => ({
				id,
				tla,
				base,
				name,
				img,
				caption,
				token: spooks.makeContract(addr, TokenABI)
			}))
			);
		}
		return ret;
	}, [spooks.tokenreg.tokenCount()], [], 1);

	spooks.tokensOf = address => new TransformSpook(
		(addr, bads) => bads.map(b => ({
			balance: b.token.balanceOf(addr),
			token: b.token,
			id: b.id,
			name: b.name,
			tla: b.tla,
			base: b.base,
			img: b.img,
			caption: b.caption
		})),
		[address, spooks.tokens], [], 2
	).map(all => all.filter(_ => _.balance.gt(0)));

	spooks.namesOf = address => new TransformSpook((reg, addr, accs) => ({
		owned: accs[addr] ? accs[addr].name : null,
		registry: reg || null
	}), [spooks.registry.reverse(address), address, spooks.accountsInfo]);

	spooks.registry.names = spycraft.Spook.mapAll([spooks.registry.ReverseConfirmed({}, { limit: 100 }), spooks.accountsInfo],
		(reg, info) => {
			let r = {};
			Object.keys(info).forEach(k => r[k] = info[k].name);
			reg.forEach(a => r[a.reverse] = spooks.registry.reverse(a.reverse));
			return r;
		}, 1);

	return spooks;
}

const t = defaultProvider();
const options = t ? { api: new ParityApi(t) } : null;
/** @type {Spooks} */
const spooks = options ? createSpooks(options) : null;

const isOwned = addr => spycraft.Spook.mapAll([addr, spooks.accounts], (a, as) => as.indexOf(a) !== -1);
const isNotOwned = addr => spycraft.Spook.mapAll([addr, spooks.accounts], (a, as) => as.indexOf(a) === -1);

module.exports = {
	// Spooks stuff
	// abiPolyfill,
	options,
	spooks,
	Spooks,
	createSpooks,

	// Util functions
	isOwned,
	isNotOwned,
	asciiToHex,
	bytesToHex,
	hexToAscii,
	isAddressValid,
	toChecksumAddress,
	sha3,
	capitalizeFirstLetter,
	singleton,
	denominations,
	denominationMultiplier,
	interpretRender,
	combineValue,
	defDenom,
	formatValue,
	formatValueNoDenom,
	formatToExponential,
	interpretQuantity,
	splitValue,
	formatBalance,
	formatBlockNumber,
	isNullData,
	splitSignature,
	removeSigningPrefix,
	cleanup,

	// ABIs
	abiPolyfill,
	RegistryABI,
	RegistryExtras,
	GitHubHintABI,
	OperationsABI,
	BadgeRegABI,
	TokenRegABI,
	BadgeABI,
	TokenABI
};
