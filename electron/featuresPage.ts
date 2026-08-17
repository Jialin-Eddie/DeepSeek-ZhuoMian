/**
 * 注入官方页面（page world）的功能脚本：
 * - RAIL_SCRIPT    右边的 prompt 轨道（悬停预览 + 点击跳转），基于官方
 *                   `div[data-chat-flow-kind="user"]` 标记，随消息流自动刷新
 * - BTW_SCRIPT     /btw 旁注：composer 里输入 `/btw xxx` + Enter → 拦截并存入
 *                  本机旁注文件，不发给模型、不打断任务
 * - REWIND_SCRIPT  /rewind /checkpoint：用引擎真实 API（session.fork atSeq）
 *                  从任意提示词轮次之后开新分支并自动切换；检查点存本机
 *
 * 全部走 executeJavaScript，不碰官方 UI 资产。
 */

/**
 * 通用页面内小工具（toast / diag / composer 定位 / 赋值），
 * 供 BTW_SCRIPT 与 REWIND_SCRIPT 复用（各自独立注入，互不依赖）。
 */
const PAGE_UTILS = `{
  diag: function (msg) {
    try { if (window.dshDesktop && window.dshDesktop.diagLog) window.dshDesktop.diagLog(msg); } catch (e) {}
  },
  toast: function (msg) {
    var old = document.getElementById('dsh-feature-toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.id = 'dsh-feature-toast';
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)',
      zIndex: '2147483647', background: '#1b222c', color: '#e6e9ed',
      border: '1px solid #2a3542', borderRadius: '8px', padding: '8px 14px',
      fontSize: '13px', boxShadow: '0 4px 16px rgba(0,0,0,.4)',
      fontFamily: '-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
      maxWidth: '70vw', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
    });
    document.body.appendChild(t);
    setTimeout(function () { var el = document.getElementById('dsh-feature-toast'); if (el) el.remove(); }, 2400);
  },
  findComposer: function () {
    var byPhase = document.querySelector('textarea[data-phase]');
    if (byPhase) return byPhase;
    var areas = Array.prototype.slice.call(document.querySelectorAll('textarea'));
    var visible = areas.filter(function (a) { return a.getClientRects().length > 0; });
    var pool = visible.length > 0 ? visible : areas;
    if (pool.length === 0) return null;
    pool.sort(function (a, b) {
      return b.getBoundingClientRect().width * b.getBoundingClientRect().height
           - a.getBoundingClientRect().width * a.getBoundingClientRect().height;
    });
    return pool[0];
  },
  setComposerValue: function (ta, v) {
    var proto = HTMLTextAreaElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(ta, v); else ta.value = v;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
}`

