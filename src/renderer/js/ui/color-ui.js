'use strict';
/* 색상 패널: HSV 휠, FG/BG, HEX/RGB 입력, 최근 색, 기본 팔레트, 사용자 팔레트 */
(function (PP) {
  const ui = (PP.ui = PP.ui || {});
  const SIZE = 168, CX = 84, CY = 84, R_OUT = 82, R_IN = 63, HALF = 44;
  const DEFAULT_PALETTE = [
    '#000000', '#404040', '#7f7f7f', '#bfbfbf', '#ffffff', '#7f1d1d', '#b91c1c', '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
    '#78350f', '#a16207', '#365314', '#14532d', '#134e4a', '#164e63', '#1e3a8a', '#4c1d95', '#831843', '#fecaca', '#fde68a', '#bbf7d0',
  ];

  let editing = 'fg';
  let hsv = { h: 0, s: 0, v: 0 };
  let canvas, ctx, swFg, swBg, hexIn, rIn, gIn, bIn, recentBox, customBox;
  let dragMode = null;

  function syncHsvFromHex(hex) {
    const c = PP.hexToRgb(hex);
    if (!c) return;
    const n = PP.rgbToHsv(c.r, c.g, c.b);
    hsv = { h: n.s === 0 || n.v === 0 ? hsv.h : n.h, s: n.s, v: n.v };
  }

  function drawWheel() {
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== SIZE * dpr) { canvas.width = SIZE * dpr; canvas.height = SIZE * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    // 색조 링
    const g = ctx.createConicGradient(-Math.PI / 2, CX, CY);
    for (let i = 0; i <= 12; i++) g.addColorStop(i / 12, `hsl(${(i * 30) % 360},100%,50%)`);
    ctx.strokeStyle = g;
    ctx.lineWidth = R_OUT - R_IN;
    ctx.beginPath();
    ctx.arc(CX, CY, (R_OUT + R_IN) / 2, 0, Math.PI * 2);
    ctx.stroke();
    // 채도/명도 사각형
    const x0 = CX - HALF, y0 = CY - HALF, S = HALF * 2;
    ctx.fillStyle = `hsl(${hsv.h},100%,50%)`;
    ctx.fillRect(x0, y0, S, S);
    const wg = ctx.createLinearGradient(x0, 0, x0 + S, 0);
    wg.addColorStop(0, '#fff'); wg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = wg; ctx.fillRect(x0, y0, S, S);
    const bg = ctx.createLinearGradient(0, y0, 0, y0 + S);
    bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, '#000');
    ctx.fillStyle = bg; ctx.fillRect(x0, y0, S, S);
    // 마커
    const ang = (hsv.h * Math.PI) / 180 - Math.PI / 2;
    const rm = (R_OUT + R_IN) / 2;
    marker(CX + Math.cos(ang) * rm, CY + Math.sin(ang) * rm, `hsl(${hsv.h},100%,50%)`);
    const cur = PP.hsvToRgb(hsv.h, hsv.s, hsv.v);
    marker(x0 + hsv.s * S, y0 + (1 - hsv.v) * S, PP.rgbToHex(cur.r, cur.g, cur.b));
  }
  function marker(x, y, fill) {
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2);
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.stroke();
  }

  function applyHsv() {
    const c = PP.hsvToRgb(hsv.h, hsv.s, hsv.v);
    PP.setColor(editing, PP.rgbToHex(c.r, c.g, c.b), 'wheel');
  }

  function wheelPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SIZE, y: ((e.clientY - r.top) / r.height) * SIZE };
  }
  function wheelDrag(e) {
    const p = wheelPoint(e);
    if (dragMode === 'hue') {
      let a = (Math.atan2(p.y - CY, p.x - CX) * 180) / Math.PI + 90;
      if (a < 0) a += 360;
      hsv.h = a % 360;
    } else {
      hsv.s = PP.clamp((p.x - (CX - HALF)) / (HALF * 2), 0, 1);
      hsv.v = PP.clamp(1 - (p.y - (CY - HALF)) / (HALF * 2), 0, 1);
    }
    applyHsv();
    drawWheel();
  }

  function swatchList(box, colors, extra) {
    box.textContent = '';
    for (const c of colors) {
      const b = PP.el('button', { class: 'c', style: { background: c }, title: c.toUpperCase() });
      b.addEventListener('click', (e) => {
        if (extra && extra.remove && (e.altKey || e.ctrlKey)) { extra.remove(c); return; }
        PP.setColor('fg', c);
      });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); PP.setColor('bg', c); });
      box.append(b);
    }
    if (extra && extra.add) box.append(PP.el('button', { class: 'add', text: '+', title: '현재 색을 팔레트에 추가', onclick: extra.add }));
  }

  function refreshAll(which, fromPicker) {
    swFg.style.background = PP.state.fg;
    swBg.style.background = PP.state.bg;
    swFg.classList.toggle('active', editing === 'fg');
    swBg.classList.toggle('active', editing === 'bg');
    if (fromPicker !== 'wheel') syncHsvFromHex(PP.state[editing]);
    const c = PP.hexToRgb(PP.state[editing]);
    if (document.activeElement !== hexIn) hexIn.value = PP.state[editing].toUpperCase();
    if (c) {
      if (document.activeElement !== rIn) rIn.value = c.r;
      if (document.activeElement !== gIn) gIn.value = c.g;
      if (document.activeElement !== bIn) bIn.value = c.b;
    }
    drawWheel();
  }

  ui.initColor = function () {
    const body = PP.$('#panel-color .body');
    canvas = PP.el('canvas', { width: SIZE, height: SIZE });
    ctx = canvas.getContext('2d');
    swFg = PP.el('div', { class: 'sw fg', title: '전경색 (클릭하여 편집)', onclick: () => { editing = 'fg'; refreshAll(); } });
    swBg = PP.el('div', { class: 'sw bg', title: '배경색 (클릭하여 편집)', onclick: () => { editing = 'bg'; refreshAll(); } });
    const mini = PP.el('div', { class: 'cp-mini' },
      PP.el('button', { text: '⇄', title: '전경/배경색 교체 (X)', onclick: () => PP.swapColors() }),
      PP.el('button', { text: '◪', title: '기본 색으로 (D)', onclick: () => PP.resetColors() }));
    const top = PP.el('div', { class: 'cp-top' },
      PP.el('div', { class: 'cp-wheel' }, canvas),
      PP.el('div', { class: 'cp-side' }, PP.el('div', { class: 'cp-sw' }, swBg, swFg), mini));
    hexIn = PP.el('input', { class: 'hex', type: 'text', maxlength: 7, spellcheck: 'false' });
    const num = () => PP.el('input', { type: 'number', min: 0, max: 255 });
    rIn = num(); gIn = num(); bIn = num();
    const fields = PP.el('div', { class: 'cp-fields' },
      PP.el('label', { text: 'HEX' }), hexIn,
      PP.el('label', { text: 'R' }), rIn, PP.el('label', { text: 'G' }), gIn, PP.el('label', { text: 'B' }), bIn);
    recentBox = PP.el('div', { class: 'swatches' });
    customBox = PP.el('div', { class: 'swatches' });
    const defBox = PP.el('div', { class: 'swatches' });
    swatchList(defBox, DEFAULT_PALETTE);
    body.append(top, fields,
      PP.el('div', { class: 'cp-label', text: '최근 사용' }), recentBox,
      PP.el('div', { class: 'cp-label', text: '기본 팔레트' }), defBox,
      PP.el('div', { class: 'cp-label' }, '내 팔레트', PP.el('span', { text: 'Alt+클릭: 삭제', style: { opacity: 0.7 } })), customBox);

    canvas.addEventListener('pointerdown', (e) => {
      const p = wheelPoint(e);
      const d = Math.hypot(p.x - CX, p.y - CY);
      if (d >= R_IN - 1 && d <= R_OUT + 3) dragMode = 'hue';
      else if (Math.abs(p.x - CX) <= HALF + 2 && Math.abs(p.y - CY) <= HALF + 2) dragMode = 'sv';
      else return;
      canvas.setPointerCapture(e.pointerId);
      wheelDrag(e);
    });
    canvas.addEventListener('pointermove', (e) => { if (dragMode) wheelDrag(e); });
    canvas.addEventListener('pointerup', () => { dragMode = null; });

    hexIn.addEventListener('input', () => {
      const v = hexIn.value.startsWith('#') ? hexIn.value : '#' + hexIn.value;
      if (PP.hexToRgb(v) && v.length === 7) PP.setColor(editing, v);
    });
    const rgbInput = () => {
      const v = PP.rgbToHex(+rIn.value || 0, +gIn.value || 0, +bIn.value || 0);
      PP.setColor(editing, v);
    };
    [rIn, gIn, bIn].forEach((i) => i.addEventListener('input', rgbInput));
    [hexIn, rIn, gIn, bIn].forEach((i) => i.addEventListener('blur', () => refreshAll()));

    const refreshPalettes = () => {
      swatchList(recentBox, PP.recent);
      swatchList(customBox, PP.customPalette, {
        add: () => {
          const c = PP.state[editing];
          if (!PP.customPalette.includes(c)) { PP.customPalette.push(c); PP.saveCustomPalette(); }
        },
        remove: (c) => { PP.customPalette = PP.customPalette.filter((x) => x !== c); PP.saveCustomPalette(); },
      });
    };
    PP.on('palette', refreshPalettes);
    PP.on('color', refreshAll);
    refreshPalettes();
    syncHsvFromHex(PP.state.fg);
    refreshAll();
  };
})(window.PP);
