/**
 * v0.1.2 新功能注入脚本（page world，executeJavaScript 注入，不碰官方 UI 资产）：
 * - SCROLL_SCRIPT  功能3：模型响应结束后，把「本次提示词」滚动到屏幕中间，
 *                  从这里开始阅读；切换回会话时同理。
 * - HISTORY_SCRIPT 功能1：输入框按 ↑ 调出本对话历史提示词（待实现）
 * - NOTIFY_SCRIPT  功能4：右下角任务完成通知气泡（待实现）
 * - REFERENCE_SCRIPT 功能2/5：右侧参照分栏 + 全部提示词节点（待实现）
 */

/**
 * 功能3：响应结束后滚动到「本次提示词」在屏幕中间。
 *
 * 机制：
 * - 官方 UI 每轮结束会渲染/更新 div[data-chat-flow-kind="turn-tail"]（由 turn/end 驱动），
 *   这是「本次响应完成」的可靠信号；
 * - 会话切换时 user 消息节点会重建（data-chat-flow-key 变化），同样触发一次定位；
 * - 定位目标：最后一条 div[data-chat-flow-kind="user"]（即本次提示词），
 *   用滚动容器 [data-conversation-scroll] 把它滚动到视口约 40% 高度处；
 * - 防打扰：用户主动滚动（wheel/touch/键盘滚动）后 1.5s 内不自动滚；
 *   同一会话同一提示词只滚一次（记录 lastScrolledKey）。
 */
export const SCROLL_SCRIPT = `(function () {
  if (window.__dshScrollInstalled) return;
  window.__dshScrollInstalled = true;
  window.__dshScrollDiag = { tailHandled: 0, scrollAttempts: 0, lastError: null, skipped: [], lastKey: null, userScrollingAtTail: 0 };

  var lastScrolledKey = null;   // 上次已定位的 user 节点 key（会话切换路径去重用）
  var lastTurnTailKey = null;   // 上次处理过的 turn-tail key（每轮结束信号去重用）
  var userScrolling = false;    // 用户主动滚动中
  var userScrollTimer = null;

  function userScrolled() {
    userScrolling = true;
    clearTimeout(userScrollTimer);
    userScrollTimer = setTimeout(function () { userScrolling = false; }, 1500);
  }

  function scrollContainer() {
    return document.querySelector('[data-conversation-scroll]');
  }

  function lastUserNode() {
    var all = document.querySelectorAll('div[data-chat-flow-kind="user"]');
    return all.length > 0 ? all[all.length - 1] : null;
  }

  function nodeKey(node) {
    return node.getAttribute('data-chat-flow-key') || ('user@' + node.textContent.slice(0, 40));
  }

  /** 把 node 滚动到滚动容器视口约 40% 处（偏上一点，给下方回复留阅读空间） */
  function scrollNodeToCenter(node) {
    var sc = scrollContainer();
    if (!sc || !node) return false;
    var sRect = sc.getBoundingClientRect();
    var nRect = node.getBoundingClientRect();
    // 节点已在视口中间区域（25%~65%）就不动
    var relTop = nRect.top - sRect.top;
    var relBot = nRect.bottom - sRect.top;
    var ratioTop = relTop / sRect.height;
    var ratioBot = relBot / sRect.height;
    if (ratioTop >= 0.25 && ratioBot <= 0.65) return false;
    // 目标：节点顶部在视口 40% 处（即时滚动，不依赖动画；响应结束回到阅读起点更直接）
    var targetTop = sc.scrollTop + relTop - sRect.height * 0.40;
    targetTop = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, targetTop));
    if (Math.abs(sc.scrollTop - targetTop) < 4) return false;
    window.__dshScrollDiag.scrollAttempts++;
    sc.scrollTop = targetTop;
    return true;
  }

  // ── 路径A：每轮结束（turn-tail 出现/更新）→ 强制滚动到本次提示词 ──
  // turn-tail 每轮只出现/更新一次（turn/end 驱动），用其 key 去重即可；
  // 不依赖 user 节点 key（新轮次必然伴随新提示词，但探针/边界下 user key 可能不变）。
  function handleTurnTail(tailNode) {
    window.__dshScrollDiag.tailHandled++;
    window.__dshScrollDiag.lastKey = tailNode.getAttribute('data-chat-flow-key') || '';
    if (userScrolling) { window.__dshScrollDiag.userScrollingAtTail++; return; }
    var key = tailNode.getAttribute('data-chat-flow-key') || '';
    if (key && key === lastTurnTailKey) { window.__dshScrollDiag.skipped.push('sameKey'); return; }
    lastTurnTailKey = key;
    // 延迟等渲染稳定；历史还在加载时节点位置可能再变，多试几次
    tryScrollToLastUser(0);
  }

  function tryScrollToLastUser(attempt) {
    if (userScrolling) return;
    var node = lastUserNode();
    if (!node) return;
    var done = scrollNodeToCenter(node);
    // 历史加载中节点位置会推移：最多重试 3 次（250ms/700ms/1500ms）
    if (!done && attempt < 3) {
      var delays = [250, 700, 1500];
      setTimeout(function () { tryScrollToLastUser(attempt + 1); }, delays[attempt]);
    }
  }

  // 1) 每轮结束信号：turn-tail 节点新增（childList）或 data-chat-flow-key 更新（attributes）
  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === 'childList') {
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n.nodeType !== 1) continue;
          var self = n.getAttribute && n.getAttribute('data-chat-flow-kind') === 'turn-tail' ? n : null;
          var inner = self ? null : (n.querySelectorAll ? n.querySelectorAll('div[data-chat-flow-kind="turn-tail"]') : null);
          var tail = self || (inner && inner.length > 0 ? inner[0] : null);
          if (tail) { handleTurnTail(tail); return; }
        }
      } else if (m.type === 'attributes' && m.attributeName === 'data-chat-flow-key' &&
                 m.target.getAttribute && m.target.getAttribute('data-chat-flow-kind') === 'turn-tail') {
        handleTurnTail(m.target);
        return;
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-chat-flow-key'] });

  // ── 路径B：会话切换（user 节点集合变化）→ 定位到最后一条提示词 ──
  var lastUserSig = '';
  function userSig() {
    var all = document.querySelectorAll('div[data-chat-flow-kind="user"]');
    if (all.length === 0) return '';
    return all.length + ':' + nodeKey(all[0]) + ':' + nodeKey(all[all.length - 1]);
  }
  lastUserSig = userSig();
  var mo2 = new MutationObserver(function () {
    var s = userSig();
    if (s !== lastUserSig) {
      lastUserSig = s;
      if (s !== '') {
        // 会话切换：等历史加载稳定后再定位
        setTimeout(function () {
          if (userScrolling) return;
          var node = lastUserNode();
          if (!node) return;
          var key = nodeKey(node);
          if (key === lastScrolledKey) return;
          lastScrolledKey = key;
          setTimeout(function () { scrollNodeToCenter(node); }, 200);
        }, 900);
      }
    }
  });
  mo2.observe(document.body, { childList: true, subtree: true });

  // 3) 用户主动滚动标记
  window.addEventListener('wheel', userScrolled, true);
  window.addEventListener('touchmove', userScrolled, true);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'PageUp' || e.key === 'PageDown' || e.key === 'Home' || e.key === 'End' || e.key === ' ') userScrolled();
  }, true);
})()`

