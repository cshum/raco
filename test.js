var test = require('tape')
var caco = require('./')

test('caco', function (t) {
  t.plan(5)

  function * v (n) {
    return Promise.resolve(n)
  }
  var n = caco(function * (n) {
    return yield Promise.reject(n)
  })
  var v1 = caco(function * (next) {
    yield setTimeout(next, 0)
    return 1044
  })
  var v2 = caco(function * () {
    try {
      return yield n(689)
    } catch (e) {
      return yield v(167)
    }
  })
  var f = caco(function * (str, next) {
    var n = (yield v1()) / 2 + (yield v2(next))
    return str + n
  })

  n('boom', function (err) {
    t.equal(err, 'boom', 'correct callback error')
  })

  n('boom').then(t.error).catch(function (err) {
    t.equal(err, 'boom', 'correct promise reject')
  })

  f('D7', function (err, res) {
    t.notOk(err, 'no error')
    t.deepEqual(res, 'D7689', 'correct callback value')
  })

  f('DLM').then(function (res) {
    t.deepEqual(res, 'DLM689', 'correct promise value')
  }).catch(t.error)
})
