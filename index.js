var isGeneratorFunction = require('is-generator-function')

function isGenerator (val) {
  return val && typeof val.next === 'function' && typeof val.throw === 'function'
}

function isPromise (val) {
  return val && typeof val.then === 'function'
}

function isObservable (val) {
  return val && typeof val.subscribe === 'function'
}

function _caco (genFn, args) {
  var self = this
  var callback
  if (typeof args[args.length - 1] === 'function') callback = args.pop()

  // callback stepper
  args.push(function next (err, res) {
    process.nextTick(function () {
      // todo if not paused, callback.apply
      // else keep stepping
      step(err, res)
    })
  })

  var iter = isGenerator(genFn) ? genFn : genFn.apply(self, args)

  function step (err, res) {
    if (!iter) return callback.apply(self, arguments)
    // generator step
    try {
      var state = err ? iter.throw(err) : iter.next(res)
      if (state.done) iter = null

      var yieldable = caco._mapper(state.value, step)

      if (!yieldable && state.done) step(null, state.value)
    } catch (err) {
      // catch err, break iteration
      return callback.call(self, err)
    }
  }

  if (callback) {
    step()
  } else {
    // use promise if no callback
    return new Promise(function (resolve, reject) {
      callback = function (err, result) {
        if (err) return reject(err)
        resolve(result)
      }
      step()
    })
  }
}

function caco (genFn) {
  var args = Array.prototype.slice.call(arguments, 1)
  return _caco.call(this, genFn, args)
}

// caco yieldable mapper
caco._mapper = function (val, cb) {
  if (isPromise(val)) {
    val.then(function (value) {
      cb(null, value)
    }, function (err) {
      cb(err || new Error())
    })
    return true
  }

  if (isGenerator(val)) {
    caco(val, cb)
    return true
  }

  if (isObservable(val)) {
    var dispose = val.subscribe(function (res) {
      cb(null, res)
      dispose.dispose()
    }, function (err) {
      cb(err)
      dispose.dispose()
    })
    return true
  }

  return false
}

caco.wrap = function (genFn) {
  if (!isGeneratorFunction(genFn) && !isGenerator(genFn)) {
    return caco.wrapAll(genFn)
  }
  return function () {
    var args = Array.prototype.slice.call(arguments)
    return _caco.call(this, genFn, args)
  }
}

caco.wrapAll = function (obj) {
  for (var key in obj) {
    if (isGeneratorFunction(obj[key]) || isGenerator(obj[key])) {
      obj[key] = caco.wrap(obj[key])
    }
  }
  return obj
}

module.exports = caco
