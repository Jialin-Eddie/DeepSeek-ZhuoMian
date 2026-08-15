// 截图（URL 走环境变量）：npx electron scripts/shot-env.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const url = process.env.SHOT_URL || 'http://127.0.0.1:4173'
const out = process.env.SHOT_OUT || 'shot.png'
const waitMs = Number(process.env.SHOT_WAIT || 10000)
app.disableHardwareAcceleration()
process.on('uncaughtException', (e) => { console.log('uncaught: ' + (e && e.stack || e)); app.exit(1) })
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, backgroundColor: '#151517' })
  win.webContents.setBackgroundThrottling(false)
  try {
    await win.loadURL(url)
    await new Promise((r) => setTimeout(r, waitMs))
    const image = await win.webContents.capturePage()
    fs.writeFileSync(out, image.toPNG())
    console.log('SHOT_SAVED ' + out + ' bytes=' + image.toPNG().length)
  } catch (err) {
    console.log('FAILED ' + (err && err.stack || err))
    process.exitCode = 1
  }
  app.quit()
})
