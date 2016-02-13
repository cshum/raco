var test = require('tape')
var caco = require('./')
var Observable = require('rx').Observable

test('arguments and return', function (t) {
  t.plan(8)

  var fn = caco(function * (num, str, next) {
    t.equal(num, 167, 'arguemnt')
    t.equal(str, '167', 'arguemnt')
    t.equal(typeof next, 'function', 'stepping function')
  })

  t.notOk(fn(167, '167', function () { }), 'passing callback returns undefined')
  t.equal(typeof fn(167, '167').then, 'function', 'no callback returns promise')
})

test('scope', function (t) {
  var obj = {}

  caco(function * () {
    t.equal(this, obj, 'correct scope')
    t.end()
  }).call(obj)
})

test('resolve and reject', function (t) {
  t.plan(6)

  caco(function * () {
    return 167
  })().then(function (val) {
    t.equal(val, 167, 'promise resolve')
  }, t.error)

  caco(function * () {
    throw new Error('167')
  })().then(t.error, function (err) {
    t.equal(err.message, '167', 'promise reject')
  })

  caco(function * () {
    return yield Promise.resolve(167)
  })(function (err, val) {
    t.error(err)
    t.equal(val, 167, 'callback value')
  })

  caco(function * () {
    return Promise.reject(167)
  })(function (err, val) {
    t.equal(err, 167, 'callback error')
    t.error(val)
  })
})

test('default yieldable', function (t) {
  function * resolveGen (n) {
    return yield Promise.resolve(n)
  }
  var rejectFn = caco(function * (n) {
    return yield Promise.reject(n)
  })
  var instantVal = caco(function * (next) {
    return 1044
  })
  var tryCatch = caco(function * () {
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
  })().then(t.end, t.error)
})
