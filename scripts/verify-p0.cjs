// P0 验证：加载 mock（4173），断言官方关键值 + 会话视图结构
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
    // 关弹窗
    await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').includes('稍后配置')); if (b) b.click(); return !!b })()`)
    await sleep(800)
    const v = await win.webContents.executeJavaScript(`(() => {
      const cs = getComputedStyle(document.body)
      const g = (n) => cs.getPropertyValue(n).trim()
      const vv = (n) => { const el = document.querySelector(n); return el ? getComputedStyle(el) : null }
      const tabs = [...document.querySelectorAll('.tab')].map(t => (t.textContent||'').trim())
      const frame = document.querySelector('.frame')
      const cs2 = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null }
      return {
        tokens: {
          tertiary: g('--dsw-alias-label-tertiary'),
          caption: g('--dsw-alias-label-caption'),
          error: g('--dsw-alias-state-error-primary'),
          success: g('--dsw-alias-state-success-primary'),
          scrollHover: g('--dsw-alias-scrollbar-hover-l2'),
          tip: g('--dsw-specific-tip'),
        },
        headerHidden: cs2('.center-header', 'display'),
        tabs,
        crumbCurrent: cs2('.crumb-current', 'color'),
        presetChip: cs2('.preset-chip', 'height'),
        countTriggers: document.querySelectorAll('.count-trigger').length,
        logBtn: cs2('.session-log-btn', 'height'),
        goalBar: cs2('.goal-bar', 'height'),
        goalLabel: (document.querySelector('.goal-label')||{}).textContent || null,
        turnStatus: (() => { const el = document.querySelector('.turn-status'); return el ? { text: el.textContent, display: getComputedStyle(el).display } : null })(),
        chatPadding: cs2('.chat', 'paddingLeft'),
        chatGap: cs2('.chat', 'rowGap'),
        callRadius: cs2('.tool-card', 'borderRadius'),
        olderBtn: (document.querySelector('.chat-older')||{}).textContent || null,
        detailsCols: frame ? frame.dataset.detailsCollapsed : null,
      }
    })()`)
    fs.writeFileSync('verify-p0.json', JSON.stringify(v, null, 1))
    console.log('VERIFY_P0_SAVED')
  } catch (e) { console.log('FAILED ' + (e && e.stack || e)); process.exitCode = 1 }
  app.quit()
})
