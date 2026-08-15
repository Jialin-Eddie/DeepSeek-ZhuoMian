// 抓亮色完整令牌：开设置 → 点“浅色”主题方块 → 抓 45 个令牌
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const url = process.env.EXPLORE_URL || 'http://127.0.0.1:3080'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
app.disableHardwareAcceleration()
process.on('uncaughtException', (e) => { console.log('uncaught: ' + (e && e.stack || e)); app.exit(1) })

const TOKENS = `(() => {
  const cs = getComputedStyle(document.body)
  const tokens = {}
  const names = ['--dsw-alias-bg-base','--dsw-alias-bg-layer-1','--dsw-alias-bg-layer-2','--dsw-alias-bg-layer-3','--dsw-alias-bg-module-platform','--dsw-alias-border-inverted','--dsw-alias-border-l1','--dsw-alias-border-l2','--dsw-alias-border-l2-darkmode-thin','--dsw-alias-border-l3','--dsw-alias-border-l4','--dsw-alias-brand-primary','--dsw-alias-label-primary','--dsw-alias-label-secondary','--dsw-alias-label-tertiary','--dsw-alias-label-caption','--dsw-alias-label-dimmed','--dsw-alias-label-primary-bluish','--dsw-alias-label-primary-foreground','--dsw-alias-label-primary-inverted','--dsw-alias-state-business-primary','--dsw-alias-state-business-tertiary','--dsw-alias-state-error-primary','--dsw-alias-state-success-primary','--dsw-alias-state-warn-label','--dsw-alias-state-warn-primary','--dsw-alias-button-info-fill','--dsw-alias-button-info-hover','--dsw-alias-button-elevated-fill','--dsw-alias-button-floating-fill','--dsw-alias-button-floating-hover','--dsw-alias-button-ghost-active-fill','--dsw-alias-button-ghost-active-border','--dsw-alias-interactive-bg-hover','--dsw-alias-interactive-bg-active','--dsw-alias-interactive-bg-hover-solid','--dsw-alias-interactive-bg-hover-danger','--dsw-alias-scrollbar-bg-l2','--dsw-alias-scrollbar-hover-l2','--dsw-alias-markdown-code-block','--dsw-alias-markdown-inline-code','--dsw-specific-sidebar-fill','--dsw-specific-input-major','--dsw-specific-menu','--dsw-specific-selector']
  for (const n of names) tokens[n] = cs.getPropertyValue(n).trim()
  return { dark: document.body.hasAttribute('data-ds-dark-theme'), tokens }
})()`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 800, show: false })
  win.webContents.setBackgroundThrottling(false)
  try {
    await win.loadURL(url)
    await sleep(12000)
    await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').includes('稍后配置')); if (b) b.click(); return true })()`)
    await sleep(800)
    await win.webContents.executeJavaScript(`(() => { const b = document.querySelector('.VOzbGW_trigger'); if (b) b.click(); return true })()`)
    await sleep(1500)
    await win.webContents.executeJavaScript(`(() => { const cubes = [...document.querySelectorAll('[class*="themeCube"]')]; const light = cubes.find(c => /浅/.test(c.textContent||'')); if (light) light.click(); return !!light })()`)
    await sleep(1500)
    const r = await win.webContents.executeJavaScript(TOKENS)
    fs.writeFileSync(path.join(process.cwd(), 'explore-out', '16-tokens-light.json'), JSON.stringify(r, null, 1))
    console.log('LIGHT_SAVED dark=' + r.dark)
  } catch (e) { console.log('FAILED ' + (e && e.stack || e)); process.exitCode = 1 }
  app.quit()
})
