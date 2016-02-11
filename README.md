# caco

Generator based control flow for Node.js. Supports both callbacks and promises.

Many of the existing async libraries require wrapping callback functions into promises to be usuable, which creates unnecessary complication. 

In caco, both callbacks and promises are 'yieldable'; 
resulting function can be used by both callbacks and promises. 
This enables a powerful control flow while maintaining compatibility.

```bash
npm install caco
```

```js
var caco = require('caco')

var fn = caco(function * (next) {
  var foo = yield Promise.resolve('bar') // yield promise
  yield setTimeout(next, 100) // yield callback using 'next' argument

  // try/catch errors
  try {
    yield Promise.reject('boom')
  } catch (err) {
    console.log(err) // 'boom'
  }

  var data = yield fs.readFile('./foo/bar', next)
  return data
})

// consume with callback
fn(function (err, res) { })

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