/**
 * 功能1：输入框按 ↑ 调出本对话的历史提示词。
 *
 * 交互（与终端历史命令一致）：
 * - 输入框为空时按 ↑ → 弹出历史提示词浮层（最近一条高亮）；
 * - 继续 ↑ 翻更早、↓ 往回翻；Enter 把选中回填进输入框并关闭；
 * - Esc 关闭；点击某条直接回填；
 * - 历史来自引擎 session.history 的真实 user/message（分页拉取，最多 100 条）。
 *
 * 注意：只在输入框为空（无内容、光标未选中文字）时接管 ↑/↓，
 * 不干扰正常输入时光标移动。
 */
export const HISTORY_SCRIPT = `(function () {
  if (window.__dshHistoryInstalled) return;
  window.__dshHistoryInstalled = true;
  window.__dshHistoryDiag = { onKey: 0, upOnEmpty: 0, opened: 0, fetchDone: 0, fetchEmpty: 0, err: null };

  function rpc(method, payload) {
    return fetch('/api/' + method, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'hist-' + Math.random().toString(36).slice(2),
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
    // 新版消息结构：{ content: [{ type:'text', text }], source: { kind:'user' }, ... }
    if (typeof data === 'object' && Array.isArray(data.content)) {
      return data.content.map(function (p) { return p && p.type === 'text' && typeof p.text === 'string' ? p.text : ''; }).join(' ').trim();
    }
    return '';
  }

  /** user 消息来源判定：老格式无 source 或 source.kind === 'user' 才算真实用户消息 */
  function isRealUserMessage(data) {
    if (data == null || typeof data !== 'object') return true;
    var src = data.source ? data.source.kind : null;
    return !src || src === 'user';
  }

  /** 分页拉取本会话全部 user/message（最多 100 条，倒序=最近在前） */
  function fetchUserPrompts(sessionId) {
    var out = [];
    var seen = {};
    var beforeSeq;
    var pages = 0;
    function page() {
      if (pages >= 6 || out.length >= 100) return Promise.resolve(out);
      var payload = { sessionId: sessionId, maxMessages: 300 };
      if (beforeSeq !== void 0) payload.beforeSeq = beforeSeq;
      pages++;
      return rpc('session.history', payload).then(function (res) {
        var evs = res && res.value && res.value.events ? res.value.events : [];
        for (var i = 0; i < evs.length; i++) {
          var e = evs[i] && evs[i].event;
          if (!e || e.type !== 'user/message') continue;
          if (seen[e.seq]) continue;
          seen[e.seq] = true;
          // 跳过系统注入类消息（AGENTS.md 提醒等 source.kind !== 'user'）
          if (!isRealUserMessage(e.data)) continue;
          var txt = extractText(e.data);
          if (!txt) continue;
          out.push({ seq: e.seq, text: txt });
          if (out.length >= 100) return out;
        }
        if (res && res.value && res.value.hasMore && evs.length > 0) {
          beforeSeq = evs[0].event.seq;
          return page();
        }
        return out;
      });
    }
    return page().then(function (list) { return list.reverse(); });
  }

  function findComposer() {
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
  }

  function setComposerValue(ta, v) {
    var proto = HTMLTextAreaElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(ta, v); else ta.value = v;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  var overlay = null;
  var listEl = null;
  var sel = 0;
  var items = [];

  function close() {
    if (overlay) { overlay.remove(); overlay = null; listEl = null; items = []; }
  }

  function render() {
    if (!listEl) return;
    listEl.innerHTML = '';
    items.forEach(function (it, i) {
      var row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '8px', cursor: 'pointer',
        background: i === sel ? '#1b2530' : 'transparent'
      });
      var idx = document.createElement('span');
      idx.textContent = String(i + 1).padStart(2, '0');
      Object.assign(idx.style, { color: '#5b6470', fontFamily: 'monospace', fontSize: '11px', flex: '0 0 auto' });
      var body = document.createElement('div');
      body.textContent = it.text;
      Object.assign(body.style, { flex: '1', minWidth: '0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
      row.appendChild(idx); row.appendChild(body);
      row.onclick = function () { choose(i); };
      row.onmouseenter = function () { sel = i; render(); };
      listEl.appendChild(row);
    });
    if (items.length === 0) {
      var empty = document.createElement('div');
      empty.textContent = '这个对话还没有可用的历史提示词';
      Object.assign(empty.style, { padding: '20px', textAlign: 'center', color: '#8a94a3' });
      listEl.appendChild(empty);
    }
    var rows = listEl.children;
    if (rows[sel]) rows[sel].scrollIntoView({ block: 'nearest' });
  }

  function choose(i) {
    var ta = findComposer();
    if (ta && items[i]) setComposerValue(ta, items[i].text);
    close();
    if (ta) ta.focus();
  }

  function buildOverlay() {
    close();
    overlay = document.createElement('div');
    overlay.id = 'dsh-history-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', left: '50%', bottom: '120px', transform: 'translateX(-50%)',
      width: '640px', maxWidth: '92vw', maxHeight: '40vh', display: 'flex', flexDirection: 'column',
      background: '#0f1115', color: '#e6e9ed', border: '1px solid #2a3542', borderRadius: '12px',
      zIndex: '2147483647', boxShadow: '0 12px 40px rgba(0,0,0,.55)',
      fontFamily: '-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
      fontSize: '13px', overflow: 'hidden'
    });
    var head = document.createElement('div');
    Object.assign(head.style, {
      display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 14px',
      borderBottom: '1px solid #1e2732', flex: '0 0 auto'
    });
    var hTitle = document.createElement('span');
    hTitle.textContent = '历史提示词';
    Object.assign(hTitle.style, { fontWeight: '600' });
    var hSub = document.createElement('span');
    hSub.textContent = '↑↓ 选择 · Enter 回填 · Esc 关闭';
    Object.assign(hSub.style, { color: '#8a94a3', fontSize: '12px', flex: '1', textAlign: 'right' });
    head.appendChild(hTitle); head.appendChild(hSub);
    overlay.appendChild(head);
    listEl = document.createElement('div');
    listEl.tabIndex = -1;
    Object.assign(listEl.style, { overflowY: 'auto', flex: '1 1 auto', padding: '6px', outline: 'none' });
    overlay.appendChild(listEl);
    document.body.appendChild(overlay);
    render();
    listEl.focus();
  }

  /** 返回输入框是否为空（无内容且光标在最前） */
  function isEmptyComposer(ta) {
    if (!ta) return false;
    if ((ta.value || '').trim() !== '') return false;
    try { if (ta.selectionStart !== ta.selectionEnd || ta.selectionStart !== 0) return false; } catch (e) {}
    return true;
  }

  function openHistory() {
    if (overlay) return; // 已在浏览中
    window.__dshHistoryDiag.opened++;
    activeSessionId().then(function (sid) {
      if (!sid) return;
      fetchUserPrompts(sid).then(function (list) {
        window.__dshHistoryDiag.fetchDone++;
        if (list.length === 0) { window.__dshHistoryDiag.fetchEmpty++; }
        if (list.length === 0) {
          var ta = findComposer();
          var old = document.getElementById('dsh-feature-toast');
          if (old) old.remove();
          var t = document.createElement('div');
          t.id = 'dsh-feature-toast';
          t.textContent = '这个对话还没有可用的历史提示词';
          Object.assign(t.style, {
            position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)',
            zIndex: '2147483647', background: '#1b222c', color: '#e6e9ed',
            border: '1px solid #2a3542', borderRadius: '8px', padding: '8px 14px', fontSize: '13px'
          });
          document.body.appendChild(t);
          setTimeout(function () { var el = document.getElementById('dsh-feature-toast'); if (el) el.remove(); }, 2000);
          return;
        }
        items = list;
        sel = 0;
        buildOverlay();
      });
    });
  }

  function onKey(e) {
    window.__dshHistoryDiag.onKey++;
    if (e.isComposing) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (overlay) {
      // 浮层打开时：↑↓ 选择（焦点在浮层内，无需 composer 检查）
      if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); sel = Math.max(0, sel - 1); render(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); sel = Math.min(items.length - 1, sel + 1); render(); }
      return;
    }
    var ta = document.activeElement && document.activeElement.tagName === 'TEXTAREA' ? document.activeElement : findComposer();
    if (!ta || document.activeElement !== ta) return;
    // 只在空输入框接管 ↑（终端式历史）
    if (e.key === 'ArrowUp' && isEmptyComposer(ta)) {
      window.__dshHistoryDiag.upOnEmpty++;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      openHistory();
    }
  }
  window.addEventListener('keydown', onKey, true);

  // 浮层内 Enter 回填 / Esc 关闭
  document.addEventListener('keydown', function (e) {
    if (!overlay) return;
    if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      if (items[sel]) choose(sel);
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      close();
    }
  }, true);
})()`

