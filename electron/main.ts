import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process'
import { writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadStash, savePrompt, deletePrompt, sanitizeKey, appendBtwNote } from './stashStore'
import { resolveActiveWorkspace, resolveActiveSessionId, historyTail } from './engineRpc'
import { READ_SCRIPT, CLEAR_SCRIPT, CLOSE_OVERLAY_SCRIPT, buildToastScript, buildOverlayScript } from './stashPage'
import { RAIL_SCRIPT, BTW_SCRIPT, REWIND_SCRIPT } from './featuresPage'
import { loadCheckpoints, saveCheckpoint, deleteCheckpoint } from './checkpointStore'

let mainWindow: BrowserWindow | null = null
let backend: ChildProcessWithoutNullStreams | null = null
let backendPort = 0

const BACKEND_PORT = 3099

/** 提示词便签（Ctrl+S）存储目录：~/.dsh/stash，按工作区一个文件 */
const STASH_DIR = (): string => path.join(os.homedir(), '.dsh', 'stash')
/** /checkpoint 检查点存储目录：~/.dsh/checkpoints，按工作区一个文件 */
const CHECKPOINTS_DIR = (): string => path.join(os.homedir(), '.dsh', 'checkpoints')
let stashOverlayOpen = false
let stashOverlayWorkspace = 'default'

/** 诊断日志：~/.dsh/stash/diag.log，方便远程排查（失败不影响功能） */
function diag(msg: string): void {
  try {
    const dir = STASH_DIR()
    mkdirSync(dir, { recursive: true })
    appendFileSync(path.join(dir, 'diag.log'), `[${new Date().toISOString()}] ${msg}\n`, 'utf8')
  } catch {
    /* 忽略 */
  }
}

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

  // ── 提示词便签：Ctrl+S 拦截（有字=存，空=弹列表恢复） ──
  // 放在主进程 before-input-event：比页面层可靠，能压过 Chromium 的「保存网页」。
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (!input.control || input.shift || input.alt || input.meta) return
    if (input.key.toLowerCase() !== 's') return
    event.preventDefault()
    diag(`Ctrl+S keydown (key=${input.key}) -> handleCtrlS`)
    void handleCtrlS()
  })

  // 启动确认：新版启动后在页面右下弹一次提示（也是"代码是否生效"的信号）
  mainWindow.webContents.on('did-finish-load', () => {
    void showToast(mainWindow!, '提示词便签已启用：输入框内 Ctrl+S 保存 · 空输入 Ctrl+S 恢复')
    // 注入功能脚本：prompt 轨道 + /btw 旁注（page world，不碰官方资产）
    void mainWindow!.webContents.executeJavaScript(RAIL_SCRIPT, true).catch((err) => diag(`rail inject failed ${String(err)}`))
    void mainWindow!.webContents.executeJavaScript(BTW_SCRIPT, true).catch((err) => diag(`btw inject failed ${String(err)}`))
    void mainWindow!.webContents.executeJavaScript(REWIND_SCRIPT, true).catch((err) => diag(`rewind inject failed ${String(err)}`))
  })

  // ── 页面缩放：Ctrl+= / Ctrl+- / Ctrl+0（与 Ctrl+S 互不干扰） ──
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (!input.control || input.shift || input.alt || input.meta) return
    const k = input.key.toLowerCase()
    if (k === '=' || k === '+') {
      event.preventDefault()
      void zoomPage(0.5)
    } else if (k === '-') {
      event.preventDefault()
      void zoomPage(-0.5)
    } else if (k === '0') {
      event.preventDefault()
      void zoomReset()
    }
  })
}

let zoomLevel = 0

/** 缩放页面并提示百分比（±0.5 档，范围 -200% ~ +400%） */
async function zoomPage(delta: number): Promise<void> {
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  zoomLevel = Math.max(-2, Math.min(4, zoomLevel + delta))
  win.webContents.setZoomLevel(zoomLevel)
  const percent = Math.round(Math.pow(1.2, zoomLevel) * 100)
  await showToast(win, `页面缩放 ${percent}%`)
}

async function zoomReset(): Promise<void> {
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  zoomLevel = 0
  win.webContents.setZoomLevel(0)
  await showToast(win, '页面缩放 100%')
}

