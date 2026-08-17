// v0.1.2 功能4探针：右下角通知气泡（turn-tail 信号 → 弹通知 → 点击跳转 → 3s 消失 → 堆叠）
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

    // 注入 NOTIFY_SCRIPT
    await win.webContents.executeJavaScript(F.NOTIFY_SCRIPT, true)
    await sleep(600)

    // 1. 模拟一轮结束：插入 turn-tail → 应弹出通知
    await win.webContents.executeJavaScript(`(() => {
      const tail = document.createElement('div');
      tail.setAttribute('data-chat-flow-kind', 'turn-tail');
      tail.setAttribute('data-chat-flow-key', 'probe:notify-1');
      tail.textContent = 'probe notify 1';
      document.body.appendChild(tail);
      return 'inserted';
    })()`)
    await sleep(800)
    const shown1 = await win.webContents.executeJavaScript(`(() => {
      const b = document.getElementById('dsh-notify-box');
      if (!b) return { shown: false };
      return { shown: true, count: b.children.length, firstText: b.children[0] ? b.children[0].textContent.slice(0, 60) : null };
    })()`)
    log('notify_shown', shown1)
    const diag = await win.webContents.executeJavaScript(`window.__dshNotifyDiag`)
    log('diag', diag)

    // 2. 第二条 turn-tail（不同 key）→ 堆叠第二条
    await win.webContents.executeJavaScript(`(() => {
      const tail = document.createElement('div');
      tail.setAttribute('data-chat-flow-kind', 'turn-tail');
      tail.setAttribute('data-chat-flow-key', 'probe:notify-2');
      tail.textContent = 'probe notify 2';
      document.body.appendChild(tail);
      return 'inserted2';
    })()`)
    await sleep(800)
    const stacked = await win.webContents.executeJavaScript(`(() => {
      const b = document.getElementById('dsh-notify-box');
      return b ? b.children.length : 0;
    })()`)
    log('notify_stacked', stacked)

    // 3. 点击第一条通知 → 应跳转（滚动到最后一条 user）+ 该条消失
    //    先确认滚动位置，滚动到顶部，再点通知
    await win.webContents.executeJavaScript(`(() => {
      const sc = document.querySelector('[data-conversation-scroll]');
      sc.scrollTop = 0;
      return 'scrolled-top';
    })()`)
    await sleep(300)
    await win.webContents.executeJavaScript(`(() => {
      const b = document.getElementById('dsh-notify-box');
      if (!b || b.children.length === 0) return 'no-notify';
      b.children[b.children.length - 1].click();
      return 'clicked';
    })()`)
    await sleep(600)
    const afterClick = await win.webContents.executeJavaScript(`(() => {
      const sc = document.querySelector('[data-conversation-scroll]');
      return { scrollTop: Math.round(sc.scrollTop), diag: window.__dshNotifyDiag };
    })()`)
    log('after_click', afterClick)

    // 4. 3 秒后通知自动消失
    await sleep(3200)
    const after3s = await win.webContents.executeJavaScript(`(() => {
      const b = document.getElementById('dsh-notify-box');
      return { count: b ? b.children.length : 0 };
    })()`)
    log('after_3s', after3s)

    const failures = []
    const assert = (cond, msg) => {
      if (cond) console.log('  ✓', msg)
      else { failures.push(msg); console.log('  ✗ FAIL:', msg) }
    }
    assert(shown1 && shown1.shown === true && shown1.count === 1, '功能4：turn-tail 信号后右下角弹通知')
    assert(stacked === 2, '功能4：第二条通知堆叠显示')
    assert(afterClick && afterClick.scrollTop > 100 && afterClick.diag.clicked === 1, '功能4：点击通知跳转到提示词位置')
    assert(after3s && after3s.count === 0, '功能4：3 秒后通知自动消失')

    console.log(failures.length === 0 ? '\nE2E_PASS' : '\nE2E_FAIL: ' + failures.join(' ; '))
    app.exit(failures.length === 0 ? 0 : 1)
  } catch (err) {
    console.log('PROBE_ERROR', String(err))
    app.exit(1)
  }
})
