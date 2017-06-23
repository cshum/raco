'use strict'

var slice = Array.prototype.slice

function isFunction (val) {
  return val && typeof val === 'function'
}

function isGenerator (val) {
  return val && isFunction(val.next) && isFunction(val.throw)
}

function isGeneratorFunction (val) {
  if (!val || !val.constructor) return false
  if (val.constructor.name === 'GeneratorFunction' || val.constructor.displayName === 'GeneratorFunction') return true
  return isGenerator(val.constructor.prototype)
}

function isPromise (val) {
  return val && isFunction(val.then)
}

function noop () {}

/**
 * yieldable resolver
 *
 * @param {*} val - value to resolve
 * @param {function} cb - callback function
 * @returns {boolean} denote yieldable
 */
function yieldable (val, cb, opts) {
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
    _raco.call(this, val, null, cb, opts)
    return true
  } else if (isFunction(val)) {
    // Thunk
    val(cb)
    return true
  } else {
    // Not yieldable
    return false
  }
}

/**
 * internal raco resolver
 *
 * @param {function} genFn - generator function
 * @param {array} args - arguments in real array form
 * @returns {promise} if no callback provided
 */
function _raco (iter, args, callback, opts) {
  var self = this
  var trycatch = true
  var isYieldable = true
  var yielded = false
  var nothrow = !!opts.nothrow
  /**
   * internal callback stepper
   *
   * @param {object} err - callback error object
   * @param {...*} val - callback value(s)
   */
  function step (err, val) {
    if (iter) {
      // generator step
      yielded = false
      isYieldable = false
      var state
      if (trycatch) {
        try {
          if (nothrow) state = iter.next(slice.call(arguments))
          else state = err ? iter.throw(err) : iter.next(val)
        } catch (err) {
          iter = null // catch err, break iteration
          return step(err)
        }
      } else {
        if (nothrow) state = iter.next(slice.call(arguments))
        else state = err ? iter.throw(err) : iter.next(val)
      }
      if (state && state.done) iter = null
      yielded = true
      isYieldable = yieldable.call(self, state.value, step, opts)
      if (!isYieldable && opts.yieldable) {
        isYieldable = opts.yieldable.call(self, state.value, step)
      }
      // next if generator returned non-yieldable
      if (!isYieldable && !iter) next(null, state.value)
    } else if (callback) {
      callback.apply(self, arguments)
      callback = null
    }
  }
  /**
   * next, callback stepper with nextTick
   *
   * @param {object} err - callback error object
   * @param {...*} val - callback value(s)
   */
  function next () {
    var args = slice.call(arguments)
    if (!isYieldable) {
      // only handle callback if not yieldable
      if (iter && yielded) {
        // no need defer when yielded
        step.apply(self, args)
      } else {
        // need next tick if not defered
        process.nextTick(function () {
          if (!isYieldable) step.apply(self, args)
        })
      }
    }
  }

  // prepend or append next arg
  if (args) opts.prepend ? args.unshift(next) : args.push(next)
  else args = [next]

  if (!isGenerator(iter)) iter = iter.apply(self, args)

  if (callback) {
    // callback mode
    step()
  } else if (opts.Promise) {
    // return promise if callback not exists
    return new opts.Promise(function (resolve, reject) {
      callback = function (err, val) {
        if (err) reject(err)
        else resolve(val)
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

module.exports = (function factory (_opts) {
  _opts = Object.assign({
    Promise: Promise,
    prepend: false,
    nothrow: false,
    yieldable: null
  }, _opts)
  /**
   * raco resolver
   * returns factory if no arguments
   *
   * @param {function} genFn - generator function or factory options
   * @param {object} [opts] - options object
   * @returns {promise} if no callback provided
   */
  function raco (genFn, opts) {
    if (!isGeneratorFunction(genFn)) {
      if (isFunction(genFn)) throw new Error('Generator function required')
      else if (!isGenerator(genFn)) return factory(genFn)
    }
    opts = Object.assign({}, _opts, opts)
    opts.Promise = null
    return _raco.call(this, genFn, null, null, opts)
  }

  /**
   * wraps a generator function into regular function that
   * optionally accepts callback or returns a promise.
   *
   * @param {function} genFn - generator function
   * @param {object} [opts] - options object
   * @returns {function} regular function
   */
  raco.wrap = function (genFn, opts) {
    if (!isGeneratorFunction(genFn)) throw new Error('Generator function required')
    opts = Object.assign({}, _opts, opts)
    function fn () {
      var args = slice.call(arguments)
      var cb = args.length && isFunction(args[args.length - 1]) ? args.pop() : null
      return _raco.call(this, genFn, args, cb, opts)
    }
    switch (genFn.length) {
      case 1: return function (a) { return fn.apply(this, arguments) }
      case 2: return function (a, b) { return fn.apply(this, arguments) }
      case 3: return function (a, b, c) { return fn.apply(this, arguments) }
      case 4: return function (a, b, c, d) { return fn.apply(this, arguments) }
      default: return fn
    }
  }

  /**
   * wraps generator function properties of object
   *
   * @param {object} obj - object to raco.wrap
   * @param {object} [opts] - options object
   * @returns {object} original object
   */
  raco.wrapAll = function (obj, opts) {
    var props = Object.getOwnPropertyNames(obj)
    for (var key of props) {
      if (isGeneratorFunction(obj[key])) {
        obj[key] = raco.wrap(obj[key], opts)
      }
    }
    return obj
  }

  return raco
})()
