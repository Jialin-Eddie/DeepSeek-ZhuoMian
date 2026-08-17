// v0.1.2 功能2探针：右侧参照对话分栏（会话行参照按钮 → 打开面板 → 收藏 → 复制）
// 注意：参照按钮的收藏/复制依赖 dshDesktop.reference*（探针用桩代替）
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')

const F = require(path.join(__dirname, '..', 'dist-electron', 'featuresV012.js'))
const results = {}
function log(k, v) { results[k] = v; console.log('RESULT', k, JSON.stringify(v)) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 收藏桩：记录调用，返回假数据
const refCalls = []
ipcMain.handle('probe:record', (_e, payload) => { refCalls.push(payload); return { ok: true } })

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 1440, height: 900, show: false,
      backgroundColor: '#0f1115',
      webPreferences: {
        preload: path.join(__dirname, 'probe-v012-preload.cjs'),
        contextIsolation: true, nodeIntegration: false, sandbox: false,
      },
    })
    win.webContents.setBackgroundThrottling(false)
    await win.loadURL('http://127.0.0.1:3099/')
    await sleep(14000)

    // 打开一个会话
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

    // 注入 REFERENCE_SCRIPT
    await win.webContents.executeJavaScript(F.REFERENCE_SCRIPT, true)
    await sleep(1000)

    // 1. 会话行出现「参照」按钮
    const btnInfo = await win.webContents.executeJavaScript(`(() => {
      const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(r => (r.className || '').toString().indexOf('sessionRow') !== -1);
      let withBtn = 0;
      rows.forEach(r => { if (r.__dshRefBtnInjected) withBtn++; });
      return { sessionRows: rows.length, withBtn };
    })()`)
    log('row_buttons', btnInfo)

    // 2. 点击第一个会话行的参照按钮 → 面板打开
    await win.webContents.executeJavaScript(`(() => {
      const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(r => (r.className || '').toString().indexOf('sessionRow') !== -1);
      const first = rows[0];
      const btn = [...first.children].find(c => c.tagName === 'BUTTON' && c.textContent === '参照');
      if (btn) btn.click();
      return 'clicked';
    })()`)
    let opened = false
    for (let i = 0; i < 40; i++) {
      opened = await win.webContents.executeJavaScript(`!!document.getElementById('dsh-reference-panel')`)
      if (opened) break
      await sleep(500)
    }
    log('panel_open', opened)
    await sleep(3000) // 等历史加载
    const panelInfo = await win.webContents.executeJavaScript(`(() => {
      const p = document.getElementById('dsh-reference-panel');
      if (!p) return null;
      const msgArea = p.querySelector('div[style*="overflow-y: auto"]');
      return { title: (p.querySelector('#dsh-reference-title') || {}).textContent || '', hasCopyBtn: (p.textContent || '').indexOf('复制全部收藏') !== -1 };
    })()`)
    log('panel_info', panelInfo)

    // 3. 消息区有内容（问/答条目）
    const msgCount = await win.webContents.executeJavaScript(`(() => {
      const p = document.getElementById('dsh-reference-panel');
      if (!p) return 0;
      return p.querySelectorAll('span').length;
    })()`)
    log('msg_elements', msgCount)

    // 4. 收藏：点击某条消息的 ☆ → 桩记录 referenceAdd
    refCalls.length = 0
    await win.webContents.executeJavaScript(`(() => {
      const p = document.getElementById('dsh-reference-panel');
      const favs = [...p.querySelectorAll('button')].filter(b => b.textContent === '☆');
      if (favs.length > 0) favs[0].click();
      return 'collected';
    })()`)
    await sleep(800)
    log('collect_calls', refCalls.filter((c) => c.kind === 'referenceAdd'))

    // 5. 复制按钮点击 → 桩记录 copy（实际复制由页面 navigator.clipboard 完成，探针验证按钮存在与事件）
    await win.webContents.executeJavaScript(`(() => {
      const p = document.getElementById('dsh-reference-panel');
      const btns = [...p.querySelectorAll('button')].filter(b => b.textContent === '复制全部收藏');
      if (btns.length > 0) btns[0].click();
      return 'copied';
    })()`)
    await sleep(500)
    const diag = await win.webContents.executeJavaScript(`window.__dshReferenceDiag`)
    log('diag', diag)

    // 6. 关闭
    await win.webContents.executeJavaScript(`(() => {
      const p = document.getElementById('dsh-reference-panel');
      const btn = [...p.querySelectorAll('button')].find(b => b.textContent === '✕');
      if (btn) btn.click();
      return 'closed';
    })()`)
    await sleep(300)
    const closed = await win.webContents.executeJavaScript(`!document.getElementById('dsh-reference-panel')`)
    log('panel_closed', closed)

    const failures = []
    const assert = (cond, msg) => {
      if (cond) console.log('  ✓', msg)
      else { failures.push(msg); console.log('  ✗ FAIL:', msg) }
    }
    assert(btnInfo && btnInfo.sessionRows >= 1 && btnInfo.withBtn >= 1, '功能2：会话行注入「参照」按钮')
    assert(opened === true, '功能2：点击参照按钮打开右侧面板')
    assert(panelInfo && panelInfo.hasCopyBtn === true, '功能2：面板底部有「复制全部收藏」按钮')
    assert(msgCount >= 2, '功能2：面板显示对话内容（问/答条目）')
    assert(refCalls.filter((c) => c.kind === 'referenceAdd').length === 1, '功能2：收藏按钮触发 referenceAdd')
    assert(diag && diag.opened >= 1 && diag.copied >= 1, '功能2：复制按钮可点击')
    assert(closed === true, '功能2：✕ 关闭面板')

    console.log(failures.length === 0 ? '\nE2E_PASS' : '\nE2E_FAIL: ' + failures.join(' ; '))
    app.exit(failures.length === 0 ? 0 : 1)
  } catch (err) {
    console.log('PROBE_ERROR', String(err))
    app.exit(1)
  }
})