/**
 * 功能4：右下角通知气泡。
 *
 * 每次「一件事做完」（响应结束 = turn-tail 出现/更新）在右下角弹一条提醒：
 * - 显示本次提示词摘要 + 完成时间；
 * - 点击气泡 → 跳转到本次提示词位置（与功能3同一目标）；
 * - 约 3 秒自动消失（淡出）；多条可堆叠（最多保留 5 条，旧的先消失）；
 * - 同轮只弹一次（turn-tail key 去重）。
 */
export const NOTIFY_SCRIPT = `(function () {
  if (window.__dshNotifyInstalled) return;
  window.__dshNotifyInstalled = true;
  window.__dshNotifyDiag = { shown: 0, clicked: 0 };

  var lastTailKey = null;
  var box = null;

  function ensureBox() {
    if (box && document.body.contains(box)) return box;
    box = document.createElement('div');
    box.id = 'dsh-notify-box';
    Object.assign(box.style, {
      position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483646',
      display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end',
      pointerEvents: 'none', maxWidth: '340px'
    });
    document.body.appendChild(box);
    return box;
  }

  function lastUserText() {
    var all = document.querySelectorAll('div[data-chat-flow-kind="user"]');
    if (all.length === 0) return '';
    var node = all[all.length - 1];
    // 优先取气泡文本（不含日期等元数据）
    var bubble = node.querySelector('.gdEzaW_bubble ._text_1pfhk_1') || node.querySelector('[class*="_text"]');
    var t = ((bubble ? bubble.textContent : node.innerText) || '').trim().replace(/\\s+/g, ' ');
    return t.length > 40 ? t.slice(0, 40) + '…' : t;
  }

  function scrollToLastUser() {
    var sc = document.querySelector('[data-conversation-scroll]');
    var all = document.querySelectorAll('div[data-chat-flow-kind="user"]');
    if (!sc || all.length === 0) return;
    var node = all[all.length - 1];
    var sRect = sc.getBoundingClientRect();
    var nRect = node.getBoundingClientRect();
    var relTop = nRect.top - sRect.top;
    var targetTop = sc.scrollTop + relTop - sRect.height * 0.40;
    targetTop = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, targetTop));
    sc.scrollTop = targetTop;
  }

  function dismiss(el) {
    if (!el || !el.parentNode) return;
    el.style.transition = 'opacity .25s ease';
    el.style.opacity = '0';
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
  }

  function show(text) {
    var b = ensureBox();
    var el = document.createElement('div');
    Object.assign(el.style, {
      pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: '8px',
      background: '#1b222c', color: '#e6e9ed', border: '1px solid #2a3542',
      borderRadius: '10px', padding: '9px 12px', fontSize: '12.5px',
      boxShadow: '0 6px 20px rgba(0,0,0,.45)', cursor: 'pointer',
      maxWidth: '320px', fontFamily: '-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
      lineHeight: '18px'
    });
    var dot = document.createElement('span');
    dot.textContent = '✓';
    Object.assign(dot.style, { color: '#4ade80', fontWeight: '700', flex: '0 0 auto' });
    var body = document.createElement('span');
    body.textContent = text;
    Object.assign(body.style, { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
    var close = document.createElement('span');
    close.textContent = '✕';
    Object.assign(close.style, { color: '#5b6470', cursor: 'pointer', fontSize: '12px', flex: '0 0 auto', padding: '0 2px' });
    close.onclick = function (ev) {
      ev.stopPropagation();
      dismiss(el);
    };
    el.onclick = function () {
      window.__dshNotifyDiag.clicked++;
      scrollToLastUser();
      dismiss(el);
    };
    el.appendChild(dot); el.appendChild(body); el.appendChild(close);
    b.appendChild(el);
    // 最多保留 5 条：超出时移除最旧
    while (b.children.length > 5) {
      var old = b.children[0];
      if (old.parentNode) old.parentNode.removeChild(old);
    }
    window.__dshNotifyDiag.shown++;
    setTimeout(function () { dismiss(el); }, 3000);
  }

  function handleTail(tailNode) {
    var key = tailNode.getAttribute('data-chat-flow-key') || '';
    if (key && key === lastTailKey) return;
    lastTailKey = key;
    var text = lastUserText();
    if (!text) return;
    var t = new Date();
    var hh = String(t.getHours()).padStart(2, '0');
    var mm = String(t.getMinutes()).padStart(2, '0');
    show('已完成：' + text + '（' + hh + ':' + mm + '）');
  }

  var mo = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === 'childList') {
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n.nodeType !== 1) continue;
          var self = n.getAttribute && n.getAttribute('data-chat-flow-kind') === 'turn-tail' ? n : null;
          var inner = self ? null : (n.querySelectorAll ? n.querySelectorAll('div[data-chat-flow-kind="turn-tail"]') : null);
          var tail = self || (inner && inner.length > 0 ? inner[0] : null);
          if (tail) { handleTail(tail); return; }
        }
      } else if (m.type === 'attributes' && m.attributeName === 'data-chat-flow-key' &&
                 m.target.getAttribute && m.target.getAttribute('data-chat-flow-kind') === 'turn-tail') {
        handleTail(m.target);
        return;
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-chat-flow-key'] });
})()`

