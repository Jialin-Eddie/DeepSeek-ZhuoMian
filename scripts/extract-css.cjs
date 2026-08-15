// 从 runtime.css 提取指定前缀的完整规则，输出到 extracted.txt
const fs = require('fs')
const css = fs.readFileSync('harness-assets/runtime.css', 'utf8')
const prefixes = process.argv.slice(2)
const rules = css.match(/[^{}]+\{[^{}]*\}/g) || []

const out = []
for (const rule of rules) {
  const sel = rule.slice(0, rule.indexOf('{')).trim()
  if (!sel || !prefixes.some((p) => sel.includes(p))) continue
  out.push(rule)
}
const body = out.join('\n')
fs.writeFileSync('harness-assets/extracted.txt', body)
console.log('rules:', out.length, 'chars:', body.length)
