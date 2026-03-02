'use strict'

const path = require('path')

module.exports = async function afterPack(context) {
  const implPath = path.join(__dirname, '..', 'apps', 'electron', 'scripts', 'afterPack.cjs')
  const impl = require(implPath)
  return impl(context)
}
