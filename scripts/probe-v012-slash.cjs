// v0.1.3 斜杠菜单探针：/ 弹出命令菜单（浅色），点选/回车填入；
// /btw、/checkpoint 成功后有"已保存"提示；/rewind 选择框为浅色；未知命令记日志。
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')

const FP = require(path.join(__dirname, '..', 'dist-electron', 'featuresPage.js'))
const records = []
const results = {}
function log(k, v) { results[k] = v; console.log('RESULT', k, JSON.stringify(v)) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  try {
    ipcMain.handle('probe:record', (_e, payload) => { records.push(payload); return { ok: true } })
    const win = new BrowserWindow({
      width: 1440, height: 900, show: false,
      backgroundColor: '#f5f7fa',
      webPreferences: {
        contextIsolation: true, nodeIntegration: false, sandbox: false,
        preload: path.join(__dirname, 'probe-v012-preload.cjs'),
      },
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

    // 1. 注入脚本：斜杠菜单必须先于 BTW/REWIND
    await win.webContents.executeJavaScript(FP.SLASH_MENU_SCRIPT, true)
    await win.webContents.executeJavaScript(FP.BTW_SCRIPT, true)
    await win.webContents.executeJavaScript(FP.REWIND_SCRIPT, true)
    await sleep(800)

    const setValue = (v) => `(() => {
      const ta = document.querySelector('textarea[data-phase]');
      if (!ta) return 'no-composer';
      const proto = HTMLTextAreaElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(ta, ${JSON.stringify(v)}); else ta.value = ${JSON.stringify(v)};
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
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

    // 2. 输入 "/" → 菜单弹出，浅色，3 条命令
    await win.webContents.executeJavaScript(setValue('/'))
    await sleep(600)
    const menuInfo = await win.webContents.executeJavaScript(`(() => {
      const m = document.getElementById('dsh-slash-menu');
      if (!m) return null;
      const rows = [...m.children].filter(c => c.tagName === 'DIV');
      return { rows: rows.length, bg: getComputedStyle(m).backgroundColor, text: m.textContent };
    })()`)
    log('menu_open_on_slash', menuInfo)

    // 3. 菜单内 ↓/↑ 移动选择
    await win.webContents.executeJavaScript(pressKey('ArrowDown'))
    await sleep(300)
    const selInfo1 = await win.webContents.executeJavaScript(`(() => {
      const m = document.getElementById('dsh-slash-menu');
      if (!m) return null;
      const rows = [...m.children].filter(c => c.tagName === 'DIV');
      return rows.findIndex(d => d.style.background === 'rgb(238, 243, 250)');
    })()`)
    await win.webContents.executeJavaScript(pressKey('ArrowUp'))
    await sleep(300)
    const selInfo2 = await win.webContents.executeJavaScript(`(() => {
      const m = document.getElementById('dsh-slash-menu');
      if (!m) return null;
      const rows = [...m.children].filter(c => c.tagName === 'DIV');
      return rows.findIndex(d => d.style.background === 'rgb(238, 243, 250)');
    })()`)
    log('menu_keynav', { down: selInfo1, upBack: selInfo2 })

    // 4. "/re" → 过滤只剩 /rewind；Enter → 自动填入完整命令
    await win.webContents.executeJavaScript(setValue('/re'))
    await sleep(500)
    const filtered = await win.webContents.executeJavaScript(`(() => {
      const m = document.getElementById('dsh-slash-menu');
      if (!m) return null;
      return [...m.children].filter(c => c.tagName === 'DIV').length;
    })()`)
    await win.webContents.executeJavaScript(pressKey('Enter'))
    await sleep(500)
    const vAfterFill = await getValue()
    const menuGone1 = await win.webContents.executeJavaScript(`!document.getElementById('dsh-slash-menu')`)
    log('filter_and_enter_fill', { filtered, vAfterFill, menuGone1 })

    // 5. /btw 内容 + Enter → 旁注已保存提示（浅色 toast），输入框清空
    await win.webContents.executeJavaScript(setValue('/btw 测试旁注123'))
    await win.webContents.executeJavaScript(pressKey('Enter'))
    await sleep(800)
    const btwState = await win.webContents.executeJavaScript(`(() => {
      const ta = document.querySelector('textarea[data-phase]');
      const t = document.getElementById('dsh-feature-toast');
      return { cleared: ta ? ta.value === '' : false, toast: t ? t.textContent : null, toastBg: t ? getComputedStyle(t).backgroundColor : null };
    })()`)
    log('btw_toast_and_clear', btwState)

    // 6. /checkpoint 名字 + Enter → 检查点已保存提示
    await win.webContents.executeJavaScript(setValue('/checkpoint 检查A'))
    await win.webContents.executeJavaScript(pressKey('Enter'))
    await sleep(800)
    const ckState = await win.webContents.executeJavaScript(`(() => {
      const t = document.getElementById('dsh-feature-toast');
      return { toast: t ? t.textContent : null, toastBg: t ? getComputedStyle(t).backgroundColor : null };
    })()`)
    log('checkpoint_toast', ckState)

    // 7. /rewind + Enter → 回退选择框出现且为浅色
    await win.webContents.executeJavaScript(setValue('/rewind'))
    await sleep(500)
    await win.webContents.executeJavaScript(pressKey('Enter'))
    let rewindOpen = false
    for (let i = 0; i < 40; i++) {
      rewindOpen = await win.webContents.executeJavaScript(`!!document.getElementById('dsh-rewind-overlay')`)
      if (rewindOpen) break
      await sleep(500)
    }
    const rewindInfo = await win.webContents.executeJavaScript(`(() => {
      const o = document.getElementById('dsh-rewind-overlay');
      if (!o) return null;
      return { bg: getComputedStyle(o).backgroundColor, color: getComputedStyle(o).color };
    })()`)
    log('rewind_picker_light', { rewindOpen, rewindInfo })
    // 关掉选择框（Esc）
    await win.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true, composed: true }))`)
    await sleep(300)

    // 8. 未知命令 /xyz + Enter → 消息正常发，但记录 unknown 日志
    await win.webContents.executeJavaScript(setValue('/xyz'))
    await win.webContents.executeJavaScript(pressKey('Enter'))
    await sleep(800)
    const diag = await win.webContents.executeJavaScript(`window.__dshSlashDiag`)

    const btwCalls = records.filter(r => r.kind === 'btwNote')
    const ckCalls = records.filter(r => r.kind === 'checkpointSave')
    const diagMsgs = records.filter(r => r.kind === 'diagLog').map(r => r.msg)
    const unknownLogged = diagMsgs.some(m => typeof m === 'string' && m.indexOf('slash: unknown command') === 0)
    const installedLogged = diagMsgs.some(m => typeof m === 'string' && m.indexOf('slash: installed') === 0)
    log('ipc_records', { btw: btwCalls.length, btwNote: btwCalls[0] && btwCalls[0].note, ck: ckCalls.length, ckInput: ckCalls[0] && ckCalls[0].input, unknownLogged, installedLogged })
    log('slash_diag_final', diag)

    const failures = []
    const assert = (cond, msg) => {
      if (cond) console.log('  ✓', msg)
      else { failures.push(msg); console.log('  ✗ FAIL:', msg) }
    }
    assert(menuInfo && menuInfo.rows === 3, '斜杠菜单：输入 / 弹出 3 条命令')
    assert(menuInfo && menuInfo.bg === 'rgb(255, 255, 255)', '斜杠菜单：浅色背景')
    assert(selInfo1 === 1 && selInfo2 === 0, '斜杠菜单：↓/↑ 移动选择')
    assert(filtered === 1, '斜杠菜单：/re 过滤只剩 /rewind')
    assert(vAfterFill === '/rewind' && menuGone1 === true, '斜杠菜单：Enter 自动填入完整命令并关闭菜单')
    assert(btwState && btwState.cleared === true && btwState.toast && btwState.toast.indexOf('已保存') !== -1 && btwState.toastBg === 'rgb(255, 255, 255)', '/btw：成功后浅色"已保存"提示 + 输入框清空')
    assert(btwCalls.length >= 1 && btwCalls[0].note === '测试旁注123', '/btw：旁注内容正确送达存储')
    assert(ckState && ckState.toast && ckState.toast.indexOf('已保存') !== -1, '/checkpoint：成功后"已保存"提示')
    assert(ckCalls.length >= 1 && ckCalls[0].input && ckCalls[0].input.name === '检查A', '/checkpoint：检查点名字正确送达')
    assert(rewindOpen === true && rewindInfo && rewindInfo.bg === 'rgb(255, 255, 255)', '/rewind：回退选择框为浅色')
    assert(unknownLogged === true, '未知斜杠命令：记入日志')
    assert(installedLogged === true, '自检：slash installed 写入日志')
    assert(diag && diag.shown >= 2, '斜杠菜单：菜单显示次数计数正常')

    console.log(failures.length === 0 ? '\nE2E_PASS' : '\nE2E_FAIL: ' + failures.join(' ; '))
    app.exit(failures.length === 0 ? 0 : 1)
  } catch (err) {
    console.log('PROBE_ERROR', String(err))
    app.exit(1)
  }
})
