// 准备打包用 Node 运行时：优先复制系统 Node（>=22），否则从 nodejs.org 下载
// 产物：runtime/node.exe（被 .gitignore 排除，打包前需存在）
const fs = require('fs')
const path = require('path')
const https = require('https')

const root = path.join(__dirname, '..')
const outDir = path.join(root, 'runtime')
const out = path.join(outDir, 'node.exe')
const NODE_VERSION = 'v24.13.0'

function exists(p) {
  try { fs.accessSync(p); return true } catch { return false }
}

function copySystemNode() {
  const candidates = [
    process.execPath.endsWith('node.exe') ? process.execPath : null,
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
    path.join(process.env.ProgramFiles && process.env.ProgramFiles.replace(' (x86)', '') || '', 'nodejs', 'node.exe'),
  ].filter(Boolean)
  for (const c of candidates) {
    if (c !== out && exists(c)) {
      fs.copyFileSync(c, out)
      return c
    }
  }
  return null
}

async function download() {
  const url = `https://nodejs.org/dist/${NODE_VERSION}/win-x64/node.exe`
  fs.mkdirSync(outDir, { recursive: true })
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(out)
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, (r2) => { r2.pipe(file); file.on('finish', resolve) })
        return
      }
      res.pipe(file)
      file.on('finish', resolve)
      file.on('error', reject)
    }).on('error', reject)
  })
}

;(async () => {
  if (exists(out)) { console.log('runtime/node.exe 已存在'); return }
  const copied = copySystemNode()
  if (copied) { console.log('已从系统复制 Node：' + copied); return }
  console.log('未找到系统 Node，从 nodejs.org 下载 ' + NODE_VERSION + ' ...')
  await download()
  console.log('已下载 runtime/node.exe')
})().catch((e) => { console.error('失败：' + e.message); process.exit(1) })
