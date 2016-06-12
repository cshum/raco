# caco

Generator based flow-control that supports both callback and promise.

[![Build Status](https://travis-ci.org/cshum/caco.svg?branch=master)](https://travis-ci.org/cshum/caco)

```bash
npm install caco
```

Many existing flow-control libraries such as [co](https://github.com/tj/co), assume promises to be the lowest denominator of async handling.
Callback function requires promisify patch to be compatible, 
which creates unnecessary complication. 

In caco, both callbacks and promises are yieldable.
Resulting function can be called by both callbacks and promises.
This enables a powerful control flow while maintaining simplicity.

#### `caco(fn*, cb)`
#### `caco(fn*).then(...).catch(...)`

Resolves a generator function.
Accepts optional arguments and callback. 
Returns a promise if callback not exists.

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

  ...
}).catch(function (err) {
  // handle uncaught error
})

```

Yieldable callback works by supplying an additional `next` argument. 
Yielding non-yieldable value pauses the current generator, 
until `next(err, val)` being invoked by callback.
`val` passes back to yielded value, or `throw` if `err` exists.

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

#### `next.push()`, `next.all()`

caco provides a parallel mechanism to aggregate callbacks:

* `next.push()` a callback into a parallel queue.
* `yield next.all()` aggregates callback result into an array, also resets the parallel queue.

```js
var caco = require('caco')

function asyncFn = function (val, cb) {
  setTimeout(cb, Math.random() * 100, null, val)
}
function asyncFnErr = function (err, cb) {
  setTimeout(cb, Math.random() * 100, err)
}

caco(function * (next) {
  asyncFn(1, next.push())
  asyncFn(2, next.push())
  asyncFn(3, next.push())
  console.log(yield next.all()) // [1, 2, 3] 

  asyncFn(4, next.push())
  asyncFn(5, next.push())
  console.log(yield next.all()) // [4, 5] 

  asyncFn(6, next.push())
  asyncFnErr(new Error('boom'), next.push())
  asyncFn(8, next.push())
  asyncFn(9, next.push())
  try {
    yield next.all()
  } catch (err) {
    console.log(err.message) // 'boom'
  }
}).catch(function (err) {
 // handle uncaught error
})
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

## License

MIT
