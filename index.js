var isGeneratorFunction = require('is-generator-function')
var xtend = require('xtend')

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
function noop () {}

function yieldable (raco, val, cb) {
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

module.exports = (function factory (_opts) {
  /**
   * internal raco resolver
   *
   * @param {function} genFn - generator function
   * @param {array} args - arguments in real array form
   * @returns {promise} if no callback provided
   */
  function _raco (genFn, args, opts) {
    var self = this
    var done = false
    var trycatch = true
    var ticking = false
    var callback = null

    opts = xtend({
      Promise: global.Promise,
      prepend: false,
      yieldable: null
    }, _opts, opts)

    // pass raco next to generator function
    if (isFunction(args[args.length - 1])) callback = args.pop()
    // prepend or append next arg
    if (opts.prepend) args.unshift(next)
    else args.push(next)

    var iter = isGenerator(genFn) ? genFn : genFn.apply(self, args)

    /**
     * internal callback stepper
     *
     * @param {object} err - callback error object
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
        var state
        if (trycatch) {
          try {
            state = err ? iter.throw(err) : iter.next(val)
          } catch (err) {
            // catch err, break iteration
            done = true
            return callback.call(self, err)
          }
        } else {
          state = err ? iter.throw(err) : iter.next(val)
        }
        if (state && state.done) iter = null
        // resolve yieldable
        var isYieldable = yieldable(raco, state.value, step)
        if (!isYieldable && opts.yieldable) {
          isYieldable = opts.yieldable(state.value, step)
        }
        // next if generator returned non-yieldable
        if (!isYieldable && !iter) next(null, state.value)
      }
    }

    /**
     * next, callback stepper with nextTick
     *
     * @param {object} err - callback error object
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
      } else if (iter) {
        // error on multiple callbacks wthin one iteration
        iter = null
        step.call(self, new Error('Multiple callbacks within one iteration'))
      } else {
        // callback and return, pick callback value
        iter = null
      }
    }

    if (callback) {
      // callback mode
      step()
    } else if (opts.Promise) {
      // return promise if callback not exists
      return new opts.Promise(function (resolve, reject) {
        callback = function (err, val) {
          if (err) return reject(err)
          resolve(val)
        }
        step()
      })
    } else {
      // callback and promise not exists,
      // no try catch wrap
      trycatch = false
      callback = noop
      step()
    }
  }

  /**
   * raco resolver
   * returns factory if no arguments
   *
   * @param {function} genFn - generator function or factory options
   * @param {...*} args - optional arguments
   * @returns {promise} if no callback provided
   */
  function raco (genFn) {
    if (!isGeneratorFunction(genFn) && !isGenerator(genFn)) return factory(genFn)
    var args = Array.prototype.slice.call(arguments, 1)
    return _raco.call(this, genFn, args)
  }

  /**
   * wraps a generator function into regular function that
   * optionally accepts callback or returns a promise.
   *
   * @param {function} genFn - generator function
   * @returns {function} regular function
   */
  raco.wrap = function (genFn, opts) {
    return function () {
      var args = Array.prototype.slice.call(arguments)
      return _raco.call(this, genFn, args, opts)
    }
  }

  /**
   * wraps generator function properties of object
   *
   * @param {object} obj - object to raco.wrap
   * @returns {object} original object
   */
  raco.wrapAll = function (obj, opts) {
    for (var key in obj) {
      if (
        Object.prototype.hasOwnProperty.call(obj, key) &&
        (isGeneratorFunction(obj[key]) || isGenerator(obj[key]))
      ) {
        obj[key] = raco.wrap(obj[key], opts)
      }
    }
    return obj
  }

  return raco
})()
