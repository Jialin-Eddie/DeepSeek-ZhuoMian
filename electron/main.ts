import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process'
import { writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

let mainWindow: BrowserWindow | null = null
let backend: ChildProcessWithoutNullStreams | null = null
let backendPort = 0

const BACKEND_PORT = 3099

/**
 * 双模式（D1 启动器）：
 * - UI_MODE=mock （或 VITE_DEV_SERVER_URL 存在）→ 自绘 mock UI（dist/index.html）
 * - 默认 UI_MODE=official → 直接加载官方 DeepSeek Harness Web UI（1:1，填 API Key 即可真实使用）
 */
const UI_MODE: 'official' | 'mock' = process.env.UI_MODE === 'mock' ? 'mock' : 'official'

// 兜底：主进程未捕获的异步 rejection 不应导致整窗退出（Node 默认 throw 会让 exit code=1）
process.on('unhandledRejection', (reason) => {
  console.error('[ui] unhandledRejection:', reason)
})

/** 安全加载：任何加载失败只记日志，不崩溃 */
function safeLoad(win: BrowserWindow, target: string): void {
  void win.loadURL(target).catch((err) => console.error('[ui] load failed', target, err))
}

/** 轮询等待后端就绪（最多 timeoutMs） */
function waitForBackend(url: string, timeoutMs = 90000): Promise<boolean> {
  const start = Date.now()
  return new Promise((resolve) => {
    const tick = async () => {
      try {
        const r = await fetch(url)
        if (r.ok) return resolve(true)
      } catch {
        /* not up yet */
      }
      if (Date.now() - start > timeoutMs) return resolve(false)
      setTimeout(tick, 500)
    }
    void tick()
  })
}

/** 截图模式：SHOT_URL 环境变量触发，用于观察目标页面设计（不常驻） */
async function runScreenshot(url: string): Promise<void> {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    backgroundColor: '#0f1115',
  })
  win.webContents.setBackgroundThrottling(false)
  await win.loadURL(url)
  await new Promise((r) => setTimeout(r, 12000))
  const image = await win.webContents.capturePage()
  const out = path.join(__dirname, '../shot-dsh.png')
  writeFileSync(out, image.toPNG())
  console.log('SHOT_SAVED ' + out)

  // 抓取渲染后的 DOM 结构 + 文本，用于 1:1 复刻
  const html = await win.webContents.executeJavaScript(
    'document.documentElement.outerHTML',
  ) as string
  writeFileSync(path.join(__dirname, '../shot-dom.html'), html)
  const text = await win.webContents.executeJavaScript(
    'document.body.innerText',
  ) as string
  writeFileSync(path.join(__dirname, '../shot-text.txt'), text)
  console.log('DOM_SAVED html=' + html.length + ' text=' + text.length)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    safeLoad(mainWindow, devUrl)
  } else if (UI_MODE === 'mock') {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html')).catch((err) => console.error('[ui] load mock failed', err))
  } else {
    // 官方模式：等后端就绪后加载官方 UI
    void (async () => {
      const url = `http://127.0.0.1:${BACKEND_PORT}/`
      const ok = await waitForBackend(url)
      console.log(`[ui] official mode, backend ${ok ? 'ready' : 'TIMEOUT'} -> ${url}`)
      if (mainWindow) safeLoad(mainWindow, url)
    })()
  }
}

/**
 * 启动 DeepSeek Harness 后端（dsh web），作为本应用的本地引擎。
 * 端口固定为 BACKEND_PORT，避免与用户自己开的 3080 冲突。
 *
 * 打包后优先用【内置 dsh CLI】：以应用自带的 Electron 运行时直接执行
 * node_modules/@deepseek-ai/dsh/lib/bin.js（对方机器无需安装 Node、无需联网下载）；
 * 仅当内置缺失（开发环境未装依赖）时回退 npx 拉取。
 */
function startBackend(): void {
  const bundledBin = path.join(__dirname, '../node_modules/@deepseek-ai/dsh/lib/bin.js')
  let cmd: string
  let args: string[]
  if (existsSync(bundledBin)) {
    cmd = process.execPath // 应用自己的 exe（Electron 运行时，含 Node）
    args = [bundledBin, 'web', '--port', String(BACKEND_PORT)]
    console.log('[dsh] using bundled dsh CLI: ' + bundledBin)
  } else {
    cmd = 'npx'
    args = ['--yes', '@deepseek-ai/dsh', 'web', '--port', String(BACKEND_PORT)]
    console.log('[dsh] bundled dsh missing, falling back to npx')
  }

  try {
    backend = spawn(cmd, args, {
      windowsHide: true,
      shell: cmd === 'npx',
      env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    })
    backendPort = BACKEND_PORT

    backend.stdout?.on('data', (d: Buffer) => console.log(`[dsh] ${d.toString().trim()}`))
    backend.stderr?.on('data', (d: Buffer) => console.error(`[dsh:err] ${d.toString().trim()}`))
    backend.on('exit', (code) => {
      console.log(`[dsh] backend exited with code ${code}`)
      backend = null
    })
  } catch (err) {
    console.error('[dsh] failed to start backend:', err)
  }
}

ipcMain.handle('backend:port', () => backendPort)

ipcMain.handle('dialog:pickFolder', async () => {
  if (!mainWindow) return null
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
  if (r.canceled || r.filePaths.length === 0) return null
  return r.filePaths[0]
})

app.whenReady().then(() => {
  const shotUrl = process.env.SHOT_URL
  if (shotUrl) {
    void runScreenshot(shotUrl).finally(() => app.quit())
    return
  }

  startBackend()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  backend?.kill()
  if (process.platform !== 'darwin') app.quit()
})
