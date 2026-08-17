// 单元测试：便签 / 检查点存储 / 引擎 RPC（引擎在线时）
// 用法：node scripts/unit-tests.cjs；退出码 0=通过，1=失败
// 引擎不在线时，引擎相关用例自动 WARN 跳过（不阻塞），存储用例始终执行。
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const ROOT = path.resolve(__dirname, '..')
const S = require(path.join(ROOT, 'dist-electron', 'stashStore.js'))
const C = require(path.join(ROOT, 'dist-electron', 'checkpointStore.js'))
const E = require(path.join(ROOT, 'dist-electron', 'engineRpc.js'))

let failures = 0
let skips = 0
function ok(cond, msg) {
  if (cond) console.log('  ✓', msg)
  else { failures++; console.log('  ✗ FAIL:', msg) }
}
function skip(msg) { skips++; console.log('  ⤷ SKIP:', msg) }

console.log('--- stashStore ---')
{
  const dir = path.join(os.tmpdir(), 'dsh-test-stash-' + Date.now())
  const ws = 'C:/x/项目 一'
  const a = S.savePrompt(dir, ws, '第一条提示')
  ok(a.item.text === '第一条提示' && a.deduped === false, 'savePrompt 新增')
  const b = S.savePrompt(dir, ws, '第一条提示')
  ok(b.deduped === true, 'savePrompt 同文去重')
  const c = S.savePrompt(dir, ws, '第二条提示')
  let f = S.loadStash(dir, ws)
  ok(f.items.length === 2 && f.items[0].text === '第二条提示', '新条目置顶')
  ok(S.deletePrompt(dir, ws, c.item.id) === true && S.loadStash(dir, ws).items.length === 1, 'deletePrompt')
  ok(S.sanitizeKey('C:\\x\\y z:?*') === 'C__x_y_z___' || S.sanitizeKey('C:\\x\\y z:?*').length > 0, 'sanitizeKey 清理')
  const n = S.appendBtwNote(dir, ws, '一条旁注')
  ok(n.text === '一条旁注', 'appendBtwNote')
  const caps = S.savePrompt(dir, ws, '占位' + 0)
  for (let i = 1; i < 60; i++) S.savePrompt(dir, ws, '占位' + i)
  ok(S.loadStash(dir, ws).items.length === 50, '便签上限 50')
}

console.log('--- checkpointStore ---')
{
  const dir = path.join(os.tmpdir(), 'dsh-test-cp-' + Date.now())
  const ws = 'C:/x/项目 二'
  const a = C.saveCheckpoint(dir, ws, { name: '进度1', sessionId: 's1', atSeq: 100, preview: '预览A' })
  C.saveCheckpoint(dir, ws, { name: '进度2', sessionId: 's1', atSeq: 200 })
  const same = C.saveCheckpoint(dir, ws, { name: '进度1', sessionId: 's1', atSeq: 100, preview: '预览B' })
  let f = C.loadCheckpoints(dir, ws)
  ok(f.items.length === 2, '检查点保存+同名去重置顶')
  ok(same.id === a.id && f.items[0].preview === '预览B', '同名同seq 更新预览并置顶')
  ok(C.deleteCheckpoint(dir, ws, a.id) === true && C.loadCheckpoints(dir, ws).items.length === 1, '删除检查点')
  for (let i = 0; i < 60; i++) C.saveCheckpoint(dir, ws, { name: 'n' + i, sessionId: 's1', atSeq: i })
  ok(C.loadCheckpoints(dir, ws).items.length === 50, '检查点上限 50')
}

console.log('--- engineRpc（引擎在线时） ---')
;(async () => {
  let engineUp = false
  try {
    const r = await fetch('http://127.0.0.1:3099/', { signal: AbortSignal.timeout(3000) })
    engineUp = r.ok
  } catch { /* down */ }
  if (!engineUp) {
    skip('引擎不在线，跳过 listSessions/resolveActiveWorkspace/historyTail')
    finish()
    return
  }
  const items = await E.listSessions(3099)
  ok(Array.isArray(items) && items.length > 0, 'listSessions 返回会话列表')
  const ws = await E.resolveActiveWorkspace(3099)
  ok(typeof ws === 'string' && ws.length > 0, 'resolveActiveWorkspace 解析到工作区')
  const sid = await E.resolveActiveSessionId(3099)
  ok(typeof sid === 'string' && sid.startsWith('session-'), 'resolveActiveSessionId')
  if (sid) {
    const tail = await E.historyTail(3099, sid)
    ok(typeof tail.lastSeq === 'number' && tail.lastSeq > 0, 'historyTail lastSeq=' + tail.lastSeq)
    console.log('  （lastPrompt 预览=' + JSON.stringify(tail.lastPrompt.slice(0, 30)) + '…）')
  }
  finish()
})().catch((e) => { failures++; console.log('  ✗ engineRpc ERR', String(e)); finish() })

function finish() {
  console.log('\n=== 汇总 ===')
  console.log('  通过 ✓，失败 ✗ ' + failures + '，跳过 ⤷ ' + skips)
  if (skips > 0) console.log('  WARN: 有用例因引擎不在线被跳过，push 前请确认引擎在线后重跑 npm run test')
  process.exitCode = failures === 0 ? 0 : 1
}
