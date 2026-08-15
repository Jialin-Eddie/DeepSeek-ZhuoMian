// 验证：ContextMeter 圆环 + 轨迹页内容
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
app.disableHardwareAcceleration()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, backgroundColor: '#151517' })
  win.webContents.setBackgroundThrottling(false)
  try {
    await win.loadURL('http://127.0.0.1:4173')
    await sleep(9000)
    await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').includes('稍后配置')); if (b) b.click(); return !!b })()`)
    await sleep(800)
    const meter = await win.webContents.executeJavaScript(`(() => {
      const t = document.querySelector('.meter-trigger')
      if (!t) return { found: false }
      const r = t.getBoundingClientRect()
      const fill = t.querySelector('.meter-fill')
      return { found: true, w: r.width, h: r.height, aria: t.getAttribute('aria-label'), dash: fill ? fill.getAttribute('stroke-dasharray') : null }
    })()`)
    // 点开面板
    await win.webContents.executeJavaScript(`(() => { const t = document.querySelector('.meter-trigger'); if (t) t.click(); return true })()`)
    await sleep(600)
    const panel = await win.webContents.executeJavaScript(`(() => {
      const p = document.querySelector('.meter-panel')
      if (!p) return { open: false }
      return { open: true, text: p.innerText.replace(/\\n/g, ' | ').slice(0, 200) }
    })()`)
    // 切轨迹标签
    await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('.tab')].find(x => (x.textContent||'').includes('轨迹')); if (b) b.click(); return !!b })()`)
    await sleep(800)
    const traj = await win.webContents.executeJavaScript(`(() => {
      const rows = [...document.querySelectorAll('.traj-row')]
      const kinds = rows.map(r => (r.querySelector('.traj-kind')||{}).textContent)
      const texts = rows.slice(0, 4).map(r => (r.querySelector('.traj-content-text')||{}).textContent)
      return {
        rows: rows.length, kinds,
        toolbar: (document.querySelector('.traj-toolbar') ? 'yes' : 'no'),
        search: (document.querySelector('.traj-search-input')||{}).placeholder || null,
        spans: document.querySelectorAll('.traj-span').length,
        requestBtns: document.querySelectorAll('.traj-request').length,
        turns: document.querySelectorAll('.traj-turn').length,
        empty: (document.querySelector('.panel-empty')||{}).textContent || null,
      }
    })()`)
    const out = { meter, panel, traj }
    fs.writeFileSync('verify-p0b.json', JSON.stringify(out, null, 1))
    console.log('VERIFY_P0B_SAVED')
  } catch (e) { console.log('FAILED ' + (e && e.stack || e)); process.exitCode = 1 }
  app.quit()
})
