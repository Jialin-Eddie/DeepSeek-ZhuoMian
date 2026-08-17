// v0.1.1 页面脚本端到端探针（不触碰用户正在运行的 app）：
// 用独立 Electron 进程打开官方 UI（3099），注入新版 BTW/REWIND/CLEAR/RAIL 脚本，
// 模拟输入与回车，验证拦截、清空、浮层、fork 请求构造；fork 用 fetch 桩拦截，不产生副作用。
// 用法：npx electron scripts/probe-v011.cjs
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const F = require(path.join(__dirname, '..', 'dist-electron', 'featuresPage.js'))
const P = require(path.join(__dirname, '..', 'dist-electron', 'stashPage.js'))

const calls = []
ipcMain.handle('probe:record', (_e, payload) => {
  calls.push(payload)
  return { ok: true }
})

const OUT = process.env.PROBE_OUT || path.join(__dirname, '..', 'probe-v011-out')

const results = {}
function log(k, v) {
  results[k] = v
  console.log('RESULT', k, JSON.stringify(v))
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(OUT, { recursive: true })
    const win = new BrowserWindow({
      width: 1440,
      height: 900,
      show: false,
      backgroundColor: '#0f1115',
      webPreferences: {
        preload: path.join(__dirname, 'probe-v011-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })
    win.webContents.setBackgroundThrottling(false)

    await win.loadURL('http://127.0.0.1:3099/')
    await sleep(12000)

    // 0. 打开一个会话（点标题 'App开发新功能实现方法'，与 probe-flow 同法）
    const opened = await win.webContents.executeJavaScript(`(() => {
      const titles = ['App开发新功能实现方法'];
      for (const t of titles) {
        const els = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() === t);
        for (const el of els) {
          let n = el;
          for (let depth = 0; n && depth < 4; depth++, n = n.parentElement) {
            if (n.onclick || n.getAttribute('role') === 'treeitem' || n.tagName === 'BUTTON') { n.click(); return 'clicked:' + t; }
          }
        }
      }
      return 'no-session';
    })()`)
    log('openSession', opened)
    await sleep(6000)

    // 1. 环境检查：composer 存在性 / dshDesktop 桩
    const env = await win.webContents.executeJavaScript(`(() => {
      const byPhase = document.querySelector('textarea[data-phase]');
      const areas = document.querySelectorAll('textarea');
      return {
        composerByPhase: !!byPhase,
        textareaCount: areas.length,
        dshDesktop: !!(window.dshDesktop && window.dshDesktop.btwNote),
        railPresent: !!document.getElementById('dsh-prompt-rail'),
        userMsgCount: document.querySelectorAll('div[data-chat-flow-kind="user"]').length,
      };
    })()`)
    log('env', env)

    // 2. 注入 RAIL 并验证
    await win.webContents.executeJavaScript(F.RAIL_SCRIPT, true)
    await sleep(1200)
    const rail = await win.webContents.executeJavaScript(`(() => {
      const r = document.getElementById('dsh-prompt-rail');
      if (!r) return { built: false };
      const cs = getComputedStyle(r);
      return { built: true, children: r.children.length, maxHeight: cs.maxHeight, overflowY: cs.overflowY, lineH: r.children[0] ? getComputedStyle(r.children[0]).height : null };
    })()`)
    log('rail', rail)

    // 3. 安装 fetch 桩：拦截 session.fork（记录请求，返回假 childId），其余放行
    await win.webContents.executeJavaScript(`(() => {
      if (window.__probeFork) return;
      window.__probeFork = [];
      const realFetch = window.fetch.bind(window);
      window.fetch = function (u, o) {
        const s = String(u);
        if (s.indexOf('session.fork') !== -1) {
          try { window.__probeFork.push(JSON.parse(o.body)); } catch (e) {}
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ result: { ok: true, value: { sessionId: 'session-probe-child' } } }) });
        }
        return realFetch(u, o);
      };
    })()`)

    // 4. 注入 BTW / REWIND / CLEAR
    await win.webContents.executeJavaScript(F.BTW_SCRIPT, true)
    await win.webContents.executeJavaScript(F.REWIND_SCRIPT, true)

    // 辅助：设置输入框值并回车
    const helper = `(v) => {
      const ta = document.querySelector('textarea[data-phase]') || document.activeElement;
      if (!ta) return 'no-composer';
      const proto = HTMLTextAreaElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(ta, v); else ta.value = v;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, composed: true }));
      return 'entered';
    }`

    // 5. /btw 正常内容
    calls.length = 0
    await win.webContents.executeJavaScript(`(${helper})('/btw 测试旁注内容')`)
    await sleep(800)
    const btwOk = await win.webContents.executeJavaScript(`(() => {
      const ta = document.querySelector('textarea[data-phase]');
      return { value: ta ? ta.value : null };
    })()`)
    log('btw_normal', {
      valueAfter: btwOk.value,
      calls: calls.filter((c) => c.kind === 'btwNote'),
      otherCalls: calls.map((c) => c.kind),
    })

    // 6. /btw 空内容 → 应出现本地 toast 提示
    calls.length = 0
    await win.webContents.executeJavaScript(`(${helper})('/btw')`)
    await sleep(800)
    const btwEmpty = await win.webContents.executeJavaScript(`(() => {
      const t = document.getElementById('dsh-feature-toast');
      return { toastText: t ? t.textContent : null };
    })()`)
    log('btw_empty', { toastText: btwEmpty.toastText, btwCalls: calls.filter((c) => c.kind === 'btwNote').length })

    // 7. 全角斜杠 ／btw
    calls.length = 0
    await win.webContents.executeJavaScript(`(${helper})('／btw 全角旁注')`)
    await sleep(800)
    log('btw_fullwidth', {
      btwCalls: calls.filter((c) => c.kind === 'btwNote'),
    })

    // 8. CLEAR_SCRIPT：设置值 → 执行清除 → 应为空
    try {
      await win.webContents.executeJavaScript(`(() => {
        const ta = document.querySelector('textarea[data-phase]');
        const proto = HTMLTextAreaElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(ta, '要清除的内容'); else ta.value = '要清除的内容';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.focus();
        return 'set';
      })()`)
      log('clear_set', 'ok')
    } catch (e) {
      log('clear_set', 'ERR: ' + String(e))
    }
    try {
      const cleared = await win.webContents.executeJavaScript(P.CLEAR_SCRIPT, true)
      const clearVal = await win.webContents.executeJavaScript(`(() => { const ta = document.querySelector('textarea[data-phase]'); return { value: ta ? ta.value : null }; })()`)
      log('clear_script', { cleared, valueAfter: clearVal.value })
    } catch (e) {
      log('clear_script', 'ERR: ' + String(e))
    }

    // 9. /rewind 打开浮层
    calls.length = 0
    await win.webContents.executeJavaScript(`(${helper})('/rewind')`)
    await sleep(2500)
    const rewindOpen = await win.webContents.executeJavaScript(`(() => {
      const o = document.getElementById('dsh-rewind-overlay');
      if (!o) return { opened: false };
      const rows = o.querySelectorAll('div[style*="cursor: pointer"]').length;
      return { opened: true, hasRows: rows };
    })()`)
    log('rewind_open', rewindOpen)

    // 10. 选择第一条 → fork 请求应被桩捕获（sessionId + atSeq）
    const forkResult = await win.webContents.executeJavaScript(`(() => {
      const o = document.getElementById('dsh-rewind-overlay');
      if (!o) return 'no-overlay';
      const rows = [...o.querySelectorAll('div')].filter(d => d.style && d.style.cursor === 'pointer');
      if (rows.length === 0) return 'no-rows';
      rows[0].click();
      return 'clicked-first';
    })()`)
    await sleep(4500)
    const forks = await win.webContents.executeJavaScript(`window.__probeFork`)
    log('rewind_fork', { click: forkResult, forks })

    // 11. /checkpoint 名字 → 桩应收到 checkpointSave
    calls.length = 0
    await win.webContents.executeJavaScript(`(${helper})('/checkpoint 进度测试')`)
    await sleep(800)
    log('checkpoint_save', calls.filter((c) => c.kind === 'checkpointSave'))

    // 12. /rewind 3 → 直接回退第 3 条（fork 桩记录）
    await win.webContents.executeJavaScript(`(() => { window.__probeFork.length = 0; return true; })()`)
    await win.webContents.executeJavaScript(`(${helper})('/rewind 3')`)
    await sleep(2500)
    const forks2 = await win.webContents.executeJavaScript(`window.__probeFork`)
    log('rewind_n', forks2)

    fs.writeFileSync(path.join(OUT, 'probe-results.json'), JSON.stringify(results, null, 2))
    console.log('DONE')
  } catch (err) {
    console.log('PROBE_ERROR', String(err))
    fs.writeFileSync(path.join(OUT, 'probe-results.json'), JSON.stringify({ error: String(err) }, null, 2))
  }
  app.quit()
})
