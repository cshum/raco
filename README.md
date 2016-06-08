# caco

Generator based control flow that supports both callbacks and promises.

[![Build Status](https://travis-ci.org/cshum/caco.svg?branch=master)](https://travis-ci.org/cshum/caco)

```bash
npm install caco
```

Many existing flow-control libraries such as [co](https://github.com/tj/co), assume promises to be the lowest denominator of async handling.
Callback functions require promisify to be compatible, which creates unnecessary complication. 

In caco, both callbacks and promises are yieldable.
Resulting function can also be used by both callbacks and promises.
This enables a powerful control flow while maintaining simplicity.

#### `caco(fn*, cb)`
#### `caco(fn*).then(...).catch(...)`

Resolves a generator function.
Accepts optional arguments and callback, or returns a promise if callback not exists.

```js
var caco = require('caco')

caco(function * (next) {
  try {
    yield Promise.reject('boom') // yield promise reject throws error
  } catch (err) {
    console.log(err) // 'boom'
  }

  var foo = yield Promise.resolve('bar') // yield promise

  yield setTimeout(next, 1000) // yield callback using 'next' argument, delay 1 second

  // yield callback of form next(err, data): return data, throw if err exists
  var data = yield fs.readFile('./foo/bar', next) 

}).catch(function (err) {
  // handle uncaught error
})

```

Yieldable callback works by supplying an additional `next` argument. Yielding non-yieldable value pauses the current generator. 
Until `next(err, val)` being invoked by callback, 
where `val` passes back to yielded value, or `throw` if `err` exists.

#### `var fn = caco.wrap(fn*)`

Wraps a generator function into regular function that optionally accepts callback or returns a promise.

```js
var fn = caco.wrap(function * (arg1, arg2, next) {
  yield setTimeout(next, 1000) // yield callback using 'next'

  return yield Promise.resolve(arg1 + arg2)
})

fn(167, 199, function (err, val) { ... }) // Use with callback

fn(167, 689) // use with promise
  .then(function (val) { ... })
  .catch(function (err) { ... })
```

#### `caco.wrapAll(obj)`

Wraps generator function properties of object:

```js
function App () { }

App.prototype.fn = function * (next) {...}
App.prototype.fn2 = function * (next) {...}

// wrap prototype object
caco.wrapAll(App.prototype)

var app = new App()

app.fn(function (err, val) {...})
app.fn2().then(...).catch(...)
```

## Yieldable

By default, the following objects are considered yieldable:
* `Promise`
* `Observable`
* `Generator`

It is also possible to override the yieldable mapper, 
so that one can yield pretty much anything.

#### `caco._yieldable = function (val, cb) { }`

```js
caco._yieldable = function (val, cb) {
  // map array to Promise.all
  if (Array.isArray(val)) {
    Promise.all(val).then(function (res) {
      cb(null, res)
    }, cb)
    return true // acknowledge yieldable
  }

  // Anything can be mapped!
  if (val === 689) {
    cb(new Error('DLLM'))
    return true // acknowledge yieldable
  }

  return false // acknowledge non-yieldable
}

caco(function * () {
  console.log(yield [
    Promise.resolve(1),
    Promise.resolve(2),
    3
  ]) // [1, 2, 3]

  // yield 689 throws error
  try {
    yield 689
  } catch (err) {
    console.log(err.message) // 'DLLM'
  }
}).catch(function (err) {
  // handle uncaught error
})

```

## Aggregated Yield

Multiple results can be aggregated in one `yield` by using `Promise.all` or [callback-all](https://github.com/cshum/callback-all).

```js
var caco = require('caco')
var cball = require('callback-all')

caco(function * (next) {
  // Promise.all
  var promises = [
    asyncFn1(), // foo
    asyncFn2() // bar
  ]
  console.log(yield Promise.all(promises)) // ['foo', 'bar']

  // callback-all
  var all = cball()
  asyncFn1(all()) // foo
  asyncFn2(all()) // bar
  console.log(yield all(next)) // ['foo', 'bar']

}).catch(function (err) {
 // handle uncaught error
})
```

## License

MIT
