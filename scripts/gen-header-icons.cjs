// 从 probe3.json（官方会话视图头部图标）生成 React 组件
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const probe = JSON.parse(fs.readFileSync(path.join(root, 'probe3.json'), 'utf8'))

function comp(name, svg) {
  if (!svg) return `export function ${name}() { return null }\n`
  const body = svg.replace(/class="[^"]*"/g, '').replace(/style="[^"]*"/g, '').trim()
  return `export function ${name}() {\n  return (${body})\n}\n`
}

const out =
  '// AUTO-GENERATED from official DSH session header (probe3.json). Do not edit by hand.\n' +
  comp('PresetIcon', probe.preset) +
  comp('JobsDot', probe.jobs) +
  comp('LogIcon', probe.logBtn) +
  comp('GoalGlyph', probe.goalGlyph)

fs.writeFileSync(path.join(root, 'src', 'components', 'official-header-icons.generated.tsx'), out)
console.log('generated official-header-icons.generated.tsx, bytes=' + out.length)
