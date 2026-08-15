// 从 harness-assets 的官方 SVG 生成 React 图标组件（wordmark + hero fish）
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
function read(name) {
  return fs.readFileSync(path.join(root, 'harness-assets', name), 'utf8')
}
function component(name, svg) {
  const body = svg
    .replace(/class="[^"]*"/g, '')
    .replace(/aria-hidden="true"/g, '')
    .trim()
  return `export function ${name}() {\n  return (${body})\n}\n`
}

const out =
  '// AUTO-GENERATED from official DSH DOM capture (harness-assets/*.svg). Do not edit by hand.\n' +
  component('BrandMark', read('brand-wordmark.svg')) +
  component('HeroFish', read('fish-hero.svg'))

fs.writeFileSync(path.join(root, 'src', 'components', 'official-icons.generated.tsx'), out)
console.log('generated official-icons.generated.tsx, bytes=' + out.length)
