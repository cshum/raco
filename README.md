# raco

Generator based flow-control that supports both callback and promise.

[![Build Status](https://travis-ci.org/cshum/raco.svg?branch=master)](https://travis-ci.org/cshum/raco)

```bash
npm install raco
```

Many existing flow-control libraries such as [co](https://github.com/tj/co), assume promises to be the lowest denominator of async handling.
Callback function requires promisify patch to be compatible, 
which creates unnecessary complication. 

In raco, both callbacks and promises are yieldable.
Resulting function can be called by both callbacks and promises.
This enables a powerful control flow while maintaining simplicity.

#### `raco(fn*, cb)`
#### `raco(fn*).then(...).catch(...)`

Resolves a generator function.
Accepts optional arguments and callback. 
Returns a promise if callback not exists.

```js
// import raco
var raco = require('raco')
...
raco(function * (next) {
  // yield promise
  console.log(yield Promise.resolve('foo')) // 'foo'
  try {
    yield Promise.reject('boom')
  } catch (err) {
    console.log(err) // 'boom'
  }

  // yield callback
  yield setTimeout(next, 1000) // delay 1 second
  var data = yield fs.readFile('./data', next)  
  var buf = crypto.randomBytes(48, next)
  yield mkdirp('/tmp/foo/bar', next)
  yield pump(
    fs.createReadStream('./foo'),
    fs.createWriteStream('./bar'),
    next
  )
}).catch(function (err) {
  // handle uncaught error
})
```

Yieldable callback works by supplying an additional `next` argument. 
Yielding non-yieldable value pauses the current generator, 
until `next(err, val)` being invoked by callback.
`val` passes back to yielded value, or `throw` if `err` exists.

```js
raco(function * (next) {
  var res = yield setTimeout(function () { 
    next(null, 'foo')
  }, 100)
  console.log(res) // 'foo'

  try {
    yield setTimeout(function () { 
      next(new Error('boom'))
    }, 100)
  } catch (err) {
    console.log(err.message) // 'boom'
  }
}).catch(function (err) {
  // handle uncaught error
})
```

#### `fn = raco.wrap(fn*)`

Wraps a generator function into regular function that optionally accepts callback or returns a promise.

```js
var fn = raco.wrap(function * (arg1, arg2, next) {
  // pass arguments followed by `next`
  ...
  return arg1 + arg2
})

fn(167, 199, function (err, val) { ... }) // Use with callback

fn(167, 689) // use with promise
  .then(function (val) { ... })
  .catch(function (err) { ... })
```

#### `raco.wrapAll(obj)`

Wraps generator function properties of object:

```js
function App () { }

App.prototype.fn = function * (next) {...}
App.prototype.fn2 = function * (next) {...}

// wrap prototype object
raco.wrapAll(App.prototype)

var app = new App()

app.fn(function (err, val) {...})
app.fn2().then(...).catch(...)
```

#### `raco.Promise`

Raco uses native promise by default. This can be overridden by setting `raco.Promise`.

```js
// import by factory to avoid overriding global
var raco = require('raco')()

raco.Promise = require('bluebird')
```

Using promise, uncaught errors will NOT be thrown unless handled by `.catch()`.

It is also possible to drop promise by unsetting it.
If `raco.Promise` being unset and callback not provided,
`raco(fn*)` will not return a promise. 
Any uncaught error will be thrown.

```js
// import by factory to avoid overriding global
var raco = require('raco')()

// unset promise
raco.Promise = null

raco(function * (next) {
  // uncaught error will be thrown
})
```

## Parallel Callbacks

raco provides parallel utilities to aggregate callbacks:

#### `cb = next.push()`
Returns a callback handling function that aggregates result in sequence.
#### `yield next.all()`
Aggregates callbacks values into an array. Throws if error exists. Also resets the parallel list.
#### `yield next.any()`
Returns if any callback resolved, otherwise throws error. Also resets the parallel list.
#### `next.clear()`
Resets parallel list.

```js
var raco = require('raco')

function asyncFn = function (val, cb) {
  setTimeout(cb, Math.random() * 100, null, val)
}
function asyncFnErr = function (err, cb) {
  setTimeout(cb, Math.random() * 100, err)
}

raco(function * (next) {
  // next.all() aggregates callbacks in order
  asyncFn(1, next.push())
  asyncFn(2, next.push())
  console.log(yield next.all()) // [1, 2] 

  asyncFn(3, next.push())
  next.clear() // clear list
  asyncFn(4, next.push())
  asyncFn(5, next.push())
  console.log(yield next.all()) // [4, 5] 

  // next.all() throws if any callback error occured
  asyncFn(6, next.push())
  asyncFnErr(new Error('boom'), next.push())
  asyncFn(7, next.push())
  try {
    yield next.all()
  } catch (err) {
    console.log(err.message) // 'boom'
  }

  // next.any() returns if any callback resolved
  asyncFn(8, next.push())
  asyncFnErr(new Error('boom'), next.push())
  yield next.any() // 8
}).catch(function (err) {
 // handle uncaught error
})
```

## Yieldables

By default, the following objects are considered yieldable:
* Promise
* Generator
* Generator Function
* Observable
* Thunk

#### `raco._yieldable = function (val, cb) { }`

It is also possible to override the default yieldable mapper. Use with caution:
* Takes the yielded value, returns `true` to acknowledge yieldable.
* Callback`cb(err, val)` to resolve the yieldable.

```js
// import by factory to avoid overriding global
var raco = require('raco')()

raco._yieldable = function (val, cb) {
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

raco(function * () {
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

## Factory function

#### `raco = require('raco')()`

Calling raco without argument returns new raco function. This is useful for module development, where modifying raco would not override globally.

```js
// export modified raco module
var raco = module.exports = require('raco')()

raco.Promise = null // disable Promise

raco._yieldable = function (val, cb) {
  // override yieldable
}
```

## License

MIT
