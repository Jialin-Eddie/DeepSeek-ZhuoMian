const { app, BrowserWindow } = require('electron')
const fs = require('fs')
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 1200, height: 800 })
  w.webContents.setBackgroundThrottling(false)
  await w.loadURL('http://127.0.0.1:3080')
  await new Promise((r) => setTimeout(r, 12000))
  const v = await w.webContents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('[role="treeitem"]')]
    const t = rows.find(rr => rr.querySelector('.YDXeBa_title') && (rr.textContent||'').includes('你好'))
    if (!t) return { error: 'no-session' }
    t.click()
    return 'clicked'
  })()`)
  await new Promise((r) => setTimeout(r, 4000))
  const v2 = await w.webContents.executeJavaScript(`(() => {
    const pick = (sel) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); return { bg: cs.backgroundColor, color: cs.color, h: el.getBoundingClientRect().height } }
    return {
      presetChip: pick('.SVAs4q_label'),
      presetIcon: pick('.SVAs4q_icon'),
      subTrigger: pick('.h8S2Va_trigger'),
      jobsTrigger: pick('.QsffPG_trigger'),
      logBtn: pick('.nL4_yW_sessionLogButton'),
      goalBar: pick('.nLMEza_bar'),
      goalLabel: pick('.nLMEza_label'),
      goalGlyph: pick('.nLMEza_goalGlyph'),
      turnStatus: pick('.Md3f7G_turnStatus'),
      callRow: pick('.Md3f7G_callRow'),
    }
  })()`)
  fs.writeFileSync('probe2.json', JSON.stringify(v2, null, 1))
  console.log('PROBE2 ' + JSON.stringify(v2))
  app.quit()
})
