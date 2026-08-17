// v0.1.2 功能5探针：右侧 prompt 轨道显示「全部」提示词节点（引擎 API 拉取，不依赖 DOM 已加载部分）
const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const F = require(path.join(__dirname, '..', 'dist-electron', 'featuresV012.js'))
const results = {}
function log(k, v) { results[k] = v; console.log('RESULT', k, JSON.stringify(v)) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 1440, height: 900, show: false,
      backgroundColor: '#0f1115',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false },
    })
    win.webContents.setBackgroundThrottling(false)
    await win.loadURL('http://127.0.0.1:3099/')
    await sleep(14000)

    // 打开一个会话（选最长，历史多）
    await win.webContents.executeJavaScript(`(async () => {
      for (const proj of [...document.querySelectorAll('[role="treeitem"]')].filter(r => (r.className || '').toString().indexOf('projectRow') !== -1)) {
        const chev = proj.querySelector('[class*="chevron"]');
        if (chev) { try { chev.click(); } catch (e) {} }
      }
      await new Promise(r => setTimeout(r, 1000));
      const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(r => (r.className || '').toString().indexOf('sessionRow') !== -1);
      let best = null;
      for (const row of rows.slice(0, 15)) {
        row.click();
        await new Promise(r => setTimeout(r, 1200));
        const sc = document.querySelector('[data-conversation-scroll]');
        const h = sc ? sc.scrollHeight : 0;
        if (!best || h > best.h) best = { row, h };
      }
      if (best) { best.row.click(); await new Promise(r => setTimeout(r, 2500)); }
      return 'opened';
    })()`)

    // 注入 RAIL_ALL_SCRIPT
    await win.webContents.executeJavaScript(F.RAIL_ALL_SCRIPT, true)

    // 等待构建（API 分页拉取需要时间）
    let built = false
    for (let i = 0; i < 40; i++) {
      built = await win.webContents.executeJavaScript(`!!document.getElementById('dsh-prompt-rail-all')`)
      if (built) break
      await sleep(500)
    }
    const railInfo = await win.webContents.executeJavaScript(`(() => {
      const r = document.getElementById('dsh-prompt-rail-all');
      if (!r) return { built: false };
      const cs = getComputedStyle(r);
      const first = r.children[0];
      const firstCs = first ? getComputedStyle(first) : null;
      return {
        built: true, lines: r.children.length,
        firstTip: r.children[0] ? r.children[0].getAttribute('aria-label') : null,
        lastTip: r.children[r.children.length - 1] ? r.children[r.children.length - 1].getAttribute('aria-label') : null,
        bg: cs.backgroundColor,
        lineW: firstCs ? firstCs.width : null,
        lineH: firstCs ? firstCs.height : null,
        lineBg: firstCs ? firstCs.backgroundColor : null,
      };
    })()`)
    log('rail_all', railInfo)

    // DOM 里已渲染的 user 节点数（官方增量加载，应少于轨道节点数 = 轨道显示全部）
    const domCount = await win.webContents.executeJavaScript(`document.querySelectorAll('div[data-chat-flow-kind="user"]').length`)
    log('dom_user_count', domCount)

    // 点击轨道某条（倒数第3条）→ 应跳转（滚动发生）
    const scrollBefore = await win.webContents.executeJavaScript(`(() => {
      const sc = document.querySelector('[data-conversation-scroll]');
      sc.scrollTop = 0;
      return sc.scrollTop;
    })()`)
    await sleep(200)
    await win.webContents.executeJavaScript(`(() => {
      const r = document.getElementById('dsh-prompt-rail-all');
      if (!r || r.children.length < 3) return 'too-few';
      r.children[r.children.length - 3].click();
      return 'clicked';
    })()`)
    await sleep(1200)
    const scrollAfter = await win.webContents.executeJavaScript(`(() => {
      const sc = document.querySelector('[data-conversation-scroll]');
      return Math.round(sc.scrollTop);
    })()`)
    log('jump', { before: scrollBefore, after: scrollAfter })

    const failures = []
    const assert = (cond, msg) => {
      if (cond) console.log('  ✓', msg)
      else { failures.push(msg); console.log('  ✗ FAIL:', msg) }
    }
    assert(railInfo && railInfo.built === true, '功能5：全量 prompt 轨道构建')
    assert(railInfo && railInfo.lines >= 3, '功能5：轨道含多条提示词节点')
    assert(domCount >= 1 && railInfo && railInfo.lines > domCount, '功能5：轨道节点数 > DOM 已渲染数（显示全部而非仅加载部分）')
    assert(scrollAfter > scrollBefore, '功能5：点击轨道节点触发跳转滚动')
    assert(railInfo && railInfo.bg && String(railInfo.bg).indexOf('255') !== -1, '样式：轨道背景为浅色（非黑色）')
    assert(railInfo && railInfo.lineW && parseInt(railInfo.lineW, 10) >= 30 && railInfo.lineH && parseInt(railInfo.lineH, 10) >= 8, '样式：节点为长条（宽≥30px 高≥8px）')

    console.log(failures.length === 0 ? '\nE2E_PASS' : '\nE2E_FAIL: ' + failures.join(' ; '))
    app.exit(failures.length === 0 ? 0 : 1)
  } catch (err) {
    console.log('PROBE_ERROR', String(err))
    app.exit(1)
  }
})
