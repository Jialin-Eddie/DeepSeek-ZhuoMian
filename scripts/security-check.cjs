#!/usr/bin/env node
/**
 * 预推送安全检查（security-check）—— 每次 git push 前必须运行，全绿才允许推送。
 * 依据 SECURITY_CHECKLIST.md（GitHub 官方安全实践整理）。
 *
 * 覆盖两类风险：
 * 1. 已跟踪文件 + 全部历史提交（git grep）
 * 2. 未跟踪文件（fs 扫描，防止 `git add .` 把雷带进去）
 *
 * 用法：npm run security   （或 node scripts/security-check.cjs）
 * 退出码：0 = 通过；1 = 有高危项；2 = 有警告项（需人工确认）
 */

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const FAIL = []
const WARN = []

function fail(msg) { FAIL.push(msg) }
function warn(msg) { WARN.push(msg) }

function git(args, opts = {}) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts })
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '')
  }
}

/* ---------- 通用 ---------- */
const SECRET_RE =
  /sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE KEY/i
const SENSITIVE_WORD_RE = /(password|passwd|secret|token|apikey|api_key|private\s*key)\s*[:=]\s*\S{10,}/i
const SKIP_DIRS = new Set(['node_modules', '.git', 'release', 'release-v2', 'dist', 'dist-electron', 'runtime', '.npm-cache'])
const BINARY_EXT = /\.(png|jpg|jpeg|gif|ico|exe|zip|dll|asar|node|woff2?|ttf|icns|pyc|map)$/i

/** 遍历工作树（跳过 SKIP_DIRS），返回相对路径列表 */
function walkAll(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walkAll(p, out)
    else out.push(p)
  }
}

/** 未跟踪文件的相对路径集合（porcelain "?? xxx" 行） */
function untrackedSet() {
  const set = new Set()
  const lines = git(['status', '--porcelain']).split('\n').map((s) => s.trim()).filter(Boolean)
  for (const line of lines) {
    if (line.startsWith('??')) set.add(path.normalize(line.slice(3)))
  }
  return set
}

/* ---------- A. 密钥与敏感信息 ---------- */
console.log('[A] 密钥与敏感信息')

