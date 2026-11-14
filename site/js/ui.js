/* Small DOM toolkit used by app.js. Exposes window.UI. */
(function () {
  'use strict';

  // h('div.card', { onclick: fn, title: 'x' }, child, 'text', [more]) -> element
  function h(spec, props) {
    var parts = String(spec).split('.');
    var node = document.createElement(parts[0] || 'div');
    if (parts.length > 1) node.className = parts.slice(1).join(' ');
    var kids = Array.prototype.slice.call(arguments, 2);
    if (props && (typeof props !== 'object' || props.nodeType || Array.isArray(props))) { kids.unshift(props); props = null; }
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
      else if (k === 'style') Object.assign(node.style, v);
      else if (k === 'text') node.textContent = v;
      else if (k in node && k !== 'list' && k !== 'form') node[k] = v;
      else node.setAttribute(k, v === true ? '' : v);
    });
    append(node, kids);
    return node;
  }
  function append(node, kids) {
    kids.forEach(function (k) {
      if (k == null || k === false) return;
      if (Array.isArray(k)) append(node, k);
      else node.appendChild(k.nodeType ? k : document.createTextNode(String(k)));
    });
  }
  function svg(tag, attrs, kids) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function byId(id) { return document.getElementById(id); }

  // A stable colour per player, from their handle.
  function hue(handle) { var x = 0; for (var i = 0; i < handle.length; i++) x = (x * 33 + handle.charCodeAt(i)) % 360; return x; }
  function initialsOf(name) {
    var w = String(name || '?').trim().split(/\s+/);
    return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : (w[0][1] || ''))).toUpperCase();
  }
  function avatar(handle, name, size) {
    size = size || 24;
    return h('span.avatar', {
      'aria-hidden': 'true', text: initialsOf(name),
      style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.42) + 'px', background: 'hsl(' + hue(handle || name) + ' 55% 46%)' }
    });
  }
  function colorOf(handle) { return 'hsl(' + hue(handle) + ' 55% 46%)'; }

  var toastTimer;
  function toast(message, ms) {
    var t = byId('toast');
    t.textContent = message; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 2800);
  }

  function confetti() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var colors = ['#6A4BF2', '#9B86FF', '#F3BD4E', '#4DCB91', '#FF7D7D', '#3DA2E0'];
    var box = h('div.confetti');
    for (var i = 0; i < 100; i++) {
      var bit = h('i', { style: { left: Math.random() * 100 + 'vw', background: colors[i % colors.length],
        animationDuration: (1.9 + Math.random() * 1.5) + 's', animationDelay: (Math.random() * 0.35) + 's' } });
      bit.style.setProperty('--drift', (Math.random() * 180 - 90) + 'px');
      bit.style.setProperty('--spin', (Math.random() * 1000 - 500) + 'deg');
      box.appendChild(bit);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 4200);
  }

  function copy(text) {
    function fallback() {
      var ta = h('textarea', { value: text, style: { position: 'fixed', opacity: '0' } });
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Copied. Paste it in WhatsApp.'); } catch (e) { toast('Could not copy. Select the text and copy it.'); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast('Copied. Paste it in WhatsApp.'); }, fallback);
    else fallback();
  }

  // Phones get the share sheet (WhatsApp is in it); computers open WhatsApp directly.
  function share(text) {
    var touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    if (touch && navigator.share) { navigator.share({ text: text }).catch(function () {}); return; }
    var w = window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
    if (!w) copy(text);
  }
  function whatsappIcon() {
    return svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [svg('path', { d: 'M12 2.2A9.8 9.8 0 0 0 3.6 17l-1.4 4.8 5-1.3A9.8 9.8 0 1 0 12 2.2zm0 17.8a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8.9c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.7-1.8c-.2-.5-.4-.4-.6-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 5 5 0 0 0 1 2.6 11.3 11.3 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6.5-.1 1.4-.6 1.7-1.2.2-.6.2-1 .1-1.2l-.5-.2z' })]);
  }
  function shareButton(label, makeText) {
    return h('button.btn.btn-share.btn-sm', { type: 'button', onclick: function () { share(makeText()); } }, whatsappIcon(), h('span', label));
  }

  // Dates for people: "Sat, Nov 14", "Nov 14", "Sat".
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function asDate(day) { var p = day.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function longDay(day) { var d = asDate(day); return WD[d.getDay()] + ', ' + MO[d.getMonth()] + ' ' + d.getDate(); }
  function shortDay(day) { var d = asDate(day); return MO[d.getMonth()] + ' ' + d.getDate(); }
  function weekday(day) { return WD[asDate(day).getDay()]; }
  function nth(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  function storeGet(key) { try { var v = localStorage.getItem('awg.' + key); return v == null ? null : JSON.parse(v); } catch (e) { return null; } }
  function storeSet(key, value) { try { localStorage.setItem('awg.' + key, JSON.stringify(value)); } catch (e) { /* private mode */ } }

  window.UI = {
    h: h, svg: svg, clear: clear, byId: byId, avatar: avatar, colorOf: colorOf, toast: toast, confetti: confetti,
    copy: copy, share: share, shareButton: shareButton, longDay: longDay, shortDay: shortDay, weekday: weekday, nth: nth,
    storeGet: storeGet, storeSet: storeSet, MONTHS_SHORT: MO
  };
})();
