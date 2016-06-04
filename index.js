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
  var done = false
  var callback

  if (typeof args[args.length - 1] === 'function') callback = args.pop()

  // callback stepper
  args.push(next)
  var iter = isGenerator(genFn) ? genFn : genFn.apply(self, args)

  function step (err, res) {
    if (!iter) {
      if (!done) {
        done = true
        callback.apply(self, arguments)
      }
    } else {
      // generator step
      try {
        var state = err ? iter.throw(err) : iter.next(res)
        if (state.done) iter = null

        // resolve yieldable
        var isYieldable = caco._yieldable(state.value, step)

        if (!isYieldable && state.done) next(null, state.value)
      } catch (err) {
        // catch err, break iteration
        done = true
        callback.call(self, err)
      }
    }
  }

  function next () {
    var args = Array.prototype.slice.call(arguments)
    process.nextTick(function () {
      step.apply(self, args)
    })
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

caco._yieldable = function (val, cb) {
  if (isPromise(val)) {
    val.then(function (value) {
      cb(null, value)
    }, function (err) {
      cb(err || new Error())
    })
    return true
  } else if (isGenerator(val)) {
    caco(val, cb)
    return true
  } else if (isObservable(val)) {
    var dispose = val.subscribe(function (res) {
      cb(null, res)
      dispose.dispose()
    }, function (err) {
      cb(err || new Error())
      dispose.dispose()
    })
    return true
  } else {
    return false
  }
}

caco.wrap = function (genFn) {
  return function () {
    var args = Array.prototype.slice.call(arguments)
    return _caco.call(this, genFn, args)
  }
}

caco.wrapAll = function (obj) {
  for (var key in obj) {
    if (
      obj.hasOwnProperty(key) &&
      (isGeneratorFunction(obj[key]) || isGenerator(obj[key]))
    ) {
      obj[key] = caco.wrap(obj[key])
    }
  }
  return obj
}

module.exports = caco