function scanGitGrep(pattern, label) {
  const hits = git(['grep', '-n', '-I', '-E', pattern], { stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').map((s) => s.trim()).filter(Boolean)
  if (hits.length > 0) {
    fail(`${label}: 发现 ${hits.length} 处可疑匹配`)
    hits.slice(0, 10).forEach((h) => fail(`  ${h}`))
  } else {
    console.log(`  ✓ ${label} 干净`)
  }
}

scanGitGrep(
  'sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE KEY',
  '已跟踪文件：高置信密钥模式',
)

// 历史提交扫描
console.log('  检查历史提交...')
let historyHits = 0
const commits = git(['rev-list', '--all']).split('\n').map((s) => s.trim()).filter(Boolean)
const HIST_PATTERN = 'sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE KEY'
for (const c of commits) {
  const hits = git(['grep', '-n', '-I', '-E', HIST_PATTERN, c], { stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').map((s) => s.trim()).filter(Boolean)
  if (hits.length > 0) {
    historyHits += hits.length
    hits.slice(0, 5).forEach((h) => fail(`  commit ${c.slice(0, 8)}: ${h}`))
  }
}
console.log(historyHits === 0 ? '  ✓ 历史提交干净' : `  ✗ 历史提交发现 ${historyHits} 处（必须换 key + filter-repo）`)

// 未跟踪文件内容扫描（防止 git add . 把雷带进去）
const untracked = untrackedSet()
const allFiles = []
walkAll(ROOT, allFiles)
let utSecret = 0
let utSensitive = 0
for (const f of allFiles) {
  const rel = path.relative(ROOT, f)
  if (!untracked.has(path.normalize(rel))) continue
  if (BINARY_EXT.test(rel)) continue
  let content
  try { content = fs.readFileSync(f, 'utf8') } catch { continue }
  if (SECRET_RE.test(content)) { fail(`未跟踪文件含密钥模式: ${rel}`); utSecret++ }
  else if (SENSITIVE_WORD_RE.test(content)) { warn(`未跟踪文件含敏感词赋值（请人工确认）: ${rel}`); utSensitive++ }
}
console.log(utSecret === 0 ? '  ✓ 未跟踪文件无密钥模式' : `  ✗ 未跟踪文件发现 ${utSecret} 处密钥`)
if (utSensitive > 0) console.log(`  ⚠ 未跟踪文件 ${utSensitive} 处敏感词赋值，见汇总`)

// package-lock
const lock = fs.existsSync(path.join(ROOT, 'package-lock.json'))
  ? fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8')
  : ''
if (/(_authToken|_password|ghp_|sk-[A-Za-z0-9]{20,})/.test(lock)) {
  fail('package-lock.json 含内嵌凭据')
} else {
  console.log('  ✓ package-lock.json 无内嵌凭据')
}

// 敏感文件类型（node_modules 之外）
const SENSITIVE_EXT = /\.(env|pem|key|pfx|p12|crt|cer)$/i
const sensitiveFiles = allFiles.filter((f) => SENSITIVE_EXT.test(f))
if (sensitiveFiles.length > 0) {
  sensitiveFiles.forEach((f) => fail(`敏感文件类型: ${path.relative(ROOT, f)}`))
} else {
  console.log('  ✓ 无 .env/.pem/.key/.pfx/.crt 文件')
}

/* ---------- B. 入库边界 ---------- */
console.log('[B] 入库边界')
const IGNORE = ['node_modules/', 'dist/', 'dist-electron/', 'release/', 'release-v2/', 'runtime/', '*.log', 'shot-', 'probe', 'verify']
const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
const missing = IGNORE.filter((p) => !gi.includes(p))
if (missing.length > 0) {
  fail(`.gitignore 缺少: ${missing.join(', ')}`)
} else {
  console.log('  ✓ .gitignore 覆盖完整')
}

console.log('  untracked 文件（人工确认）:')
if (untracked.size === 0) console.log('    （无）')
for (const u of [...untracked].sort()) {
  if (BINARY_EXT.test(u) || /\.(exe|zip|dll|asar|node|png|jpg|ico)$/i.test(u)) warn(`untracked 疑似二进制/产物: ${u}`)
  else console.log(`    ${u}`)
}

/* ---------- C. 个人信息 ---------- */
console.log('[C] 个人信息')
const home = process.env.USERPROFILE || ''
const userTag = home.split(path.sep).filter(Boolean).pop() || ''
if (userTag) {
  const hits = git(['grep', '-n', '-I', userTag], { stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').map((s) => s.trim()).filter(Boolean)
  if (hits.length > 0) {
    warn(`已跟踪文件出现真实用户名 "${userTag}"（如属示例数据请泛化）`)
    hits.slice(0, 5).forEach((h) => warn(`  ${h}`))
  } else {
    console.log(`  ✓ 无真实用户名 "${userTag}" 残留`)
  }
}

/* ---------- D. 合规 ---------- */
console.log('[D] 合规')
if (fs.existsSync(path.join(ROOT, 'LICENSE'))) {
  console.log('  ✓ LICENSE 存在')
} else {
  fail('缺少 LICENSE')
}
if (fs.existsSync(path.join(ROOT, 'SECURITY_CHECKLIST.md'))) {
  console.log('  ✓ SECURITY_CHECKLIST.md 存在')
}

/* ---------- 汇总 ---------- */
console.log('\n================ 汇总 ================')
if (FAIL.length > 0) {
  console.log(`✗ 高危项 ${FAIL.length} 条 —— 禁止 push`)
  FAIL.forEach((f) => console.log('  [FAIL] ' + f))
}
if (WARN.length > 0) {
  console.log(`⚠ 警告项 ${WARN.length} 条 —— 人工确认后可 push`)
  WARN.forEach((w) => console.log('  [WARN] ' + w))
}
if (FAIL.length === 0 && WARN.length === 0) {
  console.log('✓ 全部通过，可以 push')
}
process.exit(FAIL.length > 0 ? 1 : WARN.length > 0 ? 2 : 0)
