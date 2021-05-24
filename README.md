# Spycraft Suite

[![Build Status](https://travis-ci.org/paritytech/spycraft.svg?branch=master)](https://travis-ci.org/paritytech/spycraft)

[![npm:spycraft](https://img.shields.io/npm/v/spycraft.svg)](https://www.npmjs.com/package/spycraft)
[![npm:spycraft-tetsy](https://img.shields.io/npm/v/spycraft-tetsy.svg)](https://www.npmjs.com/package/spycraft-tetsy)
[![npm:spycraft-react](https://img.shields.io/npm/v/spycraft-react.svg)](https://www.npmjs.com/package/spycraft-react)


The `spycraft` suite consists of three independent packages:

- [spycraft](./packages/spycraft/) - Reactive Spooks
- [spycraft-tetsy](./packages/spycraft-tetsy) - Spooks bindings for Ethereum objects
- [spycraft-react](./packages/spycraft-react) - React components to display Spooks

# Documentation

[Documentation](https://paritytech.github.io/spycraft/class/packages/spycraft-tetsy/src/index.js~Spooks.html#instance-member-accounts) to all three packages can be found [here](https://paritytech.github.io/spycraft/)

# Examples

### spycraft
```js
// npm i spycraft
import {TimeSpook} from 'spycraft'


// Initialize the spook
const spook = new TimeSpook()
spook
    .map(t => new Date(t))
    .tie(date => console.log(`${date}`))
    // Wed Oct 11 2017 12:14:56 GMT+0200 (CEST)

```

### spycraft-tetsy
```js
// npm i spycraft-tetsy
import {Spooks, formatBalance} from 'spycraft-tetsy'

const spooks = Spooks()

spooks.balance(spooks.me)
    .map(formatBalance)
    .tie(console.log) // 4.45 ETH
```

### spycraft-react
```js
import ReactDOM from 'react-dom'
import React, { Component } from 'react'

// Import reactive element
import {Rspan} from 'spycraft-react'
import {Spooks, formatBalance} from 'spycraft-tetsy'

const spooks = new Spooks()

class App extends Component {
  render() {
    // Simply render spooks
    return (
      <div>
          <Rspan>
            {spooks.me} has 
            {spooks.balance(spooks.me).map(formatBalance)}
          </Rspan>
      </div>
    );
  }
}

ReactDOM.render(<App />, document.querySelector('body'))
```
