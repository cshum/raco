var test = require('tape')
var caco = require('./')
var Observable = require('rx').Observable

test('arguments and callback return', function (t) {
  t.plan(10)

  var fn = caco.wrap(function * (num, str, next) {
    t.equal(num, 167, 'arguemnt')
    t.equal(str, '167', 'arguemnt')
    t.equal(typeof next, 'function', 'stepping function')
    next(null, 'foo', 'bar') // should return
    return 'boom' // should not return
  })

  // callback
  t.notOk(fn(167, '167', function (err, res) {
    t.notOk(err, 'no callback error')
    t.deepEqual(
      Array.prototype.slice.call(arguments),
      [null, 'foo', 'bar'],
      'return callback arguments'
    )
  }), 'passing callback returns undefined')

  // promise
  fn(167, '167').then(function () {
    t.deepEqual(
      Array.prototype.slice.call(arguments),
      ['foo'],
      'return callback value for promise'
    )
  }, t.error)
})

test('scope', function (t) {
  t.plan(1)

  var obj = {}

  caco.wrap(function * () {
    t.equal(this, obj, 'correct scope')
    t.end()
  }).call(obj)
})

test('resolve and reject', function (t) {
  t.plan(6)

  // callback
  caco(function * () {
    return yield Promise.resolve(167)
  }, function (err, val) {
    t.error(err)
    t.equal(val, 167, 'callback value')
  })

  caco(function * () {
    return Promise.reject(167)
  }, function (err, val) {
    t.equal(err, 167, 'callback error')
    t.error(val)
  })

  // promise
  caco(function * () {
    return 167
  }).then(function (val) {
    t.equal(val, 167, 'promise resolve')
  }, t.error)

  caco(function * () {
    throw new Error('167')
  }).then(t.error, function (err) {
    t.equal(err.message, '167', 'promise reject')
  })
})

test('yieldable', function (t) {
  t.plan(4)

  function * resolveGen (n) {
    return yield Promise.resolve(n)
  }
  var rejectFn = caco.wrap(function * (n) {
    return yield Promise.reject(n)
  })
  var instantVal = caco.wrap(function * (next) {
    return 1044
  })
  var tryCatch = caco.wrap(function * () {
    try {
      return yield rejectFn(689)
    } catch (err) {
      t.equal(err, 689, 'try/catch promise reject')
      return yield resolveGen(167)
    }
  })
  caco(function * (next) {
    yield setTimeout(next, 0)
    var o = yield Observable
      .fromArray([1, 2])
      .merge(Observable.fromPromise(Promise.resolve(3)))
      .delay(10)
      .toArray()
    t.deepEqual(o, [1, 2, 3], 'yield observable')
    t.equal(yield instantVal(next), 1044, 'yield callback')
    t.equal(yield tryCatch(), 167, 'yield gnerator-promise')
  }).catch(t.error)
})

test('override yieldable', function (t) {
  t.plan(2)

  var orig = caco._yieldable
  caco._yieldable = function (val, cb) {
    // yield array
    if (Array.isArray(val)) {
      Promise.all(val).then(function (res) {
        cb(null, res)
      }, function (err) {
        cb(err || new Error())
      })
      return true
    }
    // yield 689 throws error
    if (val === 689) {
      cb(new Error('DLLM'))
      return true
    }
  }

  caco(function * () {
    t.deepEqual(yield [
      Promise.resolve(1),
      Promise.resolve(2),
      3
    ], [1, 2, 3], 'yield map array to Promise.all')

    try {
      yield 689
    } catch (err) {
      t.equal(err.message, 'DLLM', 'yield 689 throws error')
      caco._yieldable = orig
    }
  }).catch(t.error)
})

test('wrapAll', function (t) {
  t.plan(6)

  var fn = function () {}
  var gen = (function * () {})()
  var obj = {
    test: 'foo',
    fn: fn,
    gen: gen,
    genFn: function * () {
      try {
        yield Promise.reject('booom')
      } catch (e) {
        t.equal(e, 'booom', 'correct yield')
      }
    }
  }
  t.equal(caco.wrapAll(obj), obj, 'mutuable')
  t.equal(obj.test, 'foo', 'ignore non caco')
  t.equal(obj.fn, fn, 'ignore non caco')
  t.notOk(obj.gen === gen, 'wrap generator')
  t.notOk(obj.genFn === fn, 'wrap generator function')
  obj.genFn().catch(t.error)
})

