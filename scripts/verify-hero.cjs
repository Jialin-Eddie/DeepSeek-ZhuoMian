// 验证 hero 状态 + 截图
const { app, BrowserWindow } = require('electron')
const fs = require('fs')

const url = process.argv[2] || 'http://127.0.0.1:4173'
const pngOut = process.argv[3] || 'shot-fixed.png'
const waitMs = Number(process.argv[4] || 8000)

app.disableHardwareAcceleration()
process.on('uncaughtException', (e) => { console.log('uncaught: ' + (e && e.stack || e)); app.exit(1) })

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, backgroundColor: '#151517' })
  try {
    await win.loadURL(url)
    await new Promise((r) => setTimeout(r, waitMs))
    // 进入 hero：先点侧栏“新会话”按钮（会话树第二行的 row icon 不可见，用 section 内的 brand 按钮）
    await win.webContents.executeJavaScript(`(() => {
      const brand = document.querySelector('.brand'); if (brand) brand.click()
      return true
    })()`)
    await new Promise((r) => setTimeout(r, 800))
    const result = await win.webContents.executeJavaScript(`(() => {
      const txt = document.body.innerText
      const cs = (sel) => { const el = document.querySelector(sel); if (!el) return null; const c = getComputedStyle(el); return { color: c.color, bg: c.backgroundColor, display: c.display, w: el.getBoundingClientRect().width } }
      return {
        text: txt.split('\\n').slice(0, 30),
        checks: {
          headerHidden: cs('.center-header'),
          heroText: cs('.hero-text'),
          heroBadge: cs('.hero-badge'),
          heroFish: cs('.hero-fish'),
          heroWs: cs('.hero-ws-btn'),
          heroComposer: cs('.composer-hero'),
          placeholder: document.querySelector('.composer-input') ? document.querySelector('.composer-input').placeholder : null,
        },
      }
    })()`)
    fs.writeFileSync('verify-hero.json', JSON.stringify(result, null, 2))
    const image = await win.webContents.capturePage()
    fs.writeFileSync(pngOut, image.toPNG())
    console.log('HERO_SAVED verify-hero.json + ' + pngOut)
  } catch (err) {
    console.log('FAILED ' + (err && err.stack || err))
    process.exitCode = 1
  }
  app.quit()
})
