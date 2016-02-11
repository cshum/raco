var test = require('tape')
var caco = require('./')

test('caco', function (t) {
  t.plan(3)
  var v = caco(function * () {
    return 167
  })
  var v1 = caco(function * (next) {
    yield setTimeout(next, 0)
    return 1044
  })
  var v2 = caco(function * () {
    return yield v()
  })
  var f = caco(function * (str, next) {
    var n = (yield v1()) / 2 + (yield v2(next))
    return str + n
  })

  f('D7', function (err, res) {
    t.notOk(err, 'no error')
    t.deepEqual(res, 'D7689', 'correct callback value')
  })

  f('DLM').then(function (res) {
    t.deepEqual(res, 'DLM689', 'correct promise value')
  }).catch(t.error)
})