/** 在页面里弹一条短暂提示（page world 注入，不碰官方 UI 结构） */
async function showToast(win: BrowserWindow, message: string): Promise<void> {
  try {
    await win.webContents.executeJavaScript(buildToastScript(message), true)
  } catch (err) {
    console.error('[stash] toast failed', err)
  }
}

/** 清空当前聚焦输入框（Ctrl+S 保存成功后；React 状态同步更新，保持焦点） */
async function clearComposer(win: BrowserWindow): Promise<void> {
  try {
    await win.webContents.executeJavaScript(CLEAR_SCRIPT, true)
  } catch (err) {
    diag(`clearComposer FAILED ${String(err)}`)
  }
}

/** 关闭便签浮层（overlay 开着时再按 Ctrl+S = 关闭） */
async function closeStashOverlay(win: BrowserWindow): Promise<void> {
  stashOverlayOpen = false
  try {
    await win.webContents.executeJavaScript(CLOSE_OVERLAY_SCRIPT, true)
  } catch {
    /* 页面未就绪无所谓 */
  }
}

/** 打开便签列表浮层（仅当前工作区的条目） */
async function openStashOverlay(win: BrowserWindow, workspacePath: string): Promise<void> {
  const file = loadStash(STASH_DIR(), workspacePath)
  if (file.items.length === 0) {
    await showToast(win, '这个工作区还没有已保存的提示词 — 在输入框里按 Ctrl+S 保存')
    return
  }
  stashOverlayOpen = true
  stashOverlayWorkspace = workspacePath
  const title = path.basename(workspacePath) || workspacePath
  try {
    await win.webContents.executeJavaScript(buildOverlayScript(file.items, title), true)
  } catch (err) {
    stashOverlayOpen = false
    diag(`openStashOverlay FAILED ${String(err)}`)
    console.error('[stash] overlay failed', err)
  }
}

/**
 * Ctrl+S 主流程：
 * 1. overlay 开着 → 关闭
 * 2. 聚焦的输入框有内容 → 存进当前工作区的便签
 * 3. 没有内容 → 弹便签列表
 */
async function handleCtrlS(): Promise<void> {
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  diag(`handleCtrlS: overlayOpen=${stashOverlayOpen}`)
  if (stashOverlayOpen) {
    await closeStashOverlay(win)
    diag('handleCtrlS: closed overlay')
    return
  }

  const workspace = (await resolveActiveWorkspace(backendPort || BACKEND_PORT)) ?? 'default'
  diag(`handleCtrlS: workspace=${workspace}`)

  let state: { focused?: boolean; value?: string } | null = null
  try {
    state = (await win.webContents.executeJavaScript(READ_SCRIPT, true)) as { focused?: boolean; value?: string }
    diag(`handleCtrlS: readState=${JSON.stringify(state)}`)
  } catch (err) {
    diag(`handleCtrlS: readState FAILED ${String(err)}`)
  }

  const text = state?.focused ? (state.value ?? '').trim() : ''
  if (text) {
    try {
      const { deduped } = savePrompt(STASH_DIR(), workspace, text)
      diag(`handleCtrlS: SAVED deduped=${deduped} len=${text.length}`)
      await clearComposer(win)
      await showToast(win, deduped ? `已更新便签并清空输入框 · ${sanitizeKey(workspace)}` : `已保存到提示词便签（输入已清空）· ${sanitizeKey(workspace)}`)
    } catch (err) {
      diag(`handleCtrlS: savePrompt FAILED ${String(err)}`)
      await showToast(win, '保存失败：' + String(err))
    }
  } else {
    const file = loadStash(STASH_DIR(), workspace)
    diag(`handleCtrlS: no text -> overlay items=${file.items.length}`)
    await openStashOverlay(win, workspace)
  }
}

/**
 * 启动 DeepSeek Harness 后端（dsh web），作为本应用的本地引擎。
 * 端口固定为 BACKEND_PORT，避免与用户自己开的 3080 冲突。
 *
 * 关键：dsh 需要 Node >=22 的 API（stripTypeScriptTypes / zlib zstd），
 * 而 Electron 33 内置 Node 只有 20 —— 所以必须用【真实 Node】跑内置 dsh：
 * - 打包后：resources/node.exe（随安装包分发）+ app.asar.unpacked 里的内置 dsh
 * - 开发时：系统 node 直接跑 node_modules 里的 dsh；无 node 则回退 npx
 */