/**
 * 功能5：右侧 prompt 轨道升级为「全量提示词节点」。
 *
 * 官方 UI 的历史是增量加载的（「加载更早」按钮），DOM 里只渲染视口附近的部分，
 * RAIL 旧版基于 DOM 构建 → 只能看到加载的部分。
 * 本脚本改用引擎 API（session.history 分页）拉取当前会话【全部】 user/message：
 * - 右侧竖条每格 = 一条提示词（最新在最下，蓝色高亮），悬停预览，点击跳转；
 * - 跳转目标在 DOM 已加载 → 直接滚动；未加载 → 自动反复点「加载更早」直到出现；
 * - 随消息流自动刷新（新提示词出现时增量追加）。
 */
export const RAIL_ALL_SCRIPT = `(function () {
  if (window.__dshRailAllInstalled) return;
  window.__dshRailAllInstalled = true;

  var RAIL_ID = 'dsh-prompt-rail-all';
  var TIP_ID = 'dsh-prompt-rail-all-tip';
  var COUNT_ID = 'dsh-prompt-rail-all-count';
  var prompts = [];        // { seq, text, key? }
  var sessionSig = '';     // 当前会话标识
  var loading = false;     // 防重入
  var loadMoreBusy = false;

  function rpc(method, payload) {
    return fetch('/api/' + method, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'rail-' + Math.random().toString(36).slice(2),
        method: method,
        params: {},
        payload: payload || {}
      })
    }).then(function (r) { return r.json(); }).then(function (j) { return j && j.result; });
  }

  function extractText(data) {
    if (data == null) return '';
    if (typeof data === 'string') return data;
    if (typeof data === 'object' && typeof data.text === 'string') return data.text;
    if (Array.isArray(data)) {
      return data.map(function (p) { return p && p.type === 'text' ? p.text : ''; }).join(' ').trim();
    }
    if (typeof data === 'object' && Array.isArray(data.content)) {
      return data.content.map(function (p) { return p && p.type === 'text' && typeof p.text === 'string' ? p.text : ''; }).join(' ').trim();
    }
    return '';
  }

  function isRealUserMessage(data) {
    if (data == null || typeof data !== 'object') return true;
    var src = data.source ? data.source.kind : null;
    return !src || src === 'user';
  }

  /** 分页拉取本会话全部 user/message（倒序=最新在前） */
  function fetchAllPrompts(sessionId) {
    var out = [];
    var seen = {};
    var beforeSeq;
    var pages = 0;
    function page() {
      if (pages >= 40 || out.length >= 600) return Promise.resolve(out);
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
          if (!isRealUserMessage(e.data)) continue;
          var txt = extractText(e.data);
          if (!txt) continue;
          out.push({ seq: e.seq, text: txt });
          if (out.length >= 600) return out;
        }
        if (res && res.value && res.value.hasMore && evs.length > 0) {
          beforeSeq = evs[0].event.seq;
          return page();
        }
        return out;
      });
    }
    return page().then(function (list) { return list.reverse(); });
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

  /** 当前 DOM 里已渲染的 user 节点 key 集合 */
  function domUserKeys() {
    var all = document.querySelectorAll('div[data-chat-flow-kind="user"]');
    var keys = {};
    for (var i = 0; i < all.length; i++) keys[all[i].getAttribute('data-chat-flow-key') || ('u' + i)] = all[i];
    return keys;
  }

  /** 点击「加载更早」直到目标 seq 对应的 user 节点出现（seq 匹配：最新往前数第 n 条） */
  function ensurePromptLoaded(targetSeq, maxClicks) {
    return new Promise(function (resolve) {
      if (maxClicks <= 0) return resolve(false);
      var domKeys = domUserKeys();
      var all = document.querySelectorAll('div[data-chat-flow-kind="user"]');
      if (all.length > 0) {
        // 尝试从 DOM 推断 seq：最新 user 节点的 seq 未知，改用「按位置匹配」
        // 简化策略：如果 DOM 已有 >= 目标序号 的节点数，视为已加载
        var idx = prompts.findIndex(function (p) { return p.seq === targetSeq; });
        if (idx >= 0 && all.length > prompts.length - 1 - idx - 1) {
          // DOM 中该提示词对应的位置存在（从最新往前数）
          var fromEnd = prompts.length - 1 - idx;
          if (all.length > fromEnd) { resolve(true); return; }
        }
      }
      // 没有 → 点「加载更早」
      var btn = null;
      var btns = document.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        if ((btns[i].textContent || '').trim() === '加载更早') { btn = btns[i]; break; }
      }
      if (!btn) { resolve(false); return; }
      btn.click();
      setTimeout(function () { resolve(ensurePromptLoaded(targetSeq, maxClicks - 1)); }, 800);
    });
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
    if (prompts.length === 0) return;

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

    prompts.forEach(function (p, idx) {
      var len = Math.min(28, 6 + Math.round(p.text.length / 8));
      var line = document.createElement('button');
      Object.assign(line.style, {
        width: len + 'px', height: '7px', border: 'none', borderRadius: '3px',
        background: idx === prompts.length - 1 ? '#679efe' : '#3a4452',
        cursor: 'pointer', padding: '0', flex: '0 0 auto'
      });
      line.setAttribute('aria-label', '提示词 ' + (idx + 1) + '：' + p.text);
      line.onmouseenter = function () { tip.textContent = p.text; tip.style.display = 'block'; positionTip(line); };
      line.onmouseleave = function () { tip.style.display = 'none'; };
      line.onclick = function () {
        ensurePromptLoaded(p.seq, 30).then(function (loaded) {
          var users = document.querySelectorAll('div[data-chat-flow-kind="user"]');
          if (users.length === 0) return;
          var fromEnd = prompts.length - 1 - idx;
          var target = users[users.length - 1 - fromEnd];
          if (!target) target = users[users.length - 1];
          var sc = document.querySelector('[data-conversation-scroll]');
          if (sc && target) {
            var sRect = sc.getBoundingClientRect();
            var nRect = target.getBoundingClientRect();
            var relTop = nRect.top - sRect.top;
            var targetTop = sc.scrollTop + relTop - sRect.height * 0.40;
            targetTop = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, targetTop));
            sc.scrollTop = targetTop;
          }
          if (!loaded) {
            var tt = document.getElementById(TIP_ID);
            if (tt) { tt.textContent = '未加载到该提示词（历史过深），已尽量跳转'; tt.style.display = 'block'; setTimeout(function () { tt.style.display = 'none'; }, 2000); }
          }
        });
      };
      rail.appendChild(line);
    });
    document.body.appendChild(rail);
  }

  function refresh(sessionId) {
    if (loading) return;
    loading = true;
    fetchAllPrompts(sessionId).then(function (list) {
      loading = false;
      var changed = list.length !== prompts.length;
      if (!changed) {
        for (var i = 0; i < list.length; i++) {
          if (list[i].seq !== prompts[i].seq) { changed = true; break; }
        }
      }
      if (changed) {
        prompts = list;
        build();
      }
    }).catch(function () { loading = false; });
  }

  // 会话切换检测：user 节点集合变化 + 定期刷新
  var lastSig = '';
  function sig() {
    var items = document.querySelectorAll('div[data-chat-flow-kind]');
    if (items.length === 0) return '';
    return items.length + ':' + (items[0].getAttribute('data-chat-flow-key') || '') + ':' + (items[items.length - 1].getAttribute('data-chat-flow-key') || '');
  }
  lastSig = sig();
  var mo = new MutationObserver(function () {
    var s = sig();
    if (s !== lastSig) {
      lastSig = s;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(function () {
        activeSessionId().then(function (sid) {
          if (!sid) return;
          var ns = sig();
          if (ns !== lastSig) { lastSig = ns; }
          refresh(sid);
        });
      }, 700);
    }
  });
  var refreshTimer = null;
  mo.observe(document.body, { childList: true, subtree: true });

  // 启动时拉一次
  activeSessionId().then(function (sid) {
    if (sid) refresh(sid);
  });
})()`

