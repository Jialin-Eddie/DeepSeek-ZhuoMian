const { app, BrowserWindow } = require('electron')
const fs = require('fs')
app.disableHardwareAcceleration()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, backgroundColor: '#151517' })
  win.webContents.setBackgroundThrottling(false)
  try {
    await win.loadURL('http://127.0.0.1:3080')
    await sleep(12000)
    await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').includes('稍后配置')); if (b) b.click(); return !!b })()`)
    await sleep(1000)
    await win.webContents.executeJavaScript(`(() => {
      const rows = [...document.querySelectorAll('[role="treeitem"]')]
      const t = rows.find(rr => rr.querySelector('.YDXeBa_title') && (rr.textContent||'').includes('你好'))
      if (t) t.click()
      return !!t
    })()`)
    await sleep(4000)

    // 1) ContextMeter 位置 + 圆环 SVG
    const meter = await win.webContents.executeJavaScript(`(() => {
      const root = document.querySelector('.JObwrW_root')
      if (!root) return { found: false }
      const trigger = root.querySelector('.JObwrW_trigger')
      const svg = trigger ? trigger.querySelector('svg') : null
      // 祖先链找它挂在哪个容器
      let chain = []
      let el = root
      for (let i = 0; i < 6 && el; i++) { chain.push((el.className||'').toString().slice(0, 80)); el = el.parentElement }
      return {
        found: true,
        chain,
        svg: svg ? svg.outerHTML.slice(0, 800) : null,
        triggerW: trigger ? trigger.getBoundingClientRect().width : null,
        rootW: root.getBoundingClientRect().width,
      }
    })()`)
    fs.writeFileSync('probe4-meter.json', JSON.stringify(meter, null, 1))

    // 2) 点开 ContextMeter 面板
    const panel = await win.webContents.executeJavaScript(`(() => {
      const t = document.querySelector('.JObwrW_trigger'); if (t) t.click(); return !!t
    })()`)
    await sleep(900)
    const panelData = await win.webContents.executeJavaScript(`(() => {
      const p = document.querySelector('.JObwrW_panel')
      if (!p) return { open: false }
      return { open: true, text: p.innerText.slice(0, 400), html: p.outerHTML.slice(0, 2500) }
    })()`)
    fs.writeFileSync('probe4-panel.json', JSON.stringify(panelData, null, 1))
    await win.webContents.executeJavaScript(`(() => { const t = document.querySelector('.JObwrW_trigger'); if (t) t.click(); return true })()`)

    // 3) 轨迹标签页
    await win.webContents.executeJavaScript(`(() => {
      const tabs = [...document.querySelectorAll('.wSkVaW_tab')]
      const tr = tabs.find(t => (t.textContent||'').includes('轨迹'))
      if (tr) tr.click()
      return tabs.length
    })()`)
    await sleep(2500)
    const traj = await win.webContents.executeJavaScript(`(() => {
      const root = document.querySelector('.wSkVaW_root')
      const view = root ? root.querySelector('.wSkVaW_viewArea, .wSkVaW_scrollBody') : null
      const outline = []
      const walk = (el, depth) => {
        if (depth > 12) return
        const tag = el.tagName ? el.tagName.toLowerCase() : ''
        if (tag === 'svg') return
        const cls = (el.className && typeof el.className === 'string') ? el.className : ''
        const semantic = cls.split(/\\s+/).filter(Boolean).map((c) => { const m = c.match(/^_?([a-zA-Z0-9-]+)_\\d+/); return m ? m[1] : c }).join(' ')
        const role = el.getAttribute && el.getAttribute('role') || ''
        const aria = el.getAttribute && el.getAttribute('aria-label') || ''
        const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null
        const v = r && r.width > 0 && r.height > 0
        if (semantic || role || aria) outline.push({ d: depth, t: tag, c: semantic, r: role, a: aria, v })
        for (const ch of el.children) walk(ch, depth + 1)
      }
      if (view) walk(view, 0)
      const lines = []
      let prev = ''
      for (const x of outline) {
        const line = '  '.repeat(Math.min(x.d, 10)) + [x.t, x.c, x.r, x.a ? 'aria=' + x.a : '', x.v ? '' : '[hidden]'].filter(Boolean).join(' | ')
        if (line !== prev) { lines.push(line); prev = line }
      }
      return { tabCount: document.querySelectorAll('.wSkVaW_tab').length, activeTab: (document.querySelector('.wSkVaW_tabActive')||{}).textContent || null, outline: lines, text: view ? view.innerText.slice(0, 1500) : null }
    })()`)
    fs.writeFileSync('probe4-trajectory.json', JSON.stringify(traj, null, 1))
    console.log('PROBE4_DONE')
  } catch (e) { console.log('FAILED ' + (e && e.stack || e)); process.exitCode = 1 }
  app.quit()
})
