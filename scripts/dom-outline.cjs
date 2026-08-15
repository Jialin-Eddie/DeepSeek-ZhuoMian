// 解析 shot-dom.html，输出结构大纲（tag + class 语义前缀 + role + aria-label + 文本摘要）
const fs = require('fs')
const html = fs.readFileSync('shot-dom.html', 'utf8')

const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g
const classRe = /class="([^"]*)"/g

// 简单递归解析（HTML 是单行，用栈）
const stack = []
const out = []
let m
let pos = 0
const tokens = []

while ((m = tagRe.exec(html)) !== null) {
  const closing = m[1] === '/'
  const tag = m[2].toLowerCase()
  const attrs = m[3]
  let cls = ''
  const cm = classRe.exec(attrs)
  if (cm) cls = cm[1]

  // 语义前缀：取 hashed 类名前可读部分
  const semantic = cls
    .split(/\s+/)
    .filter((c) => c && c !== 'true')
    .map((c) => {
      const mm = c.match(/^_?([a-zA-Z0-9-]+)_\d+/)
      return mm ? mm[1] : c
    })
    .join(' ')

  const role = (attrs.match(/role="([^"]*)"/) || [])[1] || ''
  const aria = (attrs.match(/aria-label="([^"]*)"/) || [])[1] || ''

  if (closing) {
    stack.pop()
    continue
  }

  const selfClosing = attrs.endsWith('/') || ['meta', 'link', 'img', 'input', 'br', 'hr'].includes(tag)
  const depth = stack.length
  // 只保留有意义节点：有 class 或 role 或 aria，或是有文本的标签
  const isSvg = tag === 'svg' || tag === 'path' || tag === 'use' || tag === 'defs'
  if (!isSvg) {
    out.push({ depth, tag, semantic, role, aria })
    if (!selfClosing) stack.push(tag)
  } else if (!selfClosing) {
    stack.push(tag)
  }
  if (selfClosing) { /* no stack push */ }
}

// 输出：缩进树，去重连续
let prev = ''
for (const n of out) {
  const label = [n.tag, n.semantic, n.role, n.aria ? `aria=${n.aria}` : '']
    .filter((x) => x && x !== 'true')
    .join(' | ')
  const line = '  '.repeat(Math.min(n.depth, 24)) + label
  if (line !== prev) {
    console.log(line)
    prev = line
  }
}
