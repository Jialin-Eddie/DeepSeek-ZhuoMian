// v0.1.2 功能3探针：响应结束后滚动到「本次提示词」在屏幕中间
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const F = require(path.join(__dirname, '..', 'dist-electron', 'featuresV012.js'))

const results = {}
function log(k, v) {
  results[k] = v
  console.log('RESULT', k, JSON.stringify(v))
}
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

    // 0. 打开一个【满足滚动验证条件】的会话：
    //    滚到底部后，最后一条 user 节点的 ratioTop 必须明显 < 0.5
    //    （若它已贴近底部，滚到 40% 的 scrollTop 会超过上限被 clamp，无法验证——短会话误报）
    const ensure = await win.webContents.executeJavaScript(`(async () => {
      const tryOpen = async (row) => { row.click(); await new Promise(r => setTimeout(r, 1200)); };
      for (const proj of [...document.querySelectorAll('[role="treeitem"]')].filter(r => (r.className || '').toString().indexOf('projectRow') !== -1)) {
        const chev = proj.querySelector('[class*="chevron"]');
        if (chev) { try { chev.click(); } catch (e) {} }
      }
      await new Promise(r => setTimeout(r, 1000));
      let best = null;
      const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(r => (r.className || '').toString().indexOf('sessionRow') !== -1);
      for (const row of rows.slice(0, 15)) {
        await tryOpen(row);
        const sc = document.querySelector('[data-conversation-scroll]');
        if (!sc) continue;
        const h = sc.scrollHeight, ch = sc.clientHeight;
        // 滚到底部，看最后一条 user 的位置
        sc.scrollTop = h;
        await new Promise(r => setTimeout(r, 300));
        const users = document.querySelectorAll('div[data-chat-flow-kind="user"]');
        let ratioTop = 1;
        if (users.length > 0) {
          const last = users[users.length - 1];
          const sRect = sc.getBoundingClientRect();
          const nRect = last.getBoundingClientRect();
          ratioTop = (nRect.top - sRect.top) / sRect.height;
        }
        const room = h - ch;
        const score = (ratioTop < 0.5 ? 1000000 : 0) + room;
        if (!best || score > best.score) best = { row, room, ratioTop, score, text: (row.innerText || '').slice(0, 40) };
      }
      // 重新打开满足条件的那个（最后一条 user 偏上，有滚动空间）
      if (best && best.row) { best.row.click(); await new Promise(r => setTimeout(r, 2500)); }
      const sc = document.querySelector('[data-conversation-scroll]');
      let ratioTopFinal = 1;
      if (sc) {
        sc.scrollTop = sc.scrollHeight;
        await new Promise(r => setTimeout(r, 400));
        const users = document.querySelectorAll('div[data-chat-flow-kind="user"]');
        if (users.length > 0) {
          const sRect = sc.getBoundingClientRect();
          const nRect = users[users.length - 1].getBoundingClientRect();
          ratioTopFinal = (nRect.top - sRect.top) / sRect.height;
        }
      }
      return {
        rowsFound: rows.length, bestText: best ? best.text : null, bestRoom: best ? best.room : 0,
        bestRatioTop: best ? +best.ratioTop.toFixed(3) : null,
        openedH: sc ? sc.scrollHeight : 0, openedRoom: sc ? sc.scrollHeight - sc.clientHeight : 0,
        finalRatioTop: +ratioTopFinal.toFixed(3),
      };
    })()`)
    log('ensure_session', ensure)

    const env = await win.webContents.executeJavaScript(`(() => {
      const sc = document.querySelector('[data-conversation-scroll]');
      return {
        hasScroll: !!sc,
        userCount: document.querySelectorAll('div[data-chat-flow-kind="user"]').length,
        turnTailCount: document.querySelectorAll('div[data-chat-flow-kind="turn-tail"]').length,
        sh: sc ? sc.scrollHeight : 0, ch: sc ? sc.clientHeight : 0,
      };
    })()`)
    log('env', env)

    await win.webContents.executeJavaScript(F.SCROLL_SCRIPT, true)
    await sleep(800)

    // 1.5 等历史加载稳定：user 节点数连续两次相同才继续（避免加载中节点位置漂移）
    let lastCount = -1
    let stableRounds = 0
    for (let i = 0; i < 30; i++) {
      const c = await win.webContents.executeJavaScript(`document.querySelectorAll('div[data-chat-flow-kind="user"]').length`)
      if (c === lastCount) stableRounds++
      else { lastCount = c; stableRounds = 0 }
      if (stableRounds >= 2) break
      await sleep(800)
    }
    log('history_stable_users', lastCount)

    // 滚动到底部（模拟看完响应）
    await win.webContents.executeJavaScript(`(() => {
      const sc = document.querySelector('[data-conversation-scroll]');
      if (!sc) return 'no-scroll';
      sc.scrollTop = sc.scrollHeight;
      return 'scrolled-bottom';
    })()`)
    await sleep(600)
    const before = await win.webContents.executeJavaScript(`(() => {
      const sc = document.querySelector('[data-conversation-scroll]');
      return sc ? { scrollTop: Math.round(sc.scrollTop), sh: sc.scrollHeight, ch: sc.clientHeight } : null;
    })()`)
    log('before_signal', before)

    // 模拟每轮结束：插入 turn-tail 节点
    try {
      await win.webContents.executeJavaScript(`(() => {
        const tail = document.createElement('div');
        tail.setAttribute('data-chat-flow-kind', 'turn-tail');
        tail.setAttribute('data-chat-flow-key', 'probe:turn-tail');
        tail.textContent = 'probe tail';
        Object.assign(tail.style, { height: '1px' });
        document.body.appendChild(tail);
        return 'inserted';
      })()`)
    } catch (e) {
      log('insert_tail_ERR', String(e))
    }
    await sleep(1800)
    const diag1 = await win.webContents.executeJavaScript(`window.__dshScrollDiag`)
    log('diag_after_signal', diag1)

    const after = await win.webContents.executeJavaScript(`(() => {
      const sc = document.querySelector('[data-conversation-scroll]');
      if (!sc) return null;
      const users = document.querySelectorAll('div[data-chat-flow-kind="user"]');
      if (users.length === 0) return { noUsers: true };
      const last = users[users.length - 1];
      const sRect = sc.getBoundingClientRect();
      const nRect = last.getBoundingClientRect();
      const relTop = nRect.top - sRect.top;
      const ratioTop = relTop / sRect.height;
      const ratioBot = (nRect.bottom - sRect.top) / sRect.height;
      return {
        scrollTop: Math.round(sc.scrollTop),
        sh: sc.scrollHeight, ch: sc.clientHeight,
        lastUserText: (last.innerText || '').slice(0, 40),
        ratioTop: +ratioTop.toFixed(3),
        ratioBot: +ratioBot.toFixed(3),
        centered: ratioTop >= 0.25 && ratioBot <= 0.65,
      };
    })()`)
    log('after_signal', after)

    // 防打扰：用户滚动到顶部后，立刻插 turn-tail，不应被抢
    try {
      await win.webContents.executeJavaScript(`(() => {
        const sc = document.querySelector('[data-conversation-scroll]');
        sc.scrollTop = 0;
        window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true }));
        return 'scrolled-top';
      })()`)
      await sleep(300)
      await win.webContents.executeJavaScript(`(() => {
        const tail = document.createElement('div');
        tail.setAttribute('data-chat-flow-kind', 'turn-tail');
        tail.setAttribute('data-chat-flow-key', 'probe:turn-tail-2');
        tail.textContent = 'probe tail 2';
        document.body.appendChild(tail);
        return 'inserted2';
      })()`)
      await sleep(500)
    } catch (e) {
      log('disturb_ERR', String(e))
    }
    const disturb = await win.webContents.executeJavaScript(`(() => {
      const sc = document.querySelector('[data-conversation-scroll]');
      return { scrollTop: Math.round(sc.scrollTop) };
    })()`)
    log('user_scroll_guard', disturb)

    const failures = []
    const assert = (cond, msg) => {
      if (cond) console.log('  ✓', msg)
      else { failures.push(msg); console.log('  ✗ FAIL:', msg) }
    }
    assert(env && env.hasScroll === true && env.userCount >= 1, '环境：滚动容器存在且有 user 消息')
    assert(ensure && ensure.finalRatioTop !== null && ensure.finalRatioTop < 0.5, '前置：滚到底后最后一条提示词偏上（有滚动空间，避免短会话误报）')
    assert(before && before.scrollTop > before.ch * 0.8, '前置：容器已滚到底部（模拟看完响应）')
    assert(after && after.centered === true, '功能3：turn-tail 信号后最后一条提示词滚动到视口中间')
    assert(after && after.ratioTop >= 0.25 && after.ratioTop <= 0.45, '功能3：提示词停在偏上位置（40%附近，给回复留空间）')
    assert(disturb && disturb.scrollTop <= 50, '防打扰：用户主动滚动后不抢滚动')

    console.log(failures.length === 0 ? '\nE2E_PASS' : '\nE2E_FAIL: ' + failures.join(' ; '))
    app.exit(failures.length === 0 ? 0 : 1)
  } catch (err) {
    console.log('PROBE_ERROR', String(err))
    app.exit(1)
  }
})
