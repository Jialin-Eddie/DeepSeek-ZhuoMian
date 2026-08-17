// v0.1.2 功能1探针：输入框 ↑ 调出历史提示词
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

    // 0. 打开一个会话（选最长）
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

    // 1. 注入 HISTORY_SCRIPT
    await win.webContents.executeJavaScript(F.HISTORY_SCRIPT, true)
    await sleep(800)

    // 辅助：设置输入框为空并聚焦，按 ↑
    const pressUp = `(async () => {
      const ta = document.querySelector('textarea[data-phase]');
      if (!ta) return 'no-composer';
      const proto = HTMLTextAreaElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(ta, ''); else ta.value = '';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      ta.setSelectionRange(0, 0);
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true, cancelable: true, composed: true }));
      return 'pressed';
    })()`

    // 2. 空输入框按 ↑ → 浮层打开（轮询等历史分页拉取）
    await win.webContents.executeJavaScript(pressUp)
    let opened = false
    for (let i = 0; i < 30; i++) {
      opened = await win.webContents.executeJavaScript(`!!document.getElementById('dsh-history-overlay')`)
      if (opened) break
      await sleep(500)
    }
    const diag1 = await win.webContents.executeJavaScript(`window.__dshHistoryDiag`)
    log('diag_after_up', diag1)
    log('overlay_open', opened)
    const overlayInfo = await win.webContents.executeJavaScript(`(() => {
      const o = document.getElementById('dsh-history-overlay');
      if (!o) return null;
      const rows = o.querySelectorAll('div[style*="cursor: pointer"]').length;
      const firstRow = o.querySelector('div[style*="cursor: pointer"]');
      return { rows, firstText: firstRow ? firstRow.textContent.slice(0, 60) : null };
    })()`)
    log('overlay_info', overlayInfo)

    // 3. 浮层内 Enter → 回填第一条到输入框并关闭
    await win.webContents.executeJavaScript(`(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, composed: true }));
      return 'enter';
    })()`)
    await sleep(500)
    const fill = await win.webContents.executeJavaScript(`(() => {
      const ta = document.querySelector('textarea[data-phase]');
      return { value: ta ? ta.value.slice(0, 60) : null, overlayGone: !document.getElementById('dsh-history-overlay') };
    })()`)
    log('enter_fill', fill)

    // 4. 输入框有内容时按 ↑ → 不应弹浮层（不干扰光标移动）
    await win.webContents.executeJavaScript(`(() => {
      const ta = document.querySelector('textarea[data-phase]');
      const proto = HTMLTextAreaElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(ta, '测试内容'); else ta.value = '测试内容';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      ta.setSelectionRange(4, 4);
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true, cancelable: true, composed: true }));
      return 'typed';
    })()`)
    await sleep(600)
    const noOverlay = await win.webContents.executeJavaScript(`!!document.getElementById('dsh-history-overlay')`)
    log('nonempty_no_overlay', noOverlay)

    // 5. 清空再按 ↑，浮层里按 ↓ 应选中第2条，Esc 关闭
    await win.webContents.executeJavaScript(pressUp)
    for (let i = 0; i < 30; i++) {
      const o = await win.webContents.executeJavaScript(`!!document.getElementById('dsh-history-overlay')`)
      if (o) break
      await sleep(500)
    }
    await win.webContents.executeJavaScript(`(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true, cancelable: true, composed: true }));
      return 'down';
    })()`)
    await sleep(300)
    const selInfo = await win.webContents.executeJavaScript(`(() => {
      const o = document.getElementById('dsh-history-overlay');
      if (!o) return null;
      const rows = [...o.querySelectorAll('div')].filter(d => d.style && d.style.cursor === 'pointer');
      const selIdx = rows.findIndex(d => d.style.background === 'rgb(27, 37, 48)');
      return { selIdx };
    })()`)
    log('arrow_down_selection', selInfo)
    await win.webContents.executeJavaScript(`(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true, composed: true }));
      return 'esc';
    })()`)
    await sleep(300)
    const escClosed = await win.webContents.executeJavaScript(`!document.getElementById('dsh-history-overlay')`)
    log('esc_closed', escClosed)

    const failures = []
    const assert = (cond, msg) => {
      if (cond) console.log('  ✓', msg)
      else { failures.push(msg); console.log('  ✗ FAIL:', msg) }
    }
    assert(opened === true, '功能1：空输入框按 ↑ 弹出历史浮层')
    assert(overlayInfo && overlayInfo.rows >= 1, '功能1：浮层含历史提示词条目')
    assert(fill && fill.value && fill.value.length > 0 && fill.overlayGone === true, '功能1：Enter 回填第一条到输入框并关闭浮层')
    assert(noOverlay === false, '功能1：输入框有内容时 ↑ 不弹浮层（不干扰光标）')
    assert(selInfo && selInfo.selIdx === 1, '功能1：↓ 移动到第 2 条')
    assert(escClosed === true, '功能1：Esc 关闭浮层')

    console.log(failures.length === 0 ? '\nE2E_PASS' : '\nE2E_FAIL: ' + failures.join(' ; '))
    app.exit(failures.length === 0 ? 0 : 1)
  } catch (err) {
    console.log('PROBE_ERROR', String(err))
    app.exit(1)
  }
})
