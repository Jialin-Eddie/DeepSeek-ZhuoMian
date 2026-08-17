/**
 * 注入官方页面（page world）的脚本生成器。
 *
 * 全部走 executeJavaScript / contextBridge，不改官方 UI 资产：
 * - READ_SCRIPT       读取当前聚焦输入框的内容（存）
 * - buildToastScript  底部浮条提示（保存/无内容反馈）
 * - buildOverlayScript 便签列表浮层（↑↓ Enter Esc、点击插入、× 删除）
 */

import type { StashItem } from './stashStore'

/** 读取当前聚焦输入框：{ focused, value } */
export const READ_SCRIPT = `(() => {
  const el = document.activeElement;
  const isField = !!el && (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement);
  return {
    focused: isField,
    tag: isField ? el.tagName : null,
    value: isField ? (el.value ?? '') : ''
  };
})()`

/** 清空当前聚焦的输入框（Ctrl+S 保存成功后调用；保持焦点，React 状态同步更新） */
export const CLEAR_SCRIPT = `(() => {
  const byPhase = document.querySelector('textarea[data-phase]');
  const el = byPhase || (document.activeElement && document.activeElement.tagName === 'TEXTAREA' ? document.activeElement : null);
  if (!el) return false;
  const proto = HTMLTextAreaElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc && desc.set) desc.set.call(el, ''); else el.value = '';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus();
  return true;
})()`

/** 关闭便签浮层（主进程主动关：overlay 开着时再按 Ctrl+S） */
export const CLOSE_OVERLAY_SCRIPT = `(() => {
  const el = document.getElementById('dsh-stash-overlay');
  if (el) el.remove();
  return true;
})()`

export function buildToastScript(message: string): string {
  return `(() => {
    const old = document.getElementById('dsh-stash-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.id = 'dsh-stash-toast';
    t.textContent = ${JSON.stringify(message)};
    Object.assign(t.style, {
      position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)',
      zIndex: '2147483647', background: '#1b222c', color: '#e6e9ed',
      border: '1px solid #2a3542', borderRadius: '8px', padding: '8px 14px',
      fontSize: '13px', boxShadow: '0 4px 16px rgba(0,0,0,.4)',
      fontFamily: '-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
      maxWidth: '70vw', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
    });
    document.body.appendChild(t);
    setTimeout(() => { const el = document.getElementById('dsh-stash-toast'); if (el) el.remove(); }, 2200);
  })()`
}

