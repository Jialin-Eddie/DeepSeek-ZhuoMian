// 截图脚本 v2：加载 URL 保存 PNG，日志写入 shot.log
const { app, BrowserWindow } = require('electron')
const fs = require('fs')

const url = process.argv[2] || 'http://127.0.0.1:3099'
const out = process.argv[3] || 'screenshot.png'
const waitMs = Number(process.argv[4] || 10000)
const log = (m) => {
  fs.appendFileSync('shot.log', `[${new Date().toISOString()}] ${m}\n`)
  try { console.log(m) } catch {}
}

log('start url=' + url)
app.disableHardwareAcceleration()

process.on('uncaughtException', (e) => log('uncaught: ' + (e && e.stack || e)))
process.on('unhandledRejection', (e) => log('unhandled: ' + (e && e.stack || e)))

app.whenReady().then(async () => {
  log('ready')
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    backgroundColor: '#0f1115',
  })
  log('window created')
  try {
    await win.loadURL(url)
    log('loaded, waiting ' + waitMs + 'ms')
    await new Promise((r) => setTimeout(r, waitMs))
    const image = await win.webContents.capturePage()
    fs.writeFileSync(out, image.toPNG())
    log('SAVED ' + out + ' bytes=' + image.toPNG().length)
  } catch (err) {
    log('FAILED ' + (err && err.stack || err))
    process.exitCode = 1
  }
  app.quit()
})
