# caco

Generator based control flow that supports both callbacks and promises.

[![Build Status](https://travis-ci.org/cshum/caco.svg?branch=master)](https://travis-ci.org/cshum/caco)

Many existing flow-control libraries such as [co](https://github.com/tj/co), assumes promises to be the lowest denominator of async handling.
Callback functions require promisify to be compatible, which creates unnecessary complication. 

In caco, both callbacks and promises are yieldable.
Resulting function can also be used by both callbacks and promises.
This enables a powerful control flow while maintaining compatibility.

```bash
npm install caco
```

```js
var caco = require('caco')

var fn = caco(function * (next) {
  try {
    yield Promise.reject('boom') // yield promise reject throws error
  } catch (err) {
    console.log(err) // 'boom'
  }

  var foo = yield Promise.resolve('bar') // yield promise

  yield setTimeout(next, 1000) // yield callback using 'next' argument, delay 1 second

  // yield callback of form next(err, data): return data, throw if err exists
  var data = yield fs.readFile('./foo/bar', next) 

  return data
})

// Use with callback
fn(function (err, res) { })

// Use with promise
fn().then(...).catch(...)
```

To enable yieldable callbacks, yielding non-promise-nor-generator value pauses the current generator. 
Until `next(err, val)` being invoked by callback, 
where `val` passes back to yielded value, or `throw` if `err` exists.

## API

#### var fn = caco(fn *)

Wraps a generator into a regular function that acceots callback or promise.
Accepts optional `next` argument for yieldable callback.

```js
var getN = caco(function * (n, next) {
  if (n === 689) yield Promise.reject('boom') // yield reject throws error
  return yield Promise.resolve(n)
})

getN(123, function (err, val) {
  console.log(val) // 123
})
getN(123).then(function (val) {
  console.log(val) // 123
})
getN(689).catch(function (err) {
  console.log(err) // boom
})
```

## License

MIT