/**
 * 功能2：右侧「参照对话」分栏（类似 split）。
 *
 * - 左侧会话列表的会话行 hover 出现「参照」小按钮；点击 → 右侧打开参照栏，
 *   从引擎 API 拉取该会话历史（user 提示词 + assistant 回复），可滚动阅读；
 * - 每条消息旁有「收藏」按钮 → 收藏句子（存本机，可跨会话保留）；
 * - 参照栏顶部列出已收藏句子，底部「复制全部收藏」一键复制；
 * - ✕ 关闭参照栏；
 * - 参照栏钉住目标会话：期间切换主会话不影响参照栏内容。
 */
export const REFERENCE_SCRIPT = `(function () {
  if (window.__dshReferenceInstalled) return;
  window.__dshReferenceInstalled = true;
  window.__dshReferenceDiag = { opened: 0, collected: 0, copied: 0, closed: 0 };

  var PANEL_ID = 'dsh-reference-panel';
  var panel = null;
  var pinnedSessionId = null;   // 参照栏钉住的会话
  var pinnedTitle = '';
  var loadedMsgs = [];          // { kind:'user'|'assistant', text }
  var collected = [];           // 本工作区收藏列表
  var msgScroll = null;
  var collectListEl = null;

  function rpc(method, payload) {
    return fetch('/api/' + method, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'ref-' + Math.random().toString(36).slice(2),
        method: method,
        params: {},
        payload: payload || {}
      })
    }).then(function (r) { return r.json(); }).then(function (j) { return j && j.result; });
  }

  function extractText(data) {
    if (data == null) return '';
    if (typeof data === 'string') return data;
    if (typeof data === 'object' && typeof data.text === 'string') return data.text;
    if (Array.isArray(data)) {
      return data.map(function (p) { return p && p.type === 'text' ? p.text : ''; }).join(' ').trim();
    }
    if (typeof data === 'object' && Array.isArray(data.content)) {
      return data.content.map(function (p) { return p && p.type === 'text' && typeof p.text === 'string' ? p.text : ''; }).join(' ').trim();
    }
    return '';
  }

  function isRealUserMessage(data) {
    if (data == null || typeof data !== 'object') return true;
    var src = data.source ? data.source.kind : null;
    return !src || src === 'user';
  }

  /** 拉取会话历史：user/message + assistant/message（最近最多 120 条消息，倒序=最新在前） */
  function fetchSessionMessages(sessionId) {
    var msgs = [];
    var beforeSeq;
    var pages = 0;
    function page() {
      if (pages >= 10 || msgs.length >= 120) return Promise.resolve(msgs);
      var payload = { sessionId: sessionId, maxMessages: 400 };
      if (beforeSeq !== void 0) payload.beforeSeq = beforeSeq;
      pages++;
      return rpc('session.history', payload).then(function (res) {
        var evs = res && res.value && res.value.events ? res.value.events : [];
        for (var i = 0; i < evs.length; i++) {
          var e = evs[i] && evs[i].event;
          if (!e) continue;
          if (e.type === 'user/message') {
            if (!isRealUserMessage(e.data)) continue;
            var ut = extractText(e.data);
            if (ut) msgs.push({ kind: 'user', text: ut });
          } else if (e.type === 'assistant/message') {
            var at = extractText(e.data);
            if (at) msgs.push({ kind: 'assistant', text: at });
          }
          if (msgs.length >= 120) return msgs;
        }
        if (res && res.value && res.value.hasMore && evs.length > 0) {
          beforeSeq = evs[0].event.seq;
          return page();
        }
        return msgs;
      });
    }
    return page().then(function (list) { return list.reverse(); });
  }

  function loadCollected() {
    if (window.dshDesktop && window.dshDesktop.referenceList) {
      return window.dshDesktop.referenceList().then(function (r) {
        collected = (r && r.items) ? r.items : [];
        return collected;
      }).catch(function () { collected = []; return collected; });
    }
    collected = [];
    return Promise.resolve(collected);
  }

  function renderCollected() {
    if (!collectListEl) return;
    collectListEl.innerHTML = '';
    if (collected.length === 0) {
      var empty = document.createElement('div');
      empty.textContent = '还没有收藏句子';
      Object.assign(empty.style, { padding: '10px', textAlign: 'center', color: '#5b6470', fontSize: '12px' });
      collectListEl.appendChild(empty);
      return;
    }
    collected.forEach(function (it, i) {
      var row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', alignItems: 'flex-start', gap: '6px', padding: '6px 8px', borderRadius: '6px',
        background: 'rgba(230,182,76,.08)', marginBottom: '4px'
      });
      var body = document.createElement('div');
      body.textContent = it.text;
      Object.assign(body.style, { flex: '1', minWidth: '0', fontSize: '12px', lineHeight: '17px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '52px', overflow: 'hidden' });
      var del = document.createElement('button');
      del.textContent = '×';
      Object.assign(del.style, { background: 'none', border: 'none', color: '#8a94a3', cursor: 'pointer', fontSize: '13px', flex: '0 0 auto', padding: '0 2px' });
      del.title = '取消收藏';
      del.onclick = function (ev) {
        ev.stopPropagation();
        if (window.dshDesktop && window.dshDesktop.referenceDelete) {
          window.dshDesktop.referenceDelete(it.id).then(function () { loadCollected().then(renderCollected); });
        }
      };
      row.appendChild(body); row.appendChild(del);
      collectListEl.appendChild(row);
    });
  }

  function renderMessages() {
    if (!msgScroll) return;
    msgScroll.innerHTML = '';
    if (loadedMsgs.length === 0) {
      var empty = document.createElement('div');
      empty.textContent = '这个对话暂无内容';
      Object.assign(empty.style, { padding: '20px', textAlign: 'center', color: '#5b6470' });
      msgScroll.appendChild(empty);
      return;
    }
    loadedMsgs.forEach(function (m, i) {
      var row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', gap: '6px', padding: '7px 8px', borderRadius: '8px',
        border: '1px solid ' + (m.kind === 'user' ? '#2a3b52' : '#232c38'),
        background: m.kind === 'user' ? 'rgba(103,158,254,.07)' : 'transparent',
        marginBottom: '6px', alignItems: 'flex-start'
      });
      var tag = document.createElement('span');
      tag.textContent = m.kind === 'user' ? '问' : '答';
      Object.assign(tag.style, {
        flex: '0 0 auto', fontSize: '10px', fontWeight: '700', borderRadius: '4px', padding: '1px 5px',
        background: m.kind === 'user' ? '#2a4a75' : '#333c48', color: '#c9d4e3', marginTop: '1px'
      });
      var body = document.createElement('div');
      body.textContent = m.text;
      Object.assign(body.style, { flex: '1', minWidth: '0', fontSize: '12px', lineHeight: '18px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '90px', overflow: 'hidden' });
      var fav = document.createElement('button');
      fav.textContent = '☆';
      Object.assign(fav.style, { background: 'none', border: 'none', color: '#8a94a3', cursor: 'pointer', fontSize: '15px', flex: '0 0 auto', padding: '0 2px' });
      fav.title = '收藏这句话';
      fav.onclick = function (ev) {
        ev.stopPropagation();
        if (window.dshDesktop && window.dshDesktop.referenceAdd) {
          window.dshDesktop.referenceAdd({ sessionId: pinnedSessionId, sessionTitle: pinnedTitle, text: m.text }).then(function () {
            window.__dshReferenceDiag.collected++;
            loadCollected().then(renderCollected);
          });
        }
      };
      row.appendChild(tag); row.appendChild(body); row.appendChild(fav);
      msgScroll.appendChild(row);
    });
  }

  function copyAll() {
    var text = collected.map(function (c) { return '- ' + c.text; }).join('\\n');
    if (!text) return;
    window.__dshReferenceDiag.copied++;
    var ok = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { ok = true; },
        function () { fallbackCopy(text); }
      );
    } else {
      fallbackCopy(text);
    }
    // 轻提示（页面可见反馈）
    var old = document.getElementById('dsh-feature-toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.id = 'dsh-feature-toast';
    t.textContent = '已复制 ' + collected.length + ' 条收藏';
    Object.assign(t.style, {
      position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)',
      zIndex: '2147483647', background: '#1b222c', color: '#e6e9ed',
      border: '1px solid #2a3542', borderRadius: '8px', padding: '8px 14px', fontSize: '13px',
      fontFamily: '-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif'
    });
    document.body.appendChild(t);
    setTimeout(function () { var el = document.getElementById('dsh-feature-toast'); if (el) el.remove(); }, 2000);
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function close() {
    var el = document.getElementById(PANEL_ID);
    if (el) el.remove();
    panel = null;
    window.__dshReferenceDiag.closed++;
  }

  function buildPanel() {
    close();
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    Object.assign(panel.style, {
      position: 'fixed', right: '0', top: '0', bottom: '0', width: '400px',
      background: '#0f1115', color: '#e6e9ed', borderLeft: '1px solid #2a3542',
      zIndex: '2147483645', display: 'flex', flexDirection: 'column',
      boxShadow: '-8px 0 24px rgba(0,0,0,.35)',
      fontFamily: '-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
      fontSize: '13px'
    });
    // 头部
    var head = document.createElement('div');
    Object.assign(head.style, {
      display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
      borderBottom: '1px solid #1e2732', flex: '0 0 auto'
    });
    var hTitle = document.createElement('span');
    hTitle.textContent = '参照对话';
    Object.assign(hTitle.style, { fontWeight: '600' });
    var hSub = document.createElement('span');
    hSub.id = 'dsh-reference-title';
    hSub.textContent = pinnedTitle || '';
    Object.assign(hSub.style, { color: '#8a94a3', fontSize: '12px', flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
    var hClose = document.createElement('button');
    hClose.textContent = '✕';
    Object.assign(hClose.style, { background: 'none', border: 'none', color: '#8a94a3', cursor: 'pointer', fontSize: '14px', padding: '2px 6px' });
    hClose.onclick = close;
    head.appendChild(hTitle); head.appendChild(hSub); head.appendChild(hClose);
    panel.appendChild(head);

    // 收藏区（顶部）
    var cHead = document.createElement('div');
    Object.assign(cHead.style, { padding: '8px 14px 4px', color: '#e6b64c', fontSize: '12px', fontWeight: '600', flex: '0 0 auto' });
    cHead.textContent = '☆ 已收藏句子';
    panel.appendChild(cHead);
    collectListEl = document.createElement('div');
    Object.assign(collectListEl.style, { overflowY: 'auto', maxHeight: '160px', padding: '0 10px 6px', flex: '0 0 auto' });
    panel.appendChild(collectListEl);

    // 消息区（可滚动）
    var mHead = document.createElement('div');
    Object.assign(mHead.style, { padding: '6px 14px', color: '#8a94a3', fontSize: '12px', borderTop: '1px solid #1e2732', flex: '0 0 auto' });
    mHead.textContent = '对话内容';
    panel.appendChild(mHead);
    msgScroll = document.createElement('div');
    Object.assign(msgScroll.style, { overflowY: 'auto', flex: '1 1 auto', padding: '8px 10px' });
    panel.appendChild(msgScroll);

    // 底部：复制按钮
    var foot = document.createElement('div');
    Object.assign(foot.style, { padding: '10px 14px', borderTop: '1px solid #1e2732', flex: '0 0 auto' });
    var copyBtn = document.createElement('button');
    copyBtn.textContent = '复制全部收藏';
    Object.assign(copyBtn.style, {
      width: '100%', padding: '8px 0', background: '#1b2530', color: '#e6e9ed',
      border: '1px solid #2a3542', borderRadius: '8px', cursor: 'pointer', fontSize: '13px'
    });
    copyBtn.onclick = copyAll;
    foot.appendChild(copyBtn);
    panel.appendChild(foot);

    document.body.appendChild(panel);
    loadCollected().then(renderCollected);
    renderMessages();
  }

  function openReference(sessionId, title) {
    pinnedSessionId = sessionId;
    pinnedTitle = title || '';
    window.__dshReferenceDiag.opened++;
    buildPanel();
    var titleEl = document.getElementById('dsh-reference-title');
    if (titleEl) titleEl.textContent = pinnedTitle;
    loadedMsgs = [];
    msgScroll.innerHTML = '';
    var loading = document.createElement('div');
    loading.textContent = '加载中…';
    Object.assign(loading.style, { padding: '20px', textAlign: 'center', color: '#5b6470' });
    msgScroll.appendChild(loading);
    fetchSessionMessages(sessionId).then(function (msgs) {
      loadedMsgs = msgs;
      renderMessages();
    });
  }

  /** 会话行的「参照」按钮注入 */
  function ensureRowButtons() {
    var rows = document.querySelectorAll('[role="treeitem"]');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.__dshRefBtnInjected) continue;
      var cls = (row.className || '').toString();
      if (cls.indexOf('sessionRow') === -1 && cls.indexOf('projectRow') === -1) continue;
      row.__dshRefBtnInjected = true;
      var btn = document.createElement('button');
      btn.textContent = '参照';
      btn.title = '在右侧打开此对话作为参照';
      Object.assign(btn.style, {
        position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)',
        background: '#1b2530', color: '#8fc1ff', border: '1px solid #2a4a75',
        borderRadius: '6px', fontSize: '10px', padding: '1px 6px', cursor: 'pointer',
        display: 'none', zIndex: '5'
      });
      btn.onclick = function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        // 钉住该会话：用引擎最新活动会话近似（点击行会先打开它）
        var sid = pinnedSessionId;
        var title = (row.innerText || '').split('\\n')[0] || '';
        // 优先从行推断：无 data-session-id，先点击行打开该会话再取 active
        var prev = null;
        try { prev = document.querySelector('[role="treeitem"][aria-selected="true"]'); } catch (e) {}
        row.click();
        setTimeout(function () {
          rpc('session.list', {}).then(function (res) {
            var items = res && res.value && res.value.items ? res.value.items : [];
            var running = items.filter(function (s) { return s.running === true; });
            var pool = running.length > 0 ? running : items;
            pool.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
            var active = pool.length > 0 ? pool[0].sessionId : null;
            openReference(active || sid || '', title);
          });
        }, 600);
      };
      row.style.position = row.style.position || 'relative';
      row.appendChild(btn);
      row.addEventListener('mouseenter', function () { btn.style.display = 'block'; });
      row.addEventListener('mouseleave', function () { btn.style.display = 'none'; });
    }
  }

  // 注入会话行按钮（含动态新增的行）
  ensureRowButtons();
  var mo = new MutationObserver(function () { ensureRowButtons(); });
  mo.observe(document.body, { childList: true, subtree: true });
})()`
