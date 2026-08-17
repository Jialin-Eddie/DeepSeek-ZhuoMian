/**
 * 注入官方页面（page world）的功能脚本：
 * - RAIL_SCRIPT   右边的 prompt 轨道（悬停预览 + 点击跳转），基于官方
 *                 `div[data-chat-flow-kind="user"]` 标记，随消息流自动刷新
 * - BTW_SCRIPT    /btw 旁注：composer 里输入 `/btw xxx` + Enter → 拦截并存入
 *                 本机旁注文件，不发给模型、不打断任务
 *
 * 全部走 executeJavaScript，不碰官方 UI 资产。
 */

/** prompt 轨道：右侧竖条，每条横线 = 一条用户提示词 */
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
      gap: '5px', padding: '9px 5px', background: 'rgba(15,17,21,.55)',
      border: '1px solid #2a3542', borderRadius: '10px',
      boxShadow: '0 4px 16px rgba(0,0,0,.3)'
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
        width: len + 'px', height: '4px', border: 'none', borderRadius: '2px',
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

/** /btw 旁注：capture 阶段拦截 composer 的 Enter，把内容存旁注而非发送 */
export const BTW_SCRIPT = `(function () {
  if (window.__dshBtwInstalled) return;
  window.__dshBtwInstalled = true;

  function setComposerValue(ta, v) {
    var proto = HTMLTextAreaElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(ta, v); else ta.value = v;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function onKey(e) {
    if (e.isComposing) return;
    if (e.key !== 'Enter' || e.shiftKey) return;
    var ta = document.querySelector('textarea');
    if (!ta || document.activeElement !== ta) return;
    var v = ta.value || '';
    if (!v.trim().startsWith('/btw')) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var note = v.replace(/^\\/btw\\s*/, '').trim();
    if (note && window.dshDesktop && window.dshDesktop.btwNote) {
      window.dshDesktop.btwNote(note);
    }
    setComposerValue(ta, '');
  }
  document.addEventListener('keydown', onKey, true);
})()`