/** prompt 轨道：右侧竖条，每条横线 = 一条用户提示词（多轮时自动滚动适应） */
export const RAIL_SCRIPT = `(function () {
  if (window.__dshRailInstalled) return;
  window.__dshRailInstalled = true;
  var RAIL_ID = 'dsh-prompt-rail';
  var TIP_ID = 'dsh-prompt-rail-tip';

  function sig() {
    var items = document.querySelectorAll('div[data-chat-flow-kind]');
    if (items.length === 0) return '';
    var first = items[0].getAttribute('data-chat-flow-key') || '';
    var last = items[items.length - 1].getAttribute('data-chat-flow-key') || '';
    return items.length + ':' + first + ':' + last;
  }

  function positionTip(line) {
    var t = document.getElementById(TIP_ID);
    if (!t) return;
    var r = line.getBoundingClientRect();
    t.style.top = Math.max(8, Math.min(window.innerHeight - 60, r.top + r.height / 2 - 20)) + 'px';
  }

  function build() {
    var old = document.getElementById(RAIL_ID);
    if (old) old.remove();
    var oldTip = document.getElementById(TIP_ID);
    if (oldTip) oldTip.remove();
    var items = Array.prototype.slice.call(document.querySelectorAll('div[data-chat-flow-kind="user"]'));
    if (items.length === 0) return;

    var rail = document.createElement('div');
    rail.id = RAIL_ID;
    Object.assign(rail.style, {
      position: 'fixed', right: '10px', top: '50%', transform: 'translateY(-50%)',
      zIndex: '2147483646', display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: '7px', padding: '10px 6px', background: 'rgba(15,17,21,.55)',
      border: '1px solid #2a3542', borderRadius: '10px',
      boxShadow: '0 4px 16px rgba(0,0,0,.3)',
      maxHeight: '78vh', overflowY: 'auto'
    });
    var tip = document.createElement('div');
    tip.id = TIP_ID;
    Object.assign(tip.style, {
      position: 'fixed', right: '48px', maxWidth: '340px', maxHeight: '160px', overflow: 'auto',
      background: '#1b222c', color: '#e6e9ed', border: '1px solid #2a3542',
      borderRadius: '8px', padding: '8px 10px', fontSize: '12px', lineHeight: '18px',
      boxShadow: '0 4px 16px rgba(0,0,0,.4)', display: 'none',
      whiteSpace: 'pre-wrap', wordBreak: 'break-word', zIndex: '2147483647'
    });
    document.body.appendChild(tip);

    items.forEach(function (item, idx) {
      var textEl = item.querySelector('.gdEzaW_bubble ._text_1pfhk_1');
      var text = (textEl ? textEl.textContent : item.textContent || '').trim();
      var len = Math.min(28, 6 + Math.round(text.length / 8));
      var line = document.createElement('button');
      Object.assign(line.style, {
        width: len + 'px', height: '7px', border: 'none', borderRadius: '3px',
        background: idx === items.length - 1 ? '#679efe' : '#3a4452',
        cursor: 'pointer', padding: '0', flex: '0 0 auto'
      });
      line.setAttribute('aria-label', '跳转到提示词 ' + (idx + 1));
      line.onmouseenter = function () { tip.textContent = text; tip.style.display = 'block'; positionTip(line); };
      line.onmouseleave = function () { tip.style.display = 'none'; };
      line.onclick = function () { item.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      rail.appendChild(line);
    });
    document.body.appendChild(rail);
  }

  build();
  var lastSig = sig();
  var timer = null;
  var mo = new MutationObserver(function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var s = sig();
      if (s !== lastSig) { lastSig = s; build(); }
    }, 400);
  });
  mo.observe(document.body, { childList: true, subtree: true });
})()`

/** /btw 旁注：window capture 阶段拦截 composer 的 Enter，把内容存旁注而非发送 */
export const BTW_SCRIPT = `(function () {
  if (window.__dshBtwInstalled) return;
  window.__dshBtwInstalled = true;
  var U = ${PAGE_UTILS};

  function onKey(e) {
    if (e.isComposing) return;
    if (e.key !== 'Enter' || e.shiftKey) return;
    var ta = document.activeElement && document.activeElement.tagName === 'TEXTAREA' ? document.activeElement : U.findComposer();
    if (!ta || document.activeElement !== ta) return;
    var v = ta.value || '';
    var m = v.trim().match(/^[/\\uFF0F]btw\\s*([\\s\\S]*)$/);
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var note = (m[1] || '').trim();
    if (!note) {
      U.diag('btw: empty note');
      U.toast('旁注内容为空：/btw 后写内容，例如 /btw 记得下午开会');
      U.setComposerValue(ta, '');
      return;
    }
    if (window.dshDesktop && window.dshDesktop.btwNote) {
      U.diag('btw: match noteLen=' + note.length);
      window.dshDesktop.btwNote(note).then(function (r) {
        U.diag('btw: ipc ok=' + !!(r && r.ok));
      }).catch(function (err) { U.diag('btw: ipc error ' + String(err)); });
      U.setComposerValue(ta, '');
    } else {
      U.diag('btw: dshDesktop missing');
      U.toast('旁注功能暂不可用（桌面桥未加载），内容未发送给模型');
      U.setComposerValue(ta, '');
    }
  }
  window.addEventListener('keydown', onKey, true);
})()`

