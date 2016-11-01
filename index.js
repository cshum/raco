var DEFAULT_OPTS = {
  Promise: Promise,
  prepend: false,
  yieldable: null
}

function xtend () {
  var i, l, key, source
  var tar = {}
  for (i = 0, l = arguments.length; i < l; i++) {
    source = arguments[i]
    for (key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        tar[key] = source[key]
      }
    }
  }
  return tar
}
function isFunction (val) {
  return typeof val === 'function'
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
function yieldable (val, cb) {
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
    _raco.call(this, val, [cb], DEFAULT_OPTS)
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
function _raco (genFn, args, opts) {
  var self = this
  var done = false
  var trycatch = true
  var ticking = false
  var callback = null

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
      var isYieldable = yieldable.call(self, state.value, step)
      if (!isYieldable && opts.yieldable) {
        isYieldable = opts.yieldable.call(self, state.value, step)
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

module.exports = (function factory (_opts) {
  /**
   * raco resolver
   * returns factory if no arguments
   *
   * @param {function} genFn - generator function or factory options
   * @param {...*} args - optional arguments
   * @returns {promise} if no callback provided
   */
  function raco (genFn, opts) {
    if (!isGeneratorFunction(genFn)) {
      if (isFunction(genFn)) throw new Error('Generator function required')
      else if (!isGenerator(genFn)) return factory(genFn)
    }
    opts = xtend(DEFAULT_OPTS, _opts, opts, { Promise: null })
    return _raco.call(this, genFn, [], opts)
  }

  /**
   * wraps a generator function into regular function that
   * optionally accepts callback or returns a promise.
   *
   * @param {function} genFn - generator function
   * @returns {function} regular function
   */
  raco.wrap = function (genFn, opts) {
    if (!isGeneratorFunction(genFn) && isFunction(genFn)) {
      throw new Error('Generator function required')
    }
    opts = xtend(DEFAULT_OPTS, _opts, opts)
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
