const { app, BrowserWindow } = require('electron')
const fs = require('fs')
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 800, height: 600 })
  w.webContents.setBackgroundThrottling(false)
  await w.loadURL('http://127.0.0.1:3080')
  await new Promise((r) => setTimeout(r, 11000))
  const v = await w.webContents.executeJavaScript(`(() => {
    const cs = getComputedStyle(document.body)
    const g = (n) => cs.getPropertyValue(n).trim()
    return { dark: document.body.hasAttribute('data-ds-dark-theme'), fillTsp: g('--dsw-alias-fill-tsp-secondary'), fillL2: g('--dsw-alias-fill-l2'), tip: g('--dsw-specific-tip') }
  })()`)
  fs.writeFileSync('probe.json', JSON.stringify(v, null, 1))
  console.log('PROBE ' + JSON.stringify(v))
  app.quit()
})
