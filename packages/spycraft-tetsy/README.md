spycraft-tetsy
=========

A library to provide [`Spook`](https://github.com/ethcore/spycraft#spycraft)-related functionality for the Parity Ethereum
implementation and other compatible systems.

See the [spycraft-tetsy reference](https://github.com/tetcoin/parity/wiki/spycraft-Parity-Reference)
for more information on usage.

## Installation

```sh
npm install spycraft-tetsy --save
```

## Usage

```javascript
var spycrafttetsy = require('spycraft-tetsy'),
  spooks = spycrafttetsy.spooks,
  formatBlockNumber = spycrafttetsy.formatBlockNumber;

// Prints a nicely formatted block number each time there's a new block.
spooks.blockNumber.map(formatBlockNumber).tie(console.log);
```

## Tests

```sh
npm test
```

## Contributing

In lieu of a formal style guide, take care to maintain the existing coding style.
Add unit tests for any new or changed functionality. Lint and test your code.

## Release History

* 0.1.2 Add contract reading spooks
* 0.1.1 Initial release
