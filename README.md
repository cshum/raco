# caco

Generator based control flow that supports both callbacks and promises.

[![Build Status](https://travis-ci.org/cshum/caco.svg?branch=master)](https://travis-ci.org/cshum/caco)

Many of the existing async libraries require wrapping callback functions into promises to be usuable, which creates unnecessary complication. 

In caco, both callbacks and promises are 'yieldable'. 
Resulting function can be used by both callbacks and promises. 
This enables a powerful control flow while maintaining compatibility.

```bash
npm install caco
```

```js
var caco = require('caco')

var fn = caco(function * (next) {
  // try/catch errors
  try {
    yield Promise.reject('boom') // yield promise reject throws error
  } catch (err) {
    console.log(err) // 'boom'
  }

  var foo = yield Promise.resolve('bar') // yield promise
  yield setTimeout(next, 100) // yield callback using 'next' argument

  // yield callback of form next(err, data). Returning data, throw if err exists
  var data = yield fs.readfile('./foo/bar', next) 

  return data
})

// Use with callback
fn(function (err, res) { })

// Use with promise
fn().then(...).catch(...)
```

## API

#### var fn = caco(fn *)

Wraps a generator into a regular function that acceots callback or promise.

```js
var getN = caco(function * (n, next) {
  if (n === 689) yield Promise.reject('boom') // yield reject throws error
  return yield Promise.resolve(n)
})

getN(123, function (err, val) {
  console.log(val) // 123
})
getN(123).then(...)

getN(689).catch(function (err) {
  console.log(err) // boom
})
```

Generator accepts optional `next` argument for yieldable callback

## License

MIT
