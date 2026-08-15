// 探索脚本 v3（会话态）：加载官方 UI，进入会话，抓取消息流/工具卡/详情面板的
// 结构（不含用户消息文本，隐私保护），并修复令牌读取（body 级）。
// 用法：npx electron scripts/explore-session.cjs （URL 走环境变量 EXPLORE_URL）
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const url = process.env.EXPLORE_URL || 'http://127.0.0.1:3080'
const outDir = process.env.EXPLORE_OUT || 'explore-out'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

app.disableHardwareAcceleration()
const logFile = path.join(process.cwd(), 'explore.log')
const log = (m) => { try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${m}\n`) } catch {} }
log('start url=' + url)
process.on('uncaughtException', (e) => { log('uncaught: ' + (e && e.stack || e)); try { console.log('uncaught: ' + (e && e.stack || e)) } catch {}; app.exit(1) })

function runJS(win, js, ms = 25000) {
  return new Promise((resolve) => {
    let done = false
    const timer = setTimeout(() => { if (!done) { done = true; resolve({ __timeout: true }) } }, ms)
    win.webContents.executeJavaScript(js).then(
      (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v) } },
      (e) => { if (!done) { done = true; clearTimeout(timer); resolve({ __error: String(e && e.message || e) }) } },
    )
  })
}

// 结构抓取（无消息文本）：outline + 控件文案 + 计数 + 令牌
const STRUCT_JS = `(() => {
  try {
    const out = []
    const walk = (el, depth) => {
      if (depth > 14) return
      const tag = el.tagName ? el.tagName.toLowerCase() : ''
      if (tag === 'svg') return
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
    walk(document.body, 0)
    const lines = []
    let prev = ''
    for (const x of out) {
      const line = '  '.repeat(Math.min(x.d, 12)) + [x.t, x.c, x.r, x.a ? 'aria=' + x.a : '', x.v ? '' : '[hidden]'].filter(Boolean).join(' | ')
      if (line !== prev) { lines.push(line); prev = line }
    }
    // 控件文案（按钮/aria，≤80 字符；消息正文不在此列）
    const chrome = []
    const collect = (el) => {
      const tag = el.tagName ? el.tagName.toLowerCase() : ''
      if (tag === 'svg') return
      const aria = el.getAttribute && el.getAttribute('aria-label')
      const txt = (el.childElementCount === 0 ? (el.textContent || '') : '').trim()
      const isBtn = tag === 'button' || (el.getAttribute && el.getAttribute('role') === 'button')
      if ((aria || isBtn) && el.getBoundingClientRect && el.getBoundingClientRect().width > 0) {
        const t = (aria || txt || '').slice(0, 80)
        if (t) chrome.push(t)
      }
      for (const ch of el.children) collect(ch)
    }
    collect(document.body)
    // 计数（消息区结构）
    const view = document.querySelector('.wSkVaW_viewArea')
    const counts = view ? {
      msgBlocks: view.querySelectorAll('[class*="msg"], [class*="Message"]').length,
      toolCards: view.querySelectorAll('[class*="tool"], [class*="Tool"]').length,
      codeBlocks: view.querySelectorAll('pre, [class*="code"]').length,
      tables: view.querySelectorAll('table').length,
      imgs: view.querySelectorAll('img').length,
      detailSections: document.querySelectorAll('.ydkMvW_section').length,
      detailCode: document.querySelectorAll('.ydkMvW_code').length,
    } : null
    const cs = getComputedStyle(document.body)
    const tokens = {}
    for (const name of ['--dsw-alias-bg-base','--dsw-alias-label-primary','--dsw-alias-label-secondary','--dsw-alias-label-tertiary','--dsw-alias-label-caption','--dsw-alias-label-dimmed','--dsw-alias-state-business-primary','--dsw-alias-state-business-tertiary','--dsw-alias-button-info-fill','--dsw-alias-button-info-hover','--dsw-specific-sidebar-fill','--dsw-specific-input-major','--dsw-alias-border-l1','--dsw-alias-border-l2','--dsw-alias-interactive-bg-hover','--dsw-alias-label-primary-inverted','--dsw-alias-brand-primary','--dsh-chat-content-width','--dsh-composer-card-max-width','--dsh-composer-side-clearance']) {
      tokens[name] = cs.getPropertyValue(name).trim()
    }
    return {
      darkTheme: document.body.hasAttribute('data-ds-dark-theme'),
      outline: lines,
      chrome,
      counts,
      tokens,
      headerDisplay: document.querySelector('.wSkVaW_header') ? getComputedStyle(document.querySelector('.wSkVaW_header')).display : null,
      frameCols: document.querySelector('.pI_x6G_frame') ? getComputedStyle(document.querySelector('.pI_x6G_frame')).gridTemplateColumns : null,
    }
  } catch (e) { return { __snapError: e.message } }
})()`

async function snap(win, name) {
  const data = await runJS(win, STRUCT_JS)
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(data, null, 1))
  log('snap ' + name + ' outline=' + (data.outline ? data.outline.length : '?') + ' chrome=' + (data.chrome ? data.chrome.length : '?') + (data.__snapError ? ' ERR=' + data.__snapError : ''))
  try { console.log('snap ' + name + ' ok') } catch {}
}

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true })
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, backgroundColor: '#151517' })
  win.webContents.setBackgroundThrottling(false)
  try {
    await win.loadURL(url)
    log('loaded')
    await sleep(12000)

    // 关弹窗
    await runJS(win, `(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').includes('稍后配置')); if (b) { b.click(); return 'dismissed' } return 'no-modal' })()`)
    await sleep(1500)

    // 点会话行（标题含“你好”的会话，内容最短）
    const r = await runJS(win, `(() => {
      const rows = [...document.querySelectorAll('[role="treeitem"]')]
      const t = rows.find(rr => rr.querySelector('.YDXeBa_title') && (rr.textContent||'').includes('你好'))
      if (t) { t.click(); return 'clicked:你好' }
      const any = rows.find(rr => rr.querySelector('.YDXeBa_title'))
      if (any) { any.click(); return 'clicked:any' }
      return 'no-sessions'
    })()`)
    log('enter-session -> ' + JSON.stringify(r))
    await sleep(4000)
    await snap(win, '12-session-view')

    // 点工具行打开详情面板（在消息区内找）
    const r2 = await runJS(win, `(() => {
      const view = document.querySelector('.wSkVaW_viewArea')
      if (!view) return 'no-view'
      const cands = [...view.querySelectorAll('[role="button"], button')].filter(el => el.getBoundingClientRect().width > 0)
      const t = cands.find(el => /tool|Tool/i.test(el.className || '')) || cands.find(el => (el.textContent||'').trim().length > 0 && (el.className||'').length > 0)
      if (t) { t.click(); return 'clicked:' + (t.className||'').slice(0, 60) }
      return 'no-candidates'
    })()`)
    log('open-details -> ' + JSON.stringify(r2))
    await sleep(1500)
    await snap(win, '13-details-open')

    log('SESSION_EXPLORE_DONE')
    try { console.log('SESSION_EXPLORE_DONE') } catch {}
  } catch (err) {
    log('FAILED ' + (err && err.stack || err))
    try { console.log('FAILED ' + (err && err.stack || err)) } catch {}
    process.exitCode = 1
  }
  app.quit()
})
