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
  t.plan(6)

  function * resolveGen (n) {
    return yield Promise.resolve(n)
  }
  var rejectFn = caco.wrap(function * (n) {
    return Promise.reject(n)
  })
  var instantCb = function (cb) {
    cb(null, 1044)
  }
  var tryCatch = caco.wrap(function * () {
    try {
      return yield rejectFn(689)
    } catch (err) {
      t.equal(err, 689, 'try/catch promise reject')
      return yield resolveGen(167)
    }
  })
  var tryCatchNext = caco.wrap(function * (next) {
    try {
      return yield next(689)
    } catch (err) {
      t.equal(err, 689, 'try/catch next err')
      return yield next(null, 167)
    }
  })
  var observ = function () {
    return Observable
      .fromArray([1, 2])
      .merge(Observable.fromPromise(Promise.resolve(3)))
      .delay(10)
      .toArray()
  }
  caco(function * (next) {
    yield setTimeout(next, 0)
    t.deepEqual(yield observ(), [1, 2, 3], 'yield observable')
    t.equal(yield instantCb(next), 1044, 'yield callback')
    t.equal(yield tryCatch(), 167, 'yield gnerator-promise')
    t.equal(yield tryCatchNext(), 167, 'yield next val')
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

function cbRes (timeout, res, cb) {
  setTimeout(cb, timeout, null, res)
}
function cbErr (timeout, err, cb) {
  setTimeout(cb, timeout, err)
}

test('next.push() and next.all()', function (t) {
  t.plan(5)

  caco(function * (next) {
    t.deepEqual(yield next.all(), [], 'next.all() empty')
    cbRes(20, 1, next.push())
    cbRes(10, 2, next.push())
    cbRes(30, 3, next.push())
    cbRes(0, 4, next.push())
    t.deepEqual(
      yield next.all(),
      [1, 2, 3, 4],
      'push and all'
    )
    cbRes(20, 6, next.push())
    cbRes(10, 7, next.push())
    cbRes(30, 8, next.push())
    t.deepEqual(
      yield next.all(),
      [6, 7, 8],
      'push and all multiple'
    )
    t.deepEqual(yield next.all(), [], 'next.all() empty')
  }).catch(t.error)

  caco(function * (next) {
    cbRes(20, 1, next.push())
    cbErr(10, 2, next.push())
    cbRes(30, 3, next.push())
    cbErr(0, 4, next.push())
    yield next.all()
  }).then(t.error).catch(function (err) {
    t.equal(4, err, 'push and all error')
  })
})
