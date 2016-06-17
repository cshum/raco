var isGeneratorFunction = require('is-generator-function')
var cball = require('callback-all')

function isFunction (val) {
  return typeof val === 'function'
}
function isGenerator (val) {
  return val && typeof val.next === 'function' && typeof val.throw === 'function'
}
function isPromise (val) {
  return val && typeof val.then === 'function'
}
function isObservable (val) {
  return val && typeof val.subscribe === 'function'
}

/**
 * internal raco resolver
 *
 * @param {function*} genFn - generator function
 * @param {array} args - arguments in real array form
 * @returns {promise} if no callback provided
 */
function _raco (genFn, args) {
  var self = this
  var done = false
  var ticking = false
  var parallel = null
  var callback = null

  // pass raco next to generator function
  if (isFunction(args[args.length - 1])) callback = args.pop()
  args.push(next)

  var iter = isGenerator(genFn) ? genFn : genFn.apply(self, args)

  /**
   * internal callback stepper
   *
   * @param {*} err - callback error object
   * @param {...*} val - callback value(s)
   */
  function step (err, val) {
    if (!iter) {
      if (!done) {
        done = true
        callback.apply(self, arguments)
      }
    } else {
      // generator step
      try {
        var state = err ? iter.throw(err) : iter.next(val)
        if (state.done) iter = null

        // resolve yieldable
        var isYieldable = raco._yieldable(state.value, step)

        // next if generator returned non-yieldable
        if (!isYieldable && !iter) next(null, state.value)
      } catch (err) {
        // catch err, break iteration
        done = true
        callback.call(self, err)
      }
    }
  }

  /**
   * next, callback stepper with nextTick
   *
   * @param {*} err - callback error object
   * @param {...*} val - callback value(s)
   */
  function next () {
    var args = Array.prototype.slice.call(arguments)
    if (!ticking) {
      ticking = true
      process.nextTick(function () {
        ticking = false
        step.apply(self, args)
      })
    } else {
      // if another next() called during ticking,
      // break iter and callback
      iter = null
    }
  }

  /**
   * next.push parallel callback queue
   *
   * @returns {function} callback function (err, val)
   */
  next.push = function () {
    parallel = parallel || cball()
    return parallel()
  }

  /**
   * next.all parallel callback values aggregation and resets queue
   */
  next.all = function () {
    if (!parallel) {
      // resolve empty array if not initiated
      return next(null, [])
    } else {
      parallel(next)
      parallel = null // reset parallel
    }
  }

  if (callback) {
    step()
  } else {
    // return promise if no callback
    return new Promise(function (resolve, reject) {
      callback = function (err, val) {
        if (err) return reject(err)
        resolve(val)
      }
      step()
    })
  }
}

/**
 * raco resolver
 *
 * @param {function*} genFn - generator function
 * @param {...*} args - optional arguments
 * @returns {promise} if no callback provided
 */
function raco (genFn) {
  var args = Array.prototype.slice.call(arguments, 1)
  return _raco.call(this, genFn, args)
}

/**
 * yieldable callback mapper
 *
 * @param {*} val - yielded value to resolve
 * @param {function} cb - resolver callback function
 * @returns {boolean} acknowledge yieldable
 */
raco._yieldable = function (val, cb) {
  if (isPromise(val)) {
    // Promise
    val.then(function (value) {
      cb(null, value)
    }, function (err) {
      cb(err || new Error())
    })
    return true
  } else if (isGeneratorFunction(val) || isGenerator(val)) {
    // Generator
    raco(val, cb)
    return true
  } else if (isFunction(val)) {
    // Thunk
    val(cb)
    return true
  } else if (isObservable(val)) {
    // Observable
    var dispose = val.subscribe(function (val) {
      cb(null, val)
      dispose.dispose()
    }, function (err) {
      cb(err || new Error())
      dispose.dispose()
    })
    return true
  } else {
    // Not yieldable
    return false
  }
}

/**
 * wraps a generator function into regular function that
 * optionally accepts callback or returns a promise.
 *
 * @param {function*} genFn - generator function
 * @returns {function} regular function
 */
raco.wrap = function (genFn) {
  return function () {
    var args = Array.prototype.slice.call(arguments)
    return _raco.call(this, genFn, args)
  }
}

/**
 * wraps generator function properties of object
 *
 * @param {object} obj - object to raco.wrap
 * @returns {object} original object
 */
raco.wrapAll = function (obj) {
  for (var key in obj) {
    if (
      obj.hasOwnProperty(key) &&
      (isGeneratorFunction(obj[key]) || isGenerator(obj[key]))
    ) {
      obj[key] = raco.wrap(obj[key])
    }
  }
  return obj
}

module.exports = raco
