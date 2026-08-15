// 抓取官方 DSH Web UI 的 HTML + CSS，保存到本地用于提取设计令牌
const http = require('http')
const fs = require('fs')
const path = require('path')

const HOST = '127.0.0.1'
const PORT = 3099
const OUT = 'harness-assets'

function get(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: HOST, port: PORT, path: urlPath, headers: { 'User-Agent': 'dsh-research' } }, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }))
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(new Error('timeout ' + urlPath)) })
  })
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const html = await get('/')
  console.log('GET / ->', html.status, 'bytes:', html.body.length)
  fs.writeFileSync(path.join(OUT, 'index.html'), html.body)

  // 找出 CSS / JS 资源
  const assets = [...html.body.matchAll(/(?:src|href)="([^"]+\.(?:css|js)[^"]*)"/g)].map((m) => m[1])
  console.log('assets:', assets.length)
  let cssFiles = 0
  for (const a of assets) {
    const clean = a.startsWith('/') ? a : '/' + a
    try {
      const r = await get(clean)
      if (r.status === 200 && (clean.endsWith('.css') || r.headers['content-type']?.includes('css'))) {
        const name = path.basename(clean).split('?')[0]
        fs.writeFileSync(path.join(OUT, name), r.body)
        cssFiles++
        console.log('css saved:', name, r.body.length)
      }
    } catch (e) { console.log('skip', clean, e.message) }
  }
  console.log('done. css files:', cssFiles)
})()
