// 验证脚本：加载 app 页面，导出可见文本 + 关键元素计算样式，与官方 shot-text 对照
const { app, BrowserWindow } = require('electron')
const fs = require('fs')

const url = process.argv[2] || 'http://127.0.0.1:4173'
const out = process.argv[3] || 'verify.txt'
const waitMs = Number(process.argv[4] || 8000)

app.disableHardwareAcceleration()
process.on('uncaughtException', (e) => { console.log('uncaught: ' + (e && e.stack || e)); app.exit(1) })

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, backgroundColor: '#151517' })
  try {
    await win.loadURL(url)
    await new Promise((r) => setTimeout(r, waitMs))
    const result = await win.webContents.executeJavaScript(`(() => {
      const txt = document.body.innerText
      const pick = (sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const cs = getComputedStyle(el)
        return {
          color: cs.color, background: cs.backgroundColor, border: cs.borderTopColor,
          font: cs.fontFamily.slice(0, 60), radius: cs.borderTopLeftRadius,
          w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height,
        }
      }
      return {
        text: txt,
        checks: {
          bodyBg: pick('body'),
          sidebar: pick('.sidebar'),
          composerBox: pick('.composer-box'),
          send: pick('.send'),
          heroText: pick('.hero-text'),
          heroBadge: pick('.hero-badge'),
          modeTrigger: pick('.mode-trigger'),
          tab: pick('.tab'),
          tabActive: pick('.tab-active'),
          newSession: pick('.new-session'),
          frameCols: getComputedStyle(document.querySelector('.frame')).gridTemplateColumns,
          headerDisplay: getComputedStyle(document.querySelector('.center-header')).display,
          detailsCols: document.querySelector('.frame').dataset.detailsCollapsed,
          brandW: (document.querySelector('.brand svg') || {}).getBoundingClientRect
            ? document.querySelector('.brand svg').getBoundingClientRect().width : null,
        },
      }
    })()`)
    fs.writeFileSync(out, JSON.stringify(result, null, 2))
    console.log('VERIFY_SAVED ' + out)
  } catch (err) {
    console.log('FAILED ' + (err && err.stack || err))
    process.exitCode = 1
  }
  app.quit()
})