function startBackend(): void {
  const webArgs = ['web', '--port', String(BACKEND_PORT)]
  let cmd: string
  let args: string[]
  let shell = false

  if (app.isPackaged) {
    const node = path.join(process.resourcesPath, 'node.exe')
    const bin = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    if (existsSync(node) && existsSync(bin)) {
      cmd = node
      args = [bin, ...webArgs]
      console.log('[dsh] packaged mode: bundled node + bundled dsh')
    } else {
      cmd = 'npx'
      args = ['--yes', '@deepseek-ai/dsh', ...webArgs]
      shell = true
      console.log('[dsh] packaged node missing, falling back to npx')
    }
  } else {
    const bin = path.join(__dirname, '../node_modules/@deepseek-ai/dsh/lib/bin.js')
    if (existsSync(bin)) {
      cmd = 'node'
      args = [bin, ...webArgs]
      console.log('[dsh] dev mode: system node + bundled dsh')
    } else {
      cmd = 'npx'
      args = ['--yes', '@deepseek-ai/dsh', ...webArgs]
      shell = true
      console.log('[dsh] dev mode: bundled dsh missing, falling back to npx')
    }
  }

  try {
    backend = spawn(cmd, args, {
      windowsHide: true,
      shell,
      env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    })
    backendPort = BACKEND_PORT

    backend.stdout?.on('data', (d: Buffer) => console.log(`[dsh] ${d.toString().trim()}`))
    backend.stderr?.on('data', (d: Buffer) => console.error(`[dsh:err] ${d.toString().trim()}`))
    backend.on('error', (err) => {
      // 系统 node 缺失时回退 npx
      console.error('[dsh] spawn error, falling back to npx:', err.message)
      backend = spawn('npx', ['--yes', '@deepseek-ai/dsh', ...webArgs], {
        windowsHide: true,
        shell: true,
        env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
      })
      backend.stdout?.on('data', (d: Buffer) => console.log(`[dsh] ${d.toString().trim()}`))
      backend.stderr?.on('data', (d: Buffer) => console.error(`[dsh:err] ${d.toString().trim()}`))
    })
    backend.on('exit', (code) => {
      console.log(`[dsh] backend exited with code ${code}`)
      backend = null
    })
  } catch (err) {
    console.error('[dsh] failed to start backend:', err)
  }
}

/**
 * 自动更新（electron-updater，GitHub Releases 源）。
 * 仅对「安装版（NSIS）」生效；便携/win-unpacked/开发模式静默跳过。
 * 任何失败只记日志，绝不影响正常使用。
 */
function setupAutoUpdate(): void {
  if (!app.isPackaged) {
    diag('auto-update: skipped (dev mode)')
    return
  }
  autoUpdater.autoDownload = true
  autoUpdater.logger = {
    info: (m?: unknown) => diag(`updater: ${String(m)}`),
    warn: (m?: unknown) => diag(`updater:WARN ${String(m)}`),
    error: (m?: unknown) => diag(`updater:ERR ${String(m)}`),
    debug: (m?: unknown) => diag(`updater:DBG ${String(m)}`),
  }
  autoUpdater.on('update-downloaded', async (info) => {
    diag(`auto-update: downloaded ${info.version}`)
    if (!mainWindow) return
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '发现新版本',
      message: `新版本 ${info.version} 已下载完成`,
      detail: '重启后自动完成更新，会话与数据不会丢失。',
      buttons: ['立即重启更新', '稍后'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response === 0) autoUpdater.quitAndInstall()
  })
  autoUpdater.on('error', (err) => diag(`auto-update: error ${String(err)}`))
  // 延迟 8s 再检查，不拖慢启动
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => diag(`auto-update: check failed ${String(err)}`))
  }, 8000)
}

ipcMain.handle('backend:port', () => backendPort)

ipcMain.handle('dialog:pickFolder', async () => {
  if (!mainWindow) return null
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
  if (r.canceled || r.filePaths.length === 0) return null
  return r.filePaths[0]
})

