const path = require('node:path')
const P = require(path.join(__dirname, '..', 'dist-electron', 'stashPage.js'))
const F = require(path.join(__dirname, '..', 'dist-electron', 'featuresPage.js'))

function check(name, script) {
  try { new Function(script); console.log('OK  ', name, '(', script.length, 'chars)') }
  catch (e) { console.log('FAIL', name, e.message) }
}

check('READ_SCRIPT', P.READ_SCRIPT)
check('CLOSE_OVERLAY_SCRIPT', P.CLOSE_OVERLAY_SCRIPT)
check('TOAST', P.buildToastScript('已保存到提示词便签 · C_Users_x'))
check('RAIL_SCRIPT', F.RAIL_SCRIPT)
check('BTW_SCRIPT', F.BTW_SCRIPT)

const nasty = '他说："你好\n世界" \\ C:\\path \\u0026 <b>html</b> \'单引号\' $99.5'
check('OVERLAY', P.buildOverlayScript([
  { id: 'p1', text: nasty, savedAt: Date.now() - 60000 },
  { id: 'p2', text: '第二句：单价 $99.5 / 100%', savedAt: Date.now() },
], '5ths-project5'))

const s = P.buildOverlayScript([{ id: 'p1', text: nasty, savedAt: 1 }], 't')
console.log('json-escape-roundtrip:', s.includes(JSON.stringify(nasty)))
