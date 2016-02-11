module.exports = function caco (gen) {
  return function () {
    var args = Array.prototype.slice.call(arguments)
    var self = this
    var callback
    if (typeof args[args.length - 1] === 'function') callback = args.pop()

    args.push(function next (err, res) {
      process.nextTick(function () {
        step(err, res)
      })
    })

    var iter = gen.apply(self, args)

    function step (err, res) {
      if (!iter) return callback.apply(self, arguments)
      // generator step
      try {
        var state = err ? iter.throw(err) : iter.next(res)
        if (state.done) iter = null

        if (state.value && typeof state.value.then === 'function') {
          // handle thenable
          state.value.then(function (value) {
            step(null, value)
          }, function (err) {
            step(err || true)
          })
        } else if (state.done) {
          step(null, state.value)
        }
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
}
