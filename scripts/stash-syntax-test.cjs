const path = require('node:path')
const P = require(path.join(__dirname, '..', 'dist-electron', 'stashPage.js'))
const F = require(path.join(__dirname, '..', 'dist-electron', 'featuresPage.js'))
const V = require(path.join(__dirname, '..', 'dist-electron', 'featuresV012.js'))

let failed = 0
function check(name, script) {
  try { new Function(script); console.log('OK  ', name, '(', script.length, 'chars)') }
  catch (e) { failed++; console.log('FAIL', name, e.message) }
}

check('READ_SCRIPT', P.READ_SCRIPT)
check('CLEAR_SCRIPT', P.CLEAR_SCRIPT)
check('CLOSE_OVERLAY_SCRIPT', P.CLOSE_OVERLAY_SCRIPT)
check('TOAST', P.buildToastScript('已保存到提示词便签 · C_Users_x'))
check('RAIL_SCRIPT', F.RAIL_SCRIPT)
check('BTW_SCRIPT', F.BTW_SCRIPT)
check('REWIND_SCRIPT', F.REWIND_SCRIPT)
check('SLASH_MENU_SCRIPT（斜杠命令菜单）', F.SLASH_MENU_SCRIPT)

// v0.1.2 新功能脚本（功能1~5）
check('SCROLL_SCRIPT（功能3 滚动定位）', V.SCROLL_SCRIPT)
check('HISTORY_SCRIPT（功能1 ↑自动填充）', V.HISTORY_SCRIPT)
check('NOTIFY_SCRIPT（功能4 右下角通知）', V.NOTIFY_SCRIPT)
check('RAIL_ALL_SCRIPT（功能5 全量节点轨道）', V.RAIL_ALL_SCRIPT)
check('REFERENCE_SCRIPT（功能2 右侧参照分栏）', V.REFERENCE_SCRIPT)

const nasty = '他说："你好\n世界" \\ C:\\path \\u0026 <b>html</b> \'单引号\' $99.5'
check('OVERLAY', P.buildOverlayScript([
  { id: 'p1', text: nasty, savedAt: Date.now() - 60000 },
  { id: 'p2', text: '第二句：单价 $99.5 / 100%', savedAt: Date.now() },
], '5ths-project5'))

const s = P.buildOverlayScript([{ id: 'p1', text: nasty, savedAt: 1 }], 't')
console.log('json-escape-roundtrip:', s.includes(JSON.stringify(nasty)))
if (failed > 0) { console.log('SYNTAX_FAIL', failed); process.exitCode = 1 }
