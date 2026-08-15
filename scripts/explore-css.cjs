// 探索脚本 v4：抓取会话视图的全部运行时 <style>（消息流/头部/停靠栏 CSS）+ 恢复暗色令牌
// 用法：npx electron scripts/explore-css.cjs （EXPLORE_URL / EXPLORE_OUT 环境变量）
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

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true })
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, backgroundColor: '#151517' })
  win.webContents.setBackgroundThrottling(false)
  try {
    await win.loadURL(url)
    log('loaded')
    await sleep(12000)
    await runJS(win, `(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').includes('稍后配置')); if (b) b.click(); return true })()`)
    await sleep(1000)

    // 进入“你好”会话
    const r = await runJS(win, `(() => {
      const rows = [...document.querySelectorAll('[role="treeitem"]')]
      const t = rows.find(rr => rr.querySelector('.YDXeBa_title') && (rr.textContent||'').includes('你好'))
      if (t) { t.click(); return 'clicked' }
      return 'no-sessions'
    })()`)
    log('enter -> ' + JSON.stringify(r))
    await sleep(4000)

    // 抓全部 style 标签（官方运行时 CSS，含会话视图）
    const styles = await runJS(win, `(() => {
      const out = []
      for (const st of document.querySelectorAll('style')) {
        const plugin = st.getAttribute('data-plugin') || ''
        const css = st.getAttribute('data-plugin-css') || ''
        out.push({ plugin, css, text: st.textContent })
      }
      return out
    })()`)
    if (styles && !styles.__error && !styles.__timeout) {
      const html = styles.map((s) => `<style data-plugin="${s.plugin}" data-plugin-css="${s.css}">${s.text}</style>`).join('\n')
      fs.writeFileSync(path.join(outDir, 'session-styles.html'), html)
      log('styles saved count=' + styles.length + ' bytes=' + html.length)
    } else {
      log('styles failed ' + JSON.stringify(styles))
    }

    // 会话视图补充结构：dock 栏、tabs 文案、头部触发按钮
    const extra = await runJS(win, `(() => {
      const txt = (sel) => { const el = document.querySelector(sel); return el ? (el.textContent||'').trim().slice(0, 60) : null }
      const tabs = [...document.querySelectorAll('.wSkVaW_tab')].map(t => (t.textContent||'').trim())
      const dock = document.querySelector('.nLMEza_dock')
      const dockItems = dock ? [...dock.children].map(c => (c.textContent||'').trim().slice(0, 40) || (c.className||'').slice(0, 60)) : null
      return {
        tabs, crumb: txt('.wSkVaW_crumbCurrent'),
        subagentsTrigger: txt('.h8S2Va_trigger'), jobsTrigger: txt('.QsffPG_trigger'),
        sessionLogBtn: txt('.nL4_yW_sessionLogButton'),
        olderBtn: txt('.Md3f7G_older'),
        dockItems,
        dockHTML: dock ? dock.outerHTML.slice(0, 1500) : null,
      }
    })()`)
    fs.writeFileSync(path.join(outDir, '14-session-extra.json'), JSON.stringify(extra, null, 1))
    log('extra -> ' + JSON.stringify(extra))

    // 设置 → 切回暗色 → 抓 body 级令牌
    await runJS(win, `(() => { const b = document.querySelector('.VOzbGW_trigger'); if (b) b.click(); return true })()`)
    await sleep(1500)
    const th = await runJS(win, `(() => {
      const cubes = [...document.querySelectorAll('[class*="themeCube"]')]
      if (!cubes.length) return 'no-cubes'
      const dark = cubes.find(c => /暗|深/.test(c.textContent||''))
      if (dark) { dark.click(); return 'clicked-dark' }
      const others = cubes.filter(c => !(c.className||'').includes('selected'))
      if (others.length) { others[0].click(); return 'clicked-other:' + (others[0].textContent||'').trim().slice(0, 10) }
      return 'already-dark?'
    })()`)
    log('theme -> ' + JSON.stringify(th))
    await sleep(1500)
    const toks = await runJS(win, `(() => {
      const cs = getComputedStyle(document.body)
      const tokens = {}
      const names = ['--dsw-alias-bg-base','--dsw-alias-bg-layer-1','--dsw-alias-bg-layer-2','--dsw-alias-bg-layer-3','--dsw-alias-bg-module-platform','--dsw-alias-border-inverted','--dsw-alias-border-l1','--dsw-alias-border-l2','--dsw-alias-border-l2-darkmode-thin','--dsw-alias-border-l3','--dsw-alias-border-l4','--dsw-alias-brand-primary','--dsw-alias-label-primary','--dsw-alias-label-secondary','--dsw-alias-label-tertiary','--dsw-alias-label-caption','--dsw-alias-label-dimmed','--dsw-alias-label-primary-bluish','--dsw-alias-label-primary-foreground','--dsw-alias-label-primary-inverted','--dsw-alias-state-business-primary','--dsw-alias-state-business-tertiary','--dsw-alias-state-error-primary','--dsw-alias-state-success-primary','--dsw-alias-state-warn-label','--dsw-alias-state-warn-primary','--dsw-alias-button-info-fill','--dsw-alias-button-info-hover','--dsw-alias-button-elevated-fill','--dsw-alias-button-floating-fill','--dsw-alias-button-floating-hover','--dsw-alias-button-ghost-active-fill','--dsw-alias-button-ghost-active-border','--dsw-alias-interactive-bg-hover','--dsw-alias-interactive-bg-active','--dsw-alias-interactive-bg-hover-solid','--dsw-alias-interactive-bg-hover-danger','--dsw-alias-scrollbar-bg-l2','--dsw-alias-scrollbar-hover-l2','--dsw-alias-markdown-code-block','--dsw-alias-markdown-inline-code','--dsw-specific-sidebar-fill','--dsw-specific-input-major','--dsw-specific-menu','--dsw-specific-selector'] {
        tokens[name] = cs.getPropertyValue(name).trim()
      }
      return { dark: document.body.hasAttribute('data-ds-dark-theme'), tokens }
    })()`)
    fs.writeFileSync(path.join(outDir, '15-tokens-dark.json'), JSON.stringify(toks, null, 1))
    log('tokens-dark -> dark=' + (toks.dark !== undefined ? toks.dark : JSON.stringify(toks)))
    log('CSS_EXPLORE_DONE')
    try { console.log('CSS_EXPLORE_DONE') } catch {}
  } catch (err) {
    log('FAILED ' + (err && err.stack || err))
    try { console.log('FAILED ' + (err && err.stack || err)) } catch {}
    process.exitCode = 1
  }
  app.quit()
})
