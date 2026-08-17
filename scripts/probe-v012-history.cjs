// v0.1.3 功能1探针（重写）：↑ 终端式自动填充
// 断言：空框按 ↑ 填入最近提示词；未修改再按 ↑ 填更早一条；↓ 往回；到最新再 ↓ 清空；
//       用户自己打字时 ↑ 不覆盖；不出现选择浮层。
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
      backgroundColor: '#f5f7fa',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false },
    })
    win.webContents.setBackgroundThrottling(false)
    await win.loadURL('http://127.0.0.1:3099/')
    await sleep(14000)

    // 0. 打开一个会话（选最长滚动高度）
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

    // 1. 注入 HISTORY_SCRIPT（终端式自动填充版）
    await win.webContents.executeJavaScript(F.HISTORY_SCRIPT, true)
    await sleep(800)

    const setValue = (v) => `(() => {
      const ta = document.querySelector('textarea[data-phase]');
      if (!ta) return 'no-composer';
      const proto = HTMLTextAreaElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(ta, ${JSON.stringify(v)}); else ta.value = ${JSON.stringify(v)};
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      ta.setSelectionRange(0, 0);
      return 'ok';
    })()`

    const pressKey = (key) => `(() => {
      const ta = document.querySelector('textarea[data-phase]');
      if (!ta) return 'no-composer';
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', code: '${key}', bubbles: true, cancelable: true, composed: true }));
      return 'pressed';
    })()`

    const getValue = () => win.webContents.executeJavaScript(`(() => {
      const ta = document.querySelector('textarea[data-phase]');
      return ta ? ta.value : null;
    })()`)

    async function waitFill(timeoutMs = 20000) {
      for (let i = 0; i < Math.ceil(timeoutMs / 500); i++) {
        const v = await getValue()
        if (v !== null && v.trim() !== '') return v
        await sleep(500)
      }
      return null
    }

    // 2. 空输入框按 ↑ → 自动填入最近一条提示词
    await win.webContents.executeJavaScript(setValue(''))
    await win.webContents.executeJavaScript(pressKey('ArrowUp'))
    const v1 = await waitFill()
    const overlay1 = await win.webContents.executeJavaScript(`!!document.getElementById('dsh-history-overlay')`)
    log('first_fill', v1 ? v1.slice(0, 60) : null)
    log('no_overlay_after_up', overlay1 === false)

    // 3. 未修改再按 ↑ → 更早一条（用填充索引断言，文字重复也不误报）
    await win.webContents.executeJavaScript(pressKey('ArrowUp'))
    await sleep(1200)
    const v2 = await getValue()
    const diag1 = await win.webContents.executeJavaScript(`window.__dshHistoryDiag`)
    log('second_fill_diff', !!(v1 && v2 && v2 !== v1))
    log('diag_after_two_ups', diag1)

    // 4. ↓ 往回 → 回到最近一条
    await win.webContents.executeJavaScript(pressKey('ArrowDown'))
    await sleep(600)
    const v3 = await getValue()
    log('down_returns_latest', !!(v1 && v3 && v3 === v1))

    // 5. 在最新一条再按 ↓ → 清空
    await win.webContents.executeJavaScript(pressKey('ArrowDown'))
    await sleep(600)
    const v4 = await getValue()
    log('down_clears_at_latest', v4 === '' || v4 === null)

    // 6. 用户自己打字时按 ↑ → 不覆盖
    await win.webContents.executeJavaScript(setValue('这是我自己打的字'))
    await win.webContents.executeJavaScript(pressKey('ArrowUp'))
    await sleep(600)
    const v5 = await getValue()
    log('own_text_untouched', v5 === '这是我自己打的字')

    // 7. 清空后再按 ↑ → 重新从最近一条开始
    await win.webContents.executeJavaScript(setValue(''))
    await win.webContents.executeJavaScript(pressKey('ArrowUp'))
    const v6 = await waitFill()
    log('refill_after_clear', !!(v6 && v1 && v6 === v1))

    const diag2 = await win.webContents.executeJavaScript(`window.__dshHistoryDiag`)
    log('diag_final', diag2)

    const pc = diag1 && diag1.promptCount
    const failures = []
    const assert = (cond, msg) => {
      if (cond) console.log('  ✓', msg)
      else { failures.push(msg); console.log('  ✗ FAIL:', msg) }
    }
    assert(v1 && v1.trim().length > 0, '功能1：空输入框按 ↑ 自动填入最近提示词')
    assert(overlay1 === false, '功能1：不再出现选择浮层（直接自动填充）')
    if (pc && pc < 2) {
      console.log('  ~ SKIP: 该会话只有 1 条用户提示词，跳过"更早一条"断言')
    } else {
      assert(diag1 && diag1.lastIdx === 1 && diag1.filled === 2, '功能1：未修改再按 ↑ 填更早一条提示词（填充索引 0→1）')
    }
    assert(v3 === v1, '功能1：↓ 回到上一条（最近）')
    assert(v4 === '' || v4 === null, '功能1：在最近一条再按 ↓ 清空输入框')
    assert(v5 === '这是我自己打的字', '功能1：自己打字时 ↑ 不覆盖内容')
    assert(v6 === v1, '功能1：清空后再按 ↑ 重新从最近一条开始')

    console.log(failures.length === 0 ? '\nE2E_PASS' : '\nE2E_FAIL: ' + failures.join(' ; '))
    app.exit(failures.length === 0 ? 0 : 1)
  } catch (err) {
    console.log('PROBE_ERROR', String(err))
    app.exit(1)
  }
})