/** /rewind + /checkpoint：fork 到任意轮次开新分支；检查点存本机 */
export const REWIND_SCRIPT = `(function () {
  if (window.__dshRewindInstalled) return;
  window.__dshRewindInstalled = true;
  var U = ${PAGE_UTILS};

  function rpc(method, payload) {
    return fetch('/api/' + method, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'rewind-' + Math.random().toString(36).slice(2),
        method: method,
        params: {},
        payload: payload || {}
      })
    }).then(function (r) { return r.json(); }).then(function (j) { return j && j.result; });
  }

  function activeSessionId() {
    return rpc('session.list', {}).then(function (res) {
      var items = res && res.value && res.value.items ? res.value.items : [];
      var running = items.filter(function (s) { return s.running === true; });
      var pool = running.length > 0 ? running : items;
      pool.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      return pool.length > 0 ? pool[0].sessionId : null;
    });
  }

  function extractText(data) {
    if (data == null) return '';
    if (typeof data === 'string') return data;
    if (typeof data === 'object' && typeof data.text === 'string') return data.text;
    if (Array.isArray(data)) {
      return data.map(function (p) { return p && p.type === 'text' ? p.text : ''; }).join(' ').trim();
    }
    return '';
  }

  function fetchUserPrompts(sessionId) {
    var out = [];
    var seen = {};
    var beforeSeq;
    var pages = 0;
    function page() {
      if (pages >= 5 || out.length >= 100) return Promise.resolve(out);
      var payload = { sessionId: sessionId, maxMessages: 500 };
      if (beforeSeq !== void 0) payload.beforeSeq = beforeSeq;
      pages++;
      return rpc('session.history', payload).then(function (res) {
        var evs = res && res.value && res.value.events ? res.value.events : [];
        for (var i = 0; i < evs.length; i++) {
          var e = evs[i] && evs[i].event;
          if (!e || e.type !== 'user/message') continue;
          if (seen[e.seq]) continue;
          seen[e.seq] = true;
          out.push({ seq: e.seq, text: extractText(e.data), time: e.time });
          if (out.length >= 100) return out;
        }
        if (res && res.value && res.value.hasMore && evs.length > 0) {
          beforeSeq = evs[0].event.seq;
          return page();
        }
        return out;
      });
    }
    return page();
  }

  function openSessionRow() {
    return new Promise(function (resolve) {
      var seen = {};
      var rows0 = document.querySelectorAll('[role="treeitem"]');
      for (var i = 0; i < rows0.length; i++) seen[rows0[i]] = true;
      var done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        mo.disconnect();
        resolve(ok);
      }
      var timer = setTimeout(function () { finish(false); }, 4000);
      var mo = new MutationObserver(function () {
        var rows = document.querySelectorAll('[role="treeitem"]');
        for (var i = 0; i < rows.length; i++) {
          if (!seen[rows[i]] && rows[i].getAttribute('aria-selected') !== 'true') {
            seen[rows[i]] = true;
            try { rows[i].click(); } catch (err) {}
            finish(true);
            return;
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    });
  }

  function doRewind(sessionId, atSeq, label) {
    U.diag('rewind: fork session=' + sessionId + ' atSeq=' + atSeq);
    return rpc('session.fork', { sessionId: sessionId, atSeq: atSeq }).then(function (res) {
      if (!res || !res.ok) {
        var msg = res && res.error ? (res.error.message || res.error.code || 'unknown') : 'unknown';
        U.diag('rewind: fork failed ' + msg);
        U.toast('回退失败：' + msg);
        return;
      }
      var childId = res.value && res.value.sessionId;
      U.diag('rewind: forked child=' + childId);
      U.toast('已回退' + label + '，正在打开新分支…');
      openSessionRow().then(function (ok) {
        if (!ok) U.toast('新分支已创建（' + childId + '），请在左侧会话列表点击打开');
      });
    }).catch(function (err) {
      U.diag('rewind: fork error ' + String(err));
      U.toast('回退失败：' + String(err));
    });
  }

  function timeAgo(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  function buildPicker(sessionId, prompts, checkpoints) {
    var items = [];
    checkpoints.forEach(function (c) {
      items.push({ kind: 'ck', id: c.id, name: c.name, atSeq: c.atSeq, title: '检查点「' + c.name + '」', meta: timeAgo(c.createdAt), text: c.preview || '(无预览)' });
    });
    prompts.forEach(function (p, i) {
      items.push({ kind: 'prompt', seq: p.seq, num: i + 1, title: '第 ' + (i + 1) + ' 条提示词', meta: timeAgo(p.time), text: p.text || '(空)' });
    });

    var old = document.getElementById('dsh-rewind-overlay');
    if (old) old.remove();
    var root = document.createElement('div');
    root.id = 'dsh-rewind-overlay';
    Object.assign(root.style, {
      position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
      width: '560px', maxWidth: '92vw', maxHeight: '68vh', display: 'flex', flexDirection: 'column',
      background: '#0f1115', color: '#e6e9ed', border: '1px solid #2a3542', borderRadius: '12px',
      zIndex: '2147483647', boxShadow: '0 12px 40px rgba(0,0,0,.55)',
      fontFamily: '-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
      fontSize: '13px', overflow: 'hidden'
    });
    var head = document.createElement('div');
    Object.assign(head.style, {
      display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
      borderBottom: '1px solid #1e2732', flex: '0 0 auto'
    });
    var hTitle = document.createElement('span');
    hTitle.textContent = '回退到哪一步？';
    Object.assign(hTitle.style, { fontWeight: '600' });
    var hSub = document.createElement('span');
    hSub.textContent = '将从此处开新分支继续（原会话保留）';
    Object.assign(hSub.style, { color: '#8a94a3', fontSize: '12px', flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
    var hClose = document.createElement('button');
    hClose.textContent = '✕';
    Object.assign(hClose.style, { background: 'none', border: 'none', color: '#8a94a3', cursor: 'pointer', fontSize: '14px', padding: '2px 6px' });
    hClose.onclick = close;
    head.appendChild(hTitle); head.appendChild(hSub); head.appendChild(hClose);
    root.appendChild(head);

    var list = document.createElement('div');
    list.tabIndex = -1;
    Object.assign(list.style, { overflowY: 'auto', flex: '1 1 auto', padding: '6px', outline: 'none' });
    var sel = 0;
    function render() {
      list.innerHTML = '';
      if (items.length === 0) {
        var empty = document.createElement('div');
        empty.textContent = '没有可回退的提示词';
        Object.assign(empty.style, { padding: '24px', textAlign: 'center', color: '#8a94a3' });
        list.appendChild(empty);
        return;
      }
      items.forEach(function (it, i) {
        var row = document.createElement('div');
        Object.assign(row.style, {
          display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer',
          background: i === sel ? '#1b2530' : 'transparent'
        });
        var idx = document.createElement('span');
        idx.textContent = it.kind === 'ck' ? '★' : String(i + 1).padStart(2, '0');
        Object.assign(idx.style, { color: it.kind === 'ck' ? '#e6b64c' : '#5b6470', fontFamily: 'monospace', fontSize: '11px', flex: '0 0 auto', width: '20px' });
        var body = document.createElement('div');
        Object.assign(body.style, { flex: '1', minWidth: '0' });
        var t1 = document.createElement('div');
        t1.textContent = it.title;
        Object.assign(t1.style, { fontWeight: '500' });
        var t2 = document.createElement('div');
        t2.textContent = it.text;
        Object.assign(t2.style, { color: '#8a94a3', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' });
        var t3 = document.createElement('div');
        t3.textContent = it.meta;
        Object.assign(t3.style, { color: '#5b6470', fontSize: '11px', marginTop: '1px' });
        body.appendChild(t1); body.appendChild(t2); body.appendChild(t3);
        var del = document.createElement('button');
        del.textContent = '×';
        Object.assign(del.style, { background: 'none', border: 'none', color: '#5b6470', cursor: 'pointer', fontSize: '15px', padding: '2px 6px', flex: '0 0 auto', display: it.kind === 'ck' ? 'block' : 'none' });
        del.title = '删除这个检查点';
        del.onclick = function (ev) {
          ev.stopPropagation();
          if (window.dshDesktop && window.dshDesktop.checkpointDelete) {
            window.dshDesktop.checkpointDelete(it.id).then(function (ok) {
              if (!ok) return;
              items.splice(i, 1);
              if (sel >= items.length) sel = Math.max(0, items.length - 1);
              render();
              if (items.length === 0) close();
            });
          }
        };
        row.onclick = function () { choose(it); };
        row.appendChild(idx); row.appendChild(body); row.appendChild(del);
        list.appendChild(row);
      });
    }
    function choose(it) {
      close();
      doRewind(sessionId, it.kind === 'ck' ? it.atSeq : it.seq, it.kind === 'ck' ? '到检查点「' + it.name + '」' : '到第 ' + it.num + ' 条提示词');
    }
    function close() {
      var el = document.getElementById('dsh-rewind-overlay');
      if (el) el.remove();
      document.removeEventListener('keydown', onKey2);
    }
    render();
    root.appendChild(list);
    var foot = document.createElement('div');
    foot.textContent = '↑↓ 选择 · Enter 回退 · Esc 关闭 · 回退 = 从该轮之后开新分支（原会话保留）';
    Object.assign(foot.style, { padding: '8px 14px', borderTop: '1px solid #1e2732', color: '#5b6470', fontSize: '11px', flex: '0 0 auto' });
    root.appendChild(foot);
    document.body.appendChild(root);
    list.focus();
    function onKey2(e) {
      if (!document.getElementById('dsh-rewind-overlay')) { document.removeEventListener('keydown', onKey2); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (items[sel]) choose(items[sel]); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    }
    document.addEventListener('keydown', onKey2);
  }

  function openRewindPicker(sessionId) {
    var ckPromise = (window.dshDesktop && window.dshDesktop.checkpointList)
      ? window.dshDesktop.checkpointList().then(function (r) { return r && r.items ? r.items : []; }).catch(function () { return []; })
      : Promise.resolve([]);
    Promise.all([fetchUserPrompts(sessionId), ckPromise]).then(function (res) {
      var prompts = res[0];
      var checkpoints = res[1].filter(function (c) { return c.sessionId === sessionId; });
      if (prompts.length === 0 && checkpoints.length === 0) {
        U.toast('没有可回退的提示词或检查点');
        return;
      }
      buildPicker(sessionId, prompts, checkpoints);
    });
  }

  function onKey(e) {
    if (e.isComposing) return;
    if (e.key !== 'Enter' || e.shiftKey) return;
    var ta = document.activeElement && document.activeElement.tagName === 'TEXTAREA' ? document.activeElement : null;
    if (!ta) return;
    var v = ta.value || '';
    var t = v.trim();
    var mC = t.match(/^[/\\uFF0F]checkpoint(?:\\s+(.+))?$/);
    if (mC) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      var name = (mC[1] || '').trim() || '未命名';
      U.diag('checkpoint: save name=' + name);
      U.setComposerValue(ta, '');
      if (window.dshDesktop && window.dshDesktop.checkpointSave) {
        window.dshDesktop.checkpointSave({ name: name }).catch(function (err) { U.diag('checkpoint: ipc error ' + String(err)); });
      } else {
        U.toast('检查点功能暂不可用（桌面桥未加载）');
      }
      return;
    }
    var mR = t.match(/^[/\\uFF0F]rewind(?:\\s+(\\d+))?$/);
    if (mR) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      U.diag('rewind: command ' + t);
      U.setComposerValue(ta, '');
      activeSessionId().then(function (sid) {
        if (!sid) { U.toast('没有可用会话'); return; }
        if (mR[1]) {
          var n = parseInt(mR[1], 10);
          fetchUserPrompts(sid).then(function (prompts) {
            var target = prompts[n - 1];
            if (!target) { U.toast('第 ' + n + ' 条不存在（共 ' + prompts.length + ' 条）'); return; }
            doRewind(sid, target.seq, '到第 ' + n + ' 条提示词');
          });
        } else {
          openRewindPicker(sid);
        }
      });
      return;
    }
  }
  window.addEventListener('keydown', onKey, true);
})()`
