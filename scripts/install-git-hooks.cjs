#!/usr/bin/env node
/**
 * 安装 git pre-push 钩子：每次 `git push` 前强制运行
 * 1) 安全检查（npm run security）
 * 2) 功能测试门禁（npm run test：语法 + 单元 + 端到端探针，引擎在线时）
 * 任一不过关自动中止 push。
 *
 * 用法：node scripts/install-git-hooks.cjs
 * 紧急逃生门：SKIP_SECURITY_CHECK=1 git push（会打印红色警告，谨慎使用）
 */
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const hooksDir = path.join(ROOT, '.git', 'hooks')
const hookFile = path.join(hooksDir, 'pre-push')
const checkScript = path.join(ROOT, 'scripts', 'security-check.cjs').replace(/\\/g, '/')
const testScript = path.join(ROOT, 'scripts', 'run-tests.cjs').replace(/\\/g, '/')

const content = `#!/bin/sh
# dsh-zhuomian pre-push gate（由 install-git-hooks.cjs 自动安装）
# 检查：1) 安全 2) 功能测试（语法+单元+端到端探针）
# 紧急跳过：SKIP_SECURITY_CHECK=1 git push（危险，仅限应急）
if [ -n "$SKIP_SECURITY_CHECK" ]; then
  echo "[gate] WARNING: SKIP_SECURITY_CHECK set — 本次 push 跳过安全检查（危险！）"
  exit 0
fi
node "${checkScript}"
status=$?
if [ $status -ne 0 ]; then
  echo "[gate] ✗ 安全检查未通过（exit=$status），push 已中止。请修复后重试。"
  exit 1
fi
echo "[gate] ✓ 安全检查通过"
node "${testScript}"
status=$?
if [ $status -ne 0 ]; then
  echo "[gate] ✗ 功能测试未通过（exit=$status），push 已中止。请修复后重试。"
  exit 1
fi
echo "[gate] ✓ 功能测试通过"
exit 0
`

fs.mkdirSync(hooksDir, { recursive: true })
fs.writeFileSync(hookFile, content, { encoding: 'utf8', mode: 0o755 })
console.log('installed pre-push hook ->', hookFile)

// 验证钩子可执行（git 用 sh 执行，Windows 下需 git bash 在 PATH）
try {
  const out = execFileSync('git', ['config', 'core.hooksPath'], { cwd: ROOT, encoding: 'utf8' }).trim()
  if (out) console.log('note: core.hooksPath =', out)
} catch {
  /* 忽略 */
}
console.log('done. 之后每次 git push 都会自动先跑 security check + 功能测试。')
