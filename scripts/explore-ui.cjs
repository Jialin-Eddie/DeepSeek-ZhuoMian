// 探索脚本 v2：加载官方 DSH Web UI，依次进入各状态并导出结构/文本/令牌
// 用法：npx electron scripts/explore-ui.cjs [url] [outDir]
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const url = process.argv[2] || 'http://127.0.0.1:3080'
const outDir = process.argv[3] || 'explore-out'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

app.disableHardwareAcceleration()
const logFile = path.join(process.cwd(), 'explore.log')
const log = (m) => { try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${m}\n`) } catch {} }
log('start url=' + url + ' out=' + outDir)
process.on('uncaughtException', (e) => { log('uncaught: ' + (e && e.stack || e)); try { console.log('uncaught: ' + (e && e.stack || e)) } catch {}; app.exit(1) })

// executeJavaScript 加超时保护
function runJS(win, js, ms = 20000) {
  return new Promise((resolve) => {
    let done = false
    const timer = setTimeout(() => { if (!done) { done = true; resolve({ __timeout: true }) } }, ms)
    win.webContents.executeJavaScript(js).then(
      (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v) } },
      (e) => { if (!done) { done = true; clearTimeout(timer); resolve({ __error: String(e && e.message || e) }) } },
    )
  })
}

const SNAP_JS = `(() => {
  try {
    const txt = document.body ? document.body.innerText : ''
    const out = []
    const walk = (el, depth) => {
      if (depth > 12) return
      const tag = el.tagName ? el.tagName.toLowerCase() : ''
      if (tag === 'svg') return // 不深入 svg 子树
      const cls = (el.className && typeof el.className === 'string') ? el.className : ''
      const semantic = cls.split(/\\s+/).filter(Boolean).map((c) => {
        const m = c.match(/^_?([a-zA-Z0-9-]+)_\\d+/); return m ? m[1] : c
      }).join(' ')
      const role = el.getAttribute && el.getAttribute('role') || ''
      const aria = el.getAttribute && el.getAttribute('aria-label') || ''
      const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null
      const visible = r && r.width > 0 && r.height > 0
      if (semantic || role || aria) out.push({ d: depth, t: tag, c: semantic, r: role, a: aria, v: visible })
      for (const ch of el.children) walk(ch, depth + 1)
    }
    if (document.body) walk(document.body, 0)
    const lines = []
    let prev = ''
    for (const x of out) {
      const line = '  '.repeat(Math.min(x.d, 12)) + [x.t, x.c, x.r, x.a ? 'aria=' + x.a : '', x.v ? '' : '[hidden]'].filter(Boolean).join(' | ')
      if (line !== prev) { lines.push(line); prev = line }
    }
    const cs = getComputedStyle(document.documentElement)
    const tokens = {}
    for (const name of ['--dsw-alias-bg-base','--dsw-alias-label-primary','--dsw-alias-label-secondary','--dsw-alias-label-tertiary','--dsw-alias-label-caption','--dsw-alias-label-dimmed','--dsw-alias-state-business-primary','--dsw-alias-state-business-tertiary','--dsw-alias-button-info-fill','--dsw-alias-button-info-hover','--dsw-specific-sidebar-fill','--dsw-specific-input-major','--dsw-alias-border-l1','--dsw-alias-border-l2','--dsw-alias-interactive-bg-hover','--dsw-alias-label-primary-inverted','--dsw-alias-brand-primary','--dsh-sidebar-inline-padding','--dsh-chat-content-width','--dsh-composer-card-max-width','--dsh-composer-side-clearance']) {
      tokens[name] = cs.getPropertyValue(name).trim()
    }
    const frame = document.querySelector('.pI_x6G_frame')
    return {
      url: location.href,
      darkTheme: document.body ? document.body.hasAttribute('data-ds-dark-theme') : null,
      lang: document.documentElement.lang,
      text: txt,
      outline: lines,
      tokens,
      frameCols: frame ? getComputedStyle(frame).gridTemplateColumns : null,
      sidebarW: document.querySelector('.pI_x6G_sidebarCol') ? Math.round(document.querySelector('.pI_x6G_sidebarCol').getBoundingClientRect().width) : null,
    }
  } catch (e) { return { __snapError: e.message } }
})()`

let n = 0
async function snap(win, name) {
  n++
  const data = await runJS(win, SNAP_JS)
  fs.writeFileSync(path.join(outDir, `${String(n).padStart(2, '0')}-${name}.json`), JSON.stringify(data, null, 1))
  log('snap ' + name + ' text=' + (data.text ? data.text.length : '?') + ' outline=' + (data.outline ? data.outline.length : '?') + (data.__error ? ' ERR=' + data.__error : '') + (data.__snapError ? ' SNAP_ERR=' + data.__snapError : '') + (data.__timeout ? ' TIMEOUT' : ''))
  try { console.log('snap ' + name + ' ok') } catch {}
}

async function click(win, js, label) {
  const r = await runJS(win, js)
  log('click ' + label + ' -> ' + JSON.stringify(r))
  await sleep(700)
}

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true })
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, backgroundColor: '#151517' })
  win.webContents.setBackgroundThrottling(false)
  try {
    await win.loadURL(url)
    log('loaded')
    await sleep(10000)

    await snap(win, 'init')

    await click(win, `(() => { const btns = [...document.querySelectorAll('button')]; const b = btns.find(x => (x.textContent||'').includes('稍后配置')); if (b) { b.click(); return 'dismissed' } return 'no-modal' })()`, 'dismiss-modal')
    await sleep(800)
    await snap(win, 'hero')

    await click(win, `(() => { const b = document.querySelector('[aria-label^="访问模式"]'); if (b) { b.click(); return 'opened' } return 'not-found' })()`, 'open-mode')
    await snap(win, 'mode-menu')
    await click(win, `(() => { const b = document.querySelector('[aria-label^="访问模式"]'); if (b) { b.click(); return 'closed' } return 'nf' })()`, 'close-mode')

    await click(win, `(() => { const b = document.querySelector('[aria-label^="选择模型"]'); if (b) { b.click(); return 'opened' } return 'not-found' })()`, 'open-model')
    await snap(win, 'model-menu')
    await click(win, `(() => { const b = document.querySelector('[aria-label^="选择模型"]'); if (b) { b.click(); return 'closed' } return 'nf' })()`, 'close-model')

    await click(win, `(() => { const ta = document.querySelector('textarea'); if (ta) { ta.focus(); const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; s.call(ta, '/'); ta.dispatchEvent(new Event('input', { bubbles: true })); return 'typed' } return 'no-ta' })()`, 'type-slash')
    await snap(win, 'slash-menu')
    await click(win, `(() => { const ta = document.querySelector('textarea'); if (ta) { ta.focus(); const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; s.call(ta, ''); ta.dispatchEvent(new Event('input', { bubbles: true })); return 'cleared' } return 'no-ta' })()`, 'clear-slash')

    await click(win, `(() => { const b = document.querySelector('[aria-label="选择工作区"]'); if (b) { b.click(); return 'opened' } return 'not-found' })()`, 'open-workspace')
    await snap(win, 'workspace-menu')
    await click(win, `(() => { const b = document.querySelector('[aria-label="选择工作区"]'); if (b) { b.click(); return 'closed' } return 'nf' })()`, 'close-workspace')

    await click(win, `(() => { const b = document.querySelector('[aria-label="收起侧边栏"]'); if (b) { b.click(); return 'collapsed' } return 'not-found' })()`, 'collapse-sidebar')
    await snap(win, 'sidebar-collapsed')
    await click(win, `(() => { const b = document.querySelector('[aria-label="展开侧边栏"]'); if (b) { b.click(); return 'expanded' } return 'nf' })()`, 'expand-sidebar')

    // 进入会话：优先点标题行
    const entered = await runJS(win, `(() => {
      const rows = [...document.querySelectorAll('[role="treeitem"]')]
      const withTitle = rows.filter(r => r.querySelector('.YDXeBa_title'))
      const target = withTitle[0]
      if (target) { target.click(); return 'clicked:' + (target.textContent||'').slice(0, 40) }
      return 'no-sessions'
    })()`)
    log('enter-session -> ' + JSON.stringify(entered))
    await sleep(2500)
    await snap(win, 'session')

    // 详情面板（若有工具行）
    await click(win, `(() => { const els = [...document.querySelectorAll('[class*="tool"]')].filter(el => el.getBoundingClientRect().width > 0 && el.tagName !== 'svg'); const t = els[0]; if (t) { t.click(); return 'clicked:' + (t.className||'').slice(0, 60) } return 'no-tool-row' })()`, 'open-details')
    await snap(win, 'details')

    // 设置
    await click(win, `(() => { const b = document.querySelector('.VOzbGW_trigger'); if (b) { b.click(); return 'opened' } return 'not-found' })()`, 'open-settings')
    await sleep(1500)
    await snap(win, 'settings')

    // 亮色主题（主题方块）
    await click(win, `(() => { const cubes = [...document.querySelectorAll('[class*="themeCube"]')]; if (cubes.length) { const t = cubes.find(c => !(c.className||'').includes('selected')) || cubes[0]; t.click(); return 'clicked:' + (t.textContent||'').slice(0, 20) } return 'no-cubes' })()`, 'theme-light')
    await sleep(1200)
    await snap(win, 'theme-light')

    log('EXPLORE_DONE states=' + n)
    try { console.log('EXPLORE_DONE states=' + n) } catch {}
  } catch (err) {
    log('FAILED ' + (err && err.stack || err))
    try { console.log('FAILED ' + (err && err.stack || err)) } catch {}
    process.exitCode = 1
  }
  app.quit()
})
