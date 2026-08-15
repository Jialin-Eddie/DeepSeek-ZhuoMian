const { app, BrowserWindow } = require('electron')
const fs = require('fs')
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 1200, height: 800 })
  w.webContents.setBackgroundThrottling(false)
  await w.loadURL('http://127.0.0.1:3080')
  await new Promise((r) => setTimeout(r, 12000))
  await w.webContents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('[role="treeitem"]')]
    const t = rows.find(rr => rr.querySelector('.YDXeBa_title') && (rr.textContent||'').includes('你好'))
    if (t) t.click()
    return !!t
  })()`)
  await new Promise((r) => setTimeout(r, 4000))
  const v = await w.webContents.executeJavaScript(`(() => {
    const grab = (sel) => { const el = document.querySelector(sel); if (!el) return null; const s = el.querySelector('svg'); return s ? s.outerHTML.slice(0, 6000) : null }
    return {
      preset: grab('.SVAs4q_label'),
      subagents: grab('.h8S2Va_trigger'),
      jobs: grab('.QsffPG_trigger'),
      logBtn: grab('.nL4_yW_sessionLogButton'),
      goalGlyph: grab('.nLMEza_goalGlyph'),
    }
  })()`)
  fs.writeFileSync('probe3.json', JSON.stringify(v, null, 1))
  console.log('PROBE3 saved')
  app.quit()
})
