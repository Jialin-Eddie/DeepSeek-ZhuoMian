// 功能测试门禁：npm run test
// 依次执行：语法检查 → 单元测试（存储/RPC）→ 端到端探针（页面脚本，需引擎在线）
// 任一失败 → 退出码非 0（会被 pre-push 钩子拦截）
// 引擎不在线时端到端用例 WARN 跳过（单元/语法仍必须通过）。
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const failed = []

function run(name, cmd, args, opts = {}) {
  console.log('\n===== ' + name + ' =====')
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: 'inherit', ...opts })
  if (r.error) { console.log('  [启动失败]', String(r.error)); failed.push(name); return r }
  if (r.status !== 0) failed.push(name)
  return r
}

// 0) 先编译主进程 TS（探针 require dist-electron/*.js 的产物）
;(() => {
  const tscJs = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
  console.log('\n===== 编译主进程 TS =====')
  const r = spawnSync(process.execPath, [tscJs, '-p', path.join(ROOT, 'tsconfig.electron.json')], { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' })
  if (r.error) { console.log('  [编译启动失败]', String(r.error)); failed.push('编译') }
  else if (r.status !== 0) failed.push('编译')
})()

// 1) 注入脚本语法（不依赖引擎）
run('语法检查 stash-syntax-test', process.execPath, [path.join(ROOT, 'scripts', 'stash-syntax-test.cjs')])

// 2) 单元测试（纯 Node，不依赖引擎；引擎在线时多测 RPC）
run('单元测试 unit-tests', process.execPath, [path.join(ROOT, 'scripts', 'unit-tests.cjs')])

// 3) 端到端探针（页面脚本 vs 官方 UI，需要引擎 3099 在线）
;(async () => {
  let engineUp = false
  try {
    const r = await fetch('http://127.0.0.1:3099/', { signal: AbortSignal.timeout(3000) })
    engineUp = r.ok
  } catch { /* down */ }
  if (!engineUp) {
    console.log('\n===== 端到端探针 =====')
    console.log('  ⤷ SKIP: 引擎不在线（3099），跳过 e2e 探针。请在引擎运行后重跑 npm run test 完成全量验证。')
  } else {
    const electronExe = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
    const probes = [
      { name: '端到端探针 probe-v011（btw/rewind/clear/rail）', file: 'probe-v011.cjs' },
      { name: '端到端探针 v012-scroll（功能3 滚动定位）', file: 'probe-v012-scroll.cjs' },
      { name: '端到端探针 v012-history（功能1 ↑自动填充）', file: 'probe-v012-history.cjs' },
      { name: '端到端探针 v012-slash（斜杠命令菜单+命令反馈）', file: 'probe-v012-slash.cjs' },
      { name: '端到端探针 v012-notify（功能4 右下角通知）', file: 'probe-v012-notify.cjs' },
      { name: '端到端探针 v012-railall（功能5 全量节点轨道）', file: 'probe-v012-railall.cjs' },
      { name: '端到端探针 v012-reference（功能2 右侧参照分栏）', file: 'probe-v012-reference.cjs' },
    ]
    for (const p of probes) {
      const probe = path.join(ROOT, 'scripts', p.file)
      const r = run(p.name, electronExe, [probe], { timeout: 240000 })
      if (r.error && String(r.error).includes('timeout')) failed.push(p.name + '(超时)')
    }
  }
  const summary = () => {
    console.log('\n===== 测试汇总 =====')
    if (failed.length === 0) {
      console.log('✓ 全部通过（若上面有 SKIP，请记得在引擎在线时补跑一次全量）')
      process.exitCode = 0
    } else {
      console.log('✗ 失败项: ' + failed.join(' , '))
      process.exitCode = 1
    }
  }
  summary()
})()
