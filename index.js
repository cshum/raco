var isGeneratorFunction = require('is-generator-function')
var parallels = require('parallels')

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

module.exports = (function factory () {
  /**
   * raco resolver
   * returns factory if no arguments
   *
   * @param {function*} genFn - generator function
   * @param {...*} args - optional arguments
   * @returns {promise} if no callback provided
   */
  function raco (genFn) {
    if (arguments.length === 0) return factory()
    var args = Array.prototype.slice.call(arguments, 1)
    return _raco.call(this, genFn, args)
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
    var trycatch = true
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
        var isYieldable = raco._yieldable(state.value, step)
        // next if generator returned non-yieldable
        if (!isYieldable && !iter) next(null, state.value)
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
      } else if (iter) {
        // error on multiple callbacks wthin one iteration
        iter = null
        step.call(self, new Error('Multiple callbacks within one iteration'))
      } else {
        // callback and return, pick callback value
        iter = null
      }
    }

    /**
     * clear parallel queue
     */
    next.clear = function () {
      parallel = null
    }

    /**
     * push parallel callback queue
     *
     * @returns {function} callback function (err, val)
     */
    next.push = function () {
      parallel = parallel || parallels()
      return parallel.push()
    }

    /**
     * aggregate parallel values into array and resets queue
     */
    next.all = function () {
      if (!parallel) return next(null, [])
      parallel.all(next)
      parallel = null
    }

    /**
     * return first value of parallel and resets queue
     */
    next.any = function () {
      if (!parallel) return next(null, null)
      parallel.any(next)
      parallel = null
    }

    if (callback) {
      // callback mode
      step()
    } else if (raco.Promise) {
      // return promise if callback not exists
      return new raco.Promise(function (resolve, reject) {
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

  /**
   * Promise constructor of raco,
   * use native Promise by default
   *
   */
  raco.Promise = global.Promise

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

  return raco
})()
