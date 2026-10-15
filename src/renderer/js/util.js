'use strict';
/* 공용 유틸 + 전역 네임스페이스 PP */
window.PP = window.PP || {};
(function (PP) {
  PP.tools = {};
  PP.uid = 0;

  PP.$ = (sel, root = document) => root.querySelector(sel);
  PP.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  PP.el = function (tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (v === true) e.setAttribute(k, '');
        else e.setAttribute(k, v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return e;
  };

  PP.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  PP.lerp = (a, b, t) => a + (b - a) * t;

  // ---------- 이벤트 ----------
  const handlers = {};
  PP.on = (name, fn) => { (handlers[name] = handlers[name] || []).push(fn); };
  PP.emit = (name, ...args) => { (handlers[name] || []).slice().forEach((fn) => fn(...args)); };

  // ---------- 캔버스 ----------
  PP.makeCanvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };
  PP.cropCanvas = function (src, r) {
    const c = PP.makeCanvas(r.w, r.h);
    c.getContext('2d').drawImage(src, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    return c;
  };
  PP.cloneCanvas = (src) => {
    const c = PP.makeCanvas(src.width, src.height);
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  };

  // ---------- 사각형 ----------
  PP.rectUnion = function (a, b) {
    if (!a) return b ? { ...b } : null;
    if (!b) return { ...a };
    const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
    const x1 = Math.max(a.x + a.w, b.x + b.w), y1 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  PP.rectIntersect = function (a, b) {
    const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
    const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
    if (x1 <= x0 || y1 <= y0) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  // 실수 사각형(x0,y0,x1,y1) → 정수 사각형(바깥으로 올림) 후 문서 범위로 자름
  PP.intRect = function (x0, y0, x1, y1, pad = 0) {
    const r = {
      x: Math.floor(Math.min(x0, x1)) - pad,
      y: Math.floor(Math.min(y0, y1)) - pad,
      w: 0, h: 0,
    };
    r.w = Math.ceil(Math.max(x0, x1)) + pad - r.x;
    r.h = Math.ceil(Math.max(y0, y1)) + pad - r.y;
    return r;
  };
  PP.clipToDoc = function (r) {
    return PP.rectIntersect(r, { x: 0, y: 0, w: PP.doc.width, h: PP.doc.height });
  };

  // ---------- 색상 ----------
  PP.hexToRgb = function (hex) {
    let h = String(hex).trim().replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  PP.rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => PP.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  PP.rgbToHsv = function (r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: max ? d / max : 0, v: max };
  };
  PP.hsvToRgb = function (h, s, v) {
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  };
  PP.rgba = (hex, a) => {
    const c = PP.hexToRgb(hex) || { r: 0, g: 0, b: 0 };
    return `rgba(${c.r},${c.g},${c.b},${a})`;
  };

  // ---------- 저장소 ----------
  PP.store = {
    get(key, def) {
      try {
        const v = localStorage.getItem('pp.' + key);
        return v == null ? def : JSON.parse(v);
      } catch (_) { return def; }
    },
    set(key, val) {
      try { localStorage.setItem('pp.' + key, JSON.stringify(val)); } catch (_) { /* 무시 */ }
    },
  };

  // ---------- 토스트 ----------
  let toastTimer = null;
  PP.toast = function (msg, ms = 2200) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  };

  // ---------- 렌더 스케줄 ----------
  // PP.render(): 문서 합성 + 오버레이 모두 다시 그림 / PP.renderOverlay(): 오버레이만
  let renderQueued = false;
  PP.mainDirty = true;
  PP.render = function (mainToo = true) {
    if (mainToo) PP.mainDirty = true;
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      PP.emit('frame');
    });
  };
  PP.renderOverlay = () => PP.render(false);

  PP.debounce = (fn, ms) => {
    let t = null;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  // 캔버스 → Blob / Uint8Array
  PP.canvasToBlob = (canvas, type = 'image/png', q) => new Promise((res) => canvas.toBlob(res, type, q));
  PP.canvasToBytes = async (canvas, type, q) => new Uint8Array(await (await PP.canvasToBlob(canvas, type, q)).arrayBuffer());
  PP.bytesToBitmap = (bytes, mime = '') => createImageBitmap(new Blob([bytes], mime ? { type: mime } : undefined));
})(window.PP);