export function buildOverlayScript(items: StashItem[], workspaceTitle: string): string {
  const itemsJson = JSON.stringify(items.map((i) => ({ id: i.id, text: i.text, savedAt: i.savedAt })))
  const titleJson = JSON.stringify(workspaceTitle)
  return `(function (items, title) {
  function close() {
    const el = document.getElementById('dsh-stash-overlay');
    if (el) el.remove();
    try { if (window.dshDesktop && window.dshDesktop.stashClosed) window.dshDesktop.stashClosed(); } catch (e) {}
  }
  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    if (s < 86400 * 7) return Math.floor(s / 86400) + ' 天前';
    const d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }
  function findComposer() {
    const areas = Array.prototype.slice.call(document.querySelectorAll('textarea'));
    const visible = areas.filter(function (a) { return a.getClientRects().length > 0; });
    const pool = visible.length > 0 ? visible : areas;
    if (pool.length === 0) return null;
    pool.sort(function (a, b) {
      return b.getBoundingClientRect().width * b.getBoundingClientRect().height
           - a.getBoundingClientRect().width * a.getBoundingClientRect().height;
    });
    return pool[0];
  }
  function insertText(text) {
    const el = findComposer();
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, text); else el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    return true;
  }

  const old = document.getElementById('dsh-stash-overlay');
  if (old) old.remove();

  const root = document.createElement('div');
  root.id = 'dsh-stash-overlay';
  Object.assign(root.style, {
    position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
    width: '520px', maxWidth: '92vw', maxHeight: '64vh', display: 'flex', flexDirection: 'column',
    background: '#0f1115', color: '#e6e9ed', border: '1px solid #2a3542', borderRadius: '12px',
    zIndex: '2147483647', boxShadow: '0 12px 40px rgba(0,0,0,.55)',
    fontFamily: '-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
    fontSize: '13px', overflow: 'hidden'
  });

  const head = document.createElement('div');
  Object.assign(head.style, {
    display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
    borderBottom: '1px solid #1e2732', flex: '0 0 auto'
  });
  const hTitle = document.createElement('span');
  hTitle.textContent = '提示词便签';
  Object.assign(hTitle.style, { fontWeight: '600' });
  const hWs = document.createElement('span');
  hWs.textContent = title;
  Object.assign(hWs.style, {
    color: '#8a94a3', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1'
  });
  const hCount = document.createElement('span');
  hCount.id = 'dsh-stash-count';
  Object.assign(hCount.style, { color: '#8a94a3', fontSize: '12px' });
  const hClose = document.createElement('button');
  hClose.textContent = '✕';
  Object.assign(hClose.style, {
    background: 'none', border: 'none', color: '#8a94a3', cursor: 'pointer', fontSize: '14px', padding: '2px 6px'
  });
  hClose.onclick = close;
  head.appendChild(hTitle); head.appendChild(hWs); head.appendChild(hCount); head.appendChild(hClose);
  root.appendChild(head);

  const list = document.createElement('div');
  list.tabIndex = -1;
  Object.assign(list.style, { overflowY: 'auto', flex: '1 1 auto', padding: '6px', outline: 'none' });

  let sel = 0;
  function render() {
    list.innerHTML = '';
    hCount.textContent = items.length + ' 条';
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = '这个工作区还没有已保存的提示词';
      Object.assign(empty.style, { padding: '24px', textAlign: 'center', color: '#8a94a3' });
      list.appendChild(empty);
      return;
    }
    items.forEach(function (it, i) {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer',
        background: i === sel ? '#1b2530' : 'transparent'
      });
      const idx = document.createElement('span');
      idx.textContent = String(i + 1).padStart(2, '0');
      Object.assign(idx.style, { color: '#5b6470', fontFamily: 'monospace', fontSize: '11px', flex: '0 0 auto' });
      const body = document.createElement('div');
      Object.assign(body.style, { flex: '1', minWidth: '0' });
      const txt = document.createElement('div');
      txt.textContent = it.text;
      Object.assign(txt.style, { whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '64px', overflow: 'hidden' });
      const meta = document.createElement('div');
      meta.textContent = timeAgo(it.savedAt);
      Object.assign(meta.style, { color: '#5b6470', fontSize: '11px', marginTop: '2px' });
      body.appendChild(txt); body.appendChild(meta);
      const del = document.createElement('button');
      del.textContent = '×';
      Object.assign(del.style, {
        background: 'none', border: 'none', color: '#5b6470', cursor: 'pointer', fontSize: '15px', padding: '2px 6px', flex: '0 0 auto'
      });
      del.title = '删除这条';
      del.onclick = function (ev) {
        ev.stopPropagation();
        if (window.dshDesktop && window.dshDesktop.stashDelete) {
          window.dshDesktop.stashDelete(it.id).then(function (ok) {
            if (!ok) return;
            items.splice(i, 1);
            if (sel >= items.length) sel = Math.max(0, items.length - 1);
            render();
            if (items.length === 0) close();
          });
        }
      };
      row.onclick = function () { if (insertText(it.text)) close(); };
      row.appendChild(idx); row.appendChild(body); row.appendChild(del);
      list.appendChild(row);
    });
  }
  render();
  root.appendChild(list);

  const foot = document.createElement('div');
  foot.textContent = '↑↓ 选择 · Enter 插入 · Esc 关闭 · Ctrl+S 保存当前输入';
  Object.assign(foot.style, {
    padding: '8px 14px', borderTop: '1px solid #1e2732', color: '#5b6470', fontSize: '11px', flex: '0 0 auto'
  });
  root.appendChild(foot);

  document.body.appendChild(root);
  list.focus();

  function move(d) {
    if (items.length === 0) return;
    sel = (sel + d + items.length) % items.length;
    render();
    const rows = list.children;
    if (rows[sel]) rows[sel].scrollIntoView({ block: 'nearest' });
  }
  document.addEventListener('keydown', function onKey(e) {
    if (!document.getElementById('dsh-stash-overlay')) { document.removeEventListener('keydown', onKey); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[sel] && insertText(items[sel].text)) close();
    } else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
})(${itemsJson}, ${titleJson})`
}