// ── 提示词便签 IPC（浮层在页面 world 里，通过 contextBridge 调回主进程） ──
ipcMain.handle('stash:delete', (_e, id: string) => {
  if (!stashOverlayOpen) return false
  return deletePrompt(STASH_DIR(), stashOverlayWorkspace, id)
})

ipcMain.handle('stash:closed', () => {
  stashOverlayOpen = false
  return true
})

// ── /btw 旁注：保存到 ~/.dsh/stash/btw-<workspace>.json，不发给模型 ──
ipcMain.handle('btw:note', async (_e, note: string) => {
  try {
    const workspace = (await resolveActiveWorkspace(backendPort || BACKEND_PORT)) ?? 'default'
    const item = appendBtwNote(STASH_DIR(), workspace, note)
    diag(`btw note saved ${item.id} ws=${sanitizeKey(workspace)}`)
    void showToast(mainWindow!, `已记录旁注（未发送给模型）· ${sanitizeKey(workspace)}`)
    return { ok: true }
  } catch (err) {
    diag(`btw note FAILED ${String(err)}`)
    void showToast(mainWindow!, '旁注保存失败：' + String(err))
    return { ok: false }
  }
})

// ── 页面侧诊断：BTW/REWIND 脚本把拦截细节写进 diag.log，方便远程排查 ──
ipcMain.handle('diag:log', (_e, msg: string) => {
  diag(`[page] ${String(msg ?? '')}`)
  return true
})

// ── /checkpoint 检查点（本机书签：会话 + seq + 名字，供 /rewind 定位） ──
ipcMain.handle('checkpoint:save', async (_e, input: { name?: string }) => {
  try {
    const port = backendPort || BACKEND_PORT
    const workspace = (await resolveActiveWorkspace(port)) ?? 'default'
    const sessionId = await resolveActiveSessionId(port)
    if (!sessionId) throw new Error('没有可用会话')
    const tail = await historyTail(port, sessionId)
    if (tail.lastSeq == null) throw new Error('拿不到会话进度（引擎未就绪？）')
    const item = saveCheckpoint(CHECKPOINTS_DIR(), workspace, {
      name: String(input?.name ?? '未命名'),
      sessionId,
      atSeq: tail.lastSeq,
      preview: tail.lastPrompt,
    })
    diag(`checkpoint saved ${item.id} ws=${sanitizeKey(workspace)} seq=${item.atSeq}`)
    void showToast(mainWindow!, `检查点已保存：${item.name} · ${sanitizeKey(workspace)}`)
    return { ok: true }
  } catch (err) {
    diag(`checkpoint save FAILED ${String(err)}`)
    void showToast(mainWindow!, '检查点保存失败：' + String(err))
    return { ok: false }
  }
})

ipcMain.handle('checkpoint:list', async () => {
  try {
    const port = backendPort || BACKEND_PORT
    const workspace = (await resolveActiveWorkspace(port)) ?? 'default'
    return loadCheckpoints(CHECKPOINTS_DIR(), workspace)
  } catch {
    return { workspacePath: '', items: [] }
  }
})

ipcMain.handle('checkpoint:delete', async (_e, id: string) => {
  try {
    const port = backendPort || BACKEND_PORT
    const workspace = (await resolveActiveWorkspace(port)) ?? 'default'
    const ok = deleteCheckpoint(CHECKPOINTS_DIR(), workspace, String(id ?? ''))
    diag(`checkpoint delete ${ok ? 'ok' : 'miss'} ${String(id)}`)
    return ok
  } catch {
    return false
  }
})

// ── 单实例锁：同时只允许一个 app（便携/安装版混开时，第二个自动聚焦第一个，杜绝端口冲突黑屏） ──
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

app.whenReady().then(() => {
  const shotUrl = process.env.SHOT_URL
  if (shotUrl) {
    void runScreenshot(shotUrl).finally(() => app.quit())
    return
  }

  startBackend()
  createWindow()
  setupAutoUpdate()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
}

app.on('window-all-closed', () => {
  backend?.kill()
  if (process.platform !== 'darwin') app.quit()
})
