'use strict';
/* 뷰포트: 확대/이동, 문서 합성 렌더링, 오버레이(격자/선택/커서), 눈금자, 포인터 입력 분배 */
(function (PP) {
  const ZOOM_STEPS = [0.05, 0.1, 0.15, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];
  const MIN_ZOOM = 0.02, MAX_ZOOM = 64;
  const RULER = 20;

  const V = (PP.vp = {
    zoom: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1,
    hover: null, // 마지막 포인터 위치(문서 좌표)
    space: false,
    colors: {},
  });

  let stage, view, overlay, comp, tmp, tmp2, vctx, octx, cctx, tctx, t2ctx, rulerH, rulerV, corner;
  let checkPattern = null;
  let panState = null;
  let activeTool = null;
  let lastMove = null;
  const touches = new Map(); // 활성 터치 포인터(두 손가락 이동/확대용)
  let pinch = null;
  let antsOffset = 0;

  V.init = function () {
    stage = PP.$('#stage');
    view = PP.$('#view');
    overlay = PP.$('#overlay');
    rulerH = PP.$('#ruler-h');
    rulerV = PP.$('#ruler-v');
    corner = PP.$('#ruler-corner');
    comp = document.createElement('canvas');
    tmp = document.createElement('canvas');
    tmp2 = document.createElement('canvas');
    V.coarse = matchMedia('(pointer: coarse)').matches;
    vctx = view.getContext('2d');
    octx = overlay.getContext('2d');
    cctx = comp.getContext('2d');
    tctx = tmp.getContext('2d');
    t2ctx = tmp2.getContext('2d');
    V.stage = stage;

    new ResizeObserver(V.resize).observe(stage);
    overlay.addEventListener('pointerdown', onDown);
    overlay.addEventListener('pointermove', onMove);
    overlay.addEventListener('pointerup', onUp);
    overlay.addEventListener('pointercancel', onUp);
    overlay.addEventListener('pointerleave', () => { if (!activeTool && !panState) { V.hover = null; PP.emit('cursor', null); PP.renderOverlay(); } });
    overlay.addEventListener('contextmenu', (e) => e.preventDefault());
    overlay.addEventListener('dblclick', (e) => {
      const t = PP.tools[PP.state.tool];
      if (t && t.dblclick) t.dblclick(makePt(e));
    });
    overlay.addEventListener('wheel', onWheel, { passive: false });
    PP.on('frame', frame);
    PP.on('theme', readTheme);
    PP.on('view-settings', () => { layoutRulers(); V.resize(); });
    PP.on('doc:new', () => { V.fit(1); });
    PP.on('tool', updateCursor);
    readTheme();
    layoutRulers();
    V.resize();
    setInterval(() => {
      if (PP.sel && PP.sel.hasAny()) { antsOffset = (antsOffset + 1) % 16; PP.renderOverlay(); }
    }, 120);
  };

  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    V.colors = {
      checkA: g('--checker-a') || '#ffffff', checkB: g('--checker-b') || '#cccccc',
      ruler: g('--ruler-bg') || '#2b2d30', rulerText: g('--ruler-text') || '#aaa',
      rulerLine: g('--ruler-line') || '#555', accent: g('--accent') || '#4c8dff',
    };
    checkPattern = null;
  }

  function layoutRulers() {
    const on = PP.state.rulers;
    rulerH.style.display = rulerV.style.display = corner.style.display = on ? '' : 'none';
    PP.$('#workspace').classList.toggle('no-rulers', !on);
  }

  V.resize = function () {
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    V.w = Math.max(1, Math.floor(r.width));
    V.h = Math.max(1, Math.floor(r.height));
    V.dpr = dpr;
    for (const c of [view, overlay, comp, tmp, tmp2]) {
      c.width = Math.round(V.w * dpr);
      c.height = Math.round(V.h * dpr);
    }
    view.style.width = overlay.style.width = V.w + 'px';
    view.style.height = overlay.style.height = V.h + 'px';
    rulerH.width = Math.round(V.w * dpr); rulerH.height = Math.round(RULER * dpr);
    rulerV.width = Math.round(RULER * dpr); rulerV.height = Math.round(V.h * dpr);
    clampPan();
    PP.render();
  };

  // ---------- 좌표 ----------
  V.toScreen = (x, y) => ({ x: V.ox + x * V.zoom, y: V.oy + y * V.zoom });
  V.toDoc = (sx, sy) => ({ x: (sx - V.ox) / V.zoom, y: (sy - V.oy) / V.zoom });
  V.clientToDoc = function (cx, cy) {
    const r = overlay.getBoundingClientRect();
    return V.toDoc(cx - r.left, cy - r.top);
  };
  V.docToClient = function (x, y) {
    const r = overlay.getBoundingClientRect();
    return { x: r.left + V.ox + x * V.zoom, y: r.top + V.oy + y * V.zoom };
  };
  V.visibleDocRect = function () {
    const a = V.toDoc(0, 0), b = V.toDoc(V.w, V.h);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  };

  // ---------- 확대/이동 ----------
  function clampPan() {
    const W = PP.doc.width * V.zoom, H = PP.doc.height * V.zoom;
    const m = 80;
    V.ox = PP.clamp(V.ox, m - W, V.w - m);
    V.oy = PP.clamp(V.oy, m - H, V.h - m);
  }
  V.setZoom = function (z, cx = V.w / 2, cy = V.h / 2) {
    z = PP.clamp(z, MIN_ZOOM, MAX_ZOOM);
    const k = z / V.zoom;
    V.ox = cx - (cx - V.ox) * k;
    V.oy = cy - (cy - V.oy) * k;
    V.zoom = z;
    clampPan();
    PP.emit('zoom', z);
    PP.render();
  };
  V.zoomStep = function (dir, cx, cy) {
    const z = V.zoom;
    let n;
    if (dir > 0) n = ZOOM_STEPS.find((s) => s > z * 1.001) || MAX_ZOOM;
    else n = [...ZOOM_STEPS].reverse().find((s) => s < z * 0.999) || MIN_ZOOM;
    V.setZoom(n, cx, cy);
  };
  V.center = function () {
    V.ox = (V.w - PP.doc.width * V.zoom) / 2;
    V.oy = (V.h - PP.doc.height * V.zoom) / 2;
    PP.render();
  };
  V.fit = function (maxZoom = 8) {
    const pad = 32;
    const z = Math.min((V.w - pad) / PP.doc.width, (V.h - pad) / PP.doc.height, maxZoom);
    V.zoom = PP.clamp(z, MIN_ZOOM, MAX_ZOOM);
    V.center();
    PP.emit('zoom', V.zoom);
  };
  V.actual = function () {
    V.zoom = 1;
    V.center();
    PP.emit('zoom', 1);
  };
  V.panBy = function (dx, dy) {
    V.ox += dx; V.oy += dy;
    clampPan();
    PP.render();
  };

  function onWheel(e) {
    e.preventDefault();
    if (e.shiftKey && !e.ctrlKey) { V.panBy(-(e.deltaY || e.deltaX), 0); return; }
    if (e.altKey && !e.ctrlKey) { V.panBy(0, -e.deltaY); return; }
    const r = overlay.getBoundingClientRect();
    const f = Math.pow(1.0018, -e.deltaY * (e.deltaMode === 1 ? 33 : 1));
    V.setZoom(V.zoom * f, e.clientX - r.left, e.clientY - r.top);
  }

  // ---------- 포인터 입력 ----------
  function makePt(e, forceSnap) {
    const r = overlay.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    let x = (sx - V.ox) / V.zoom, y = (sy - V.oy) / V.zoom;
    const t = PP.tools[PP.state.tool];
    if (PP.state.grid.snap && (forceSnap || (t && t.snap))) {
      const g = PP.state.grid.size;
      x = Math.round(x / g) * g;
      y = Math.round(y / g) * g;
    }
    const pen = e.pointerType === 'pen';
    return {
      x, y, sx, sy, touch: e.pointerType === 'touch',
      pressure: pen ? e.pressure : 1,
      pen,
      shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey,
      button: e.button, buttons: e.buttons,
      time: e.timeStamp,
    };
  }
  V.makePt = makePt;

  function toolFor(e) {
    let t = PP.tools[PP.state.tool];
    if (e.altKey && t && t.altPick !== false && t.name !== 'picker' && e.button === 0) t = PP.tools.picker;
    return t;
  }

  // ---------- 두 손가락: 이동 + 확대/축소 ----------
  function pinchPoints() {
    const r = overlay.getBoundingClientRect();
    const [a, b] = [...touches.values()];
    return { cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top, d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)) };
  }
  function startPinch() {
    V.cancelGesture();
    const p = pinchPoints();
    pinch = { d0: p.d, cx0: p.cx, cy0: p.cy, z0: V.zoom, ox0: V.ox, oy0: V.oy };
  }
  function updatePinch() {
    const p = pinchPoints();
    const z = PP.clamp(pinch.z0 * (p.d / pinch.d0), MIN_ZOOM, MAX_ZOOM);
    const dx = (pinch.cx0 - pinch.ox0) / pinch.z0, dy = (pinch.cy0 - pinch.oy0) / pinch.z0;
    V.zoom = z;
    V.ox = p.cx - dx * z;
    V.oy = p.cy - dy * z;
    clampPan();
    PP.emit('zoom', z);
    PP.render();
  }

  function onDown(e) {
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { e.preventDefault(); try { overlay.setPointerCapture(e.pointerId); } catch (_) { /* 합성 이벤트 */ } startPinch(); return; }
      if (touches.size > 2 || pinch) return;
    }
    if (activeTool || panState) return;
    if (PP.ui.isModalOpen && PP.ui.isModalOpen()) return;
    e.preventDefault();
    PP.commitTextEditor && PP.commitTextEditor(true);
    try { overlay.setPointerCapture(e.pointerId); } catch (_) { /* 합성 이벤트 */ }
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    const tool = PP.tools[PP.state.tool];
    const wantPan = e.button === 1 || V.space || (tool && tool.name === 'hand' && e.button === 0);
    if (wantPan) {
      panState = { x: e.clientX, y: e.clientY, ox: V.ox, oy: V.oy };
      overlay.style.cursor = 'grabbing';
      return;
    }
    const t = toolFor(e);
    if (!t || !t.down) return;
    activeTool = t;
    activeTool._button = e.button;
    lastMove = makePt(e);
    t.down(lastMove);
  }

  function onMove(e) {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch) { if (touches.size >= 2) updatePinch(); return; }
    }
    if (panState) {
      V.ox = panState.ox + (e.clientX - panState.x);
      V.oy = panState.oy + (e.clientY - panState.y);
      clampPan();
      PP.render();
      return;
    }
    const pt = makePt(e);
    V.hover = pt;
    PP.emit('cursor', pt);
    if (activeTool) {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      if (evs.length > 1 && activeTool.move) {
        for (const ce of evs) activeTool.move(makePt(ce));
      } else if (activeTool.move) {
        activeTool.move(pt);
      }
      lastMove = pt;
    } else {
      const t = PP.tools[PP.state.tool];
      if (t && t.hover) t.hover(pt);
    }
    PP.renderOverlay();
  }

  function onUp(e) {
    if (e.pointerType === 'touch') {
      touches.delete(e.pointerId);
      if (pinch) { if (touches.size === 0) pinch = null; return; }
    }
    if (panState) {
      panState = null;
      updateCursor();
      return;
    }
    if (!activeTool) return;
    const t = activeTool;
    activeTool = null;
    const pt = makePt(e);
    // 합쳐진(coalesced) 이동 이벤트로 마지막 위치가 누락되어도 놓은 지점까지 반영
    if (t.move && lastMove && Math.hypot(pt.sx - lastMove.sx, pt.sy - lastMove.sy) > 0.5) t.move(pt);
    lastMove = null;
    if (t.up) t.up(pt);
    PP.renderOverlay();
    updateCursor();
  }

  V.setSpace = function (on) {
    V.space = on;
    updateCursor();
  };
  V.cancelGesture = function () {
    if (activeTool) {
      const c = activeTool.cancelStroke || activeTool.cancel;
      if (c) c.call(activeTool);
    }
    activeTool = null;
    panState = null;
  };
  V.isDrawing = () => !!activeTool;

  function updateCursor() {
    if (!overlay) return;
    const t = PP.tools[PP.state.tool];
    if (V.space) overlay.style.cursor = 'grab';
    else overlay.style.cursor = (t && t.cursor) || 'crosshair';
  }
  V.updateCursor = updateCursor;
  V.setCursor = (c) => { if (overlay && !V.space) overlay.style.cursor = c; };

  // ---------- 렌더링 ----------
  function frame() {
    if (PP.mainDirty) { PP.mainDirty = false; drawMain(); }
    drawOverlay();
    drawRulers();
  }

  function getChecker() {
    if (checkPattern) return checkPattern;
    const s = 8 * V.dpr;
    const c = PP.makeCanvas(s * 2, s * 2);
    const x = c.getContext('2d');
    x.fillStyle = V.colors.checkA; x.fillRect(0, 0, s * 2, s * 2);
    x.fillStyle = V.colors.checkB; x.fillRect(0, 0, s, s); x.fillRect(s, s, s, s);
    checkPattern = vctx.createPattern(c, 'repeat');
    return checkPattern;
  }

  function drawMain() {
    const { dpr, zoom, ox, oy } = V;
    const d = PP.doc;
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.clearRect(0, 0, view.width, view.height);
    vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dw = d.width * zoom, dh = d.height * zoom;

    vctx.save();
    vctx.shadowColor = 'rgba(0,0,0,0.5)';
    vctx.shadowBlur = 14;
    vctx.fillStyle = '#fff';
    vctx.fillRect(ox, oy, dw, dh);
    vctx.restore();

    // 체크무늬(보이는 부분만)
    const vx0 = Math.max(0, ox), vy0 = Math.max(0, oy);
    const vx1 = Math.min(V.w, ox + dw), vy1 = Math.min(V.h, oy + dh);
    if (vx1 > vx0 && vy1 > vy0) {
      const pat = getChecker();
      pat.setTransform(new DOMMatrix().translate(ox, oy).scale(1 / dpr));
      vctx.fillStyle = pat;
      vctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    }

    // 레이어 합성(비트맵 크기 = 화면 크기)
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.clearRect(0, 0, comp.width, comp.height);
    const sx0 = Math.max(0, Math.floor(-ox / zoom)), sy0 = Math.max(0, Math.floor(-oy / zoom));
    const sx1 = Math.min(d.width, Math.ceil((V.w - ox) / zoom)), sy1 = Math.min(d.height, Math.ceil((V.h - oy) / zoom));
    if (sx1 > sx0 && sy1 > sy0) {
      const sw = sx1 - sx0, sh = sy1 - sy0;
      const dx = (ox + sx0 * zoom) * dpr, dy = (oy + sy0 * zoom) * dpr;
      const dW = sw * zoom * dpr, dH = sh * zoom * dpr;
      const sc = zoom * dpr;
      cctx.imageSmoothingEnabled = sc < 2 && sc !== 1;
      cctx.imageSmoothingQuality = 'high';
      for (const l of d.layers) {
        if (!l.visible) continue;
        if (PP.preview.active && PP.preview.layer === l) {
          // 그리는 중인 레이어: 뷰포트 크기 임시 캔버스에서 (레이어 + 스트로크)를 먼저 합성
          const P = PP.preview;
          tctx.setTransform(1, 0, 0, 1, 0, 0);
          tctx.clearRect(0, 0, tmp.width, tmp.height);
          tctx.imageSmoothingEnabled = cctx.imageSmoothingEnabled;
          tctx.imageSmoothingQuality = 'high';
          tctx.globalAlpha = 1;
          tctx.globalCompositeOperation = 'source-over';
          tctx.drawImage(l.canvas, sx0, sy0, sw, sh, dx, dy, dW, dH);
          tctx.save();
          const S = PP.sel;
          let strokeSrc = P.canvas, ssx = sx0, ssy = sy0, ssw = sw, ssh = sh, sdx = dx, sdy = dy, sdw = dW, sdh = dH;
          if (S.poly && !S.mask && !S.float) {
            tctx.setTransform(sc, 0, 0, sc, ox * dpr, oy * dpr);
            S.pathOn(tctx);
            tctx.clip();
            tctx.setTransform(1, 0, 0, 1, 0, 0);
          } else if (S.mask && !S.float) {
            // 마스크 선택: 스트로크를 임시 캔버스에 그리고 마스크로 잘라낸 뒤 합성
            t2ctx.setTransform(1, 0, 0, 1, 0, 0);
            t2ctx.globalAlpha = 1;
            t2ctx.globalCompositeOperation = 'source-over';
            t2ctx.clearRect(0, 0, tmp2.width, tmp2.height);
            t2ctx.imageSmoothingEnabled = cctx.imageSmoothingEnabled;
            t2ctx.drawImage(P.canvas, sx0, sy0, sw, sh, dx, dy, dW, dH);
            t2ctx.globalCompositeOperation = 'destination-in';
            t2ctx.drawImage(S.mask, sx0, sy0, sw, sh, dx, dy, dW, dH);
            strokeSrc = tmp2; ssx = 0; ssy = 0; ssw = tmp2.width; ssh = tmp2.height; sdx = 0; sdy = 0; sdw = tmp2.width; sdh = tmp2.height;
          }
          tctx.globalAlpha = P.opacity;
          tctx.globalCompositeOperation = P.erase ? 'destination-out' : 'source-over';
          tctx.drawImage(strokeSrc, ssx, ssy, ssw, ssh, sdx, sdy, sdw, sdh);
          tctx.restore();
          cctx.globalAlpha = l.opacity;
          cctx.globalCompositeOperation = l.blend;
          cctx.drawImage(tmp, 0, 0);
        } else {
          cctx.globalAlpha = l.opacity;
          cctx.globalCompositeOperation = l.blend;
          cctx.drawImage(l.canvas, sx0, sy0, sw, sh, dx, dy, dW, dH);
        }
        if (PP.sel.float && PP.sel.float.layerId === l.id) {
          cctx.globalAlpha = l.opacity;
          cctx.globalCompositeOperation = l.blend;
          cctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, ox * dpr, oy * dpr);
          cctx.imageSmoothingEnabled = !(PP.sel.float.rot === 0 && sc >= 2);
          PP.sel.drawFloat(cctx);
          cctx.setTransform(1, 0, 0, 1, 0, 0);
          cctx.imageSmoothingEnabled = sc < 2 && sc !== 1;
        }
      }
      cctx.globalAlpha = 1;
      cctx.globalCompositeOperation = 'source-over';
    }
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.drawImage(comp, 0, 0);
  }

  function drawOverlay() {
    const { dpr, zoom, ox, oy } = V;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const d = PP.doc;
    const G = PP.state.grid;

    if (G.show && G.size * zoom >= 4) {
      octx.save();
      octx.beginPath();
      const x0 = Math.max(0, Math.floor(-ox / zoom / G.size)), x1 = Math.min(d.width, (V.w - ox) / zoom);
      const y0 = Math.max(0, Math.floor(-oy / zoom / G.size)), y1 = Math.min(d.height, (V.h - oy) / zoom);
      const top = Math.max(oy, 0), bot = Math.min(oy + d.height * zoom, V.h);
      const left = Math.max(ox, 0), right = Math.min(ox + d.width * zoom, V.w);
      for (let gx = x0 * G.size; gx <= x1; gx += G.size) {
        const sx = Math.round(ox + gx * zoom) + 0.5;
        octx.moveTo(sx, top); octx.lineTo(sx, bot);
      }
      for (let gy = y0 * G.size; gy <= y1; gy += G.size) {
        const sy = Math.round(oy + gy * zoom) + 0.5;
        octx.moveTo(left, sy); octx.lineTo(right, sy);
      }
      octx.strokeStyle = 'rgba(128,128,128,0.55)';
      octx.lineWidth = 1;
      octx.stroke();
      octx.restore();
    }

    // 대칭 축 가이드
    const sym = PP.state.symmetry;
    const tn = PP.state.tool;
    if (sym.mode !== 'none' && (tn === 'brush' || tn === 'pencil' || tn === 'eraser')) {
      octx.save();
      octx.strokeStyle = V.colors.accent;
      octx.globalAlpha = 0.7;
      octx.setLineDash([6, 4]);
      const cx = ox + (d.width / 2) * zoom, cy = oy + (d.height / 2) * zoom;
      octx.beginPath();
      if (sym.mode === 'h' || sym.mode === 'both') { octx.moveTo(cx, oy); octx.lineTo(cx, oy + d.height * zoom); }
      if (sym.mode === 'v' || sym.mode === 'both') { octx.moveTo(ox, cy); octx.lineTo(ox + d.width * zoom, cy); }
      if (sym.mode === 'radial') {
        const R = Math.max(d.width, d.height) * zoom;
        for (let i = 0; i < sym.n; i++) {
          const a = (i * Math.PI) / sym.n;
          octx.moveTo(cx - Math.cos(a) * R, cy - Math.sin(a) * R);
          octx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        }
      }
      octx.stroke();
      octx.restore();
    }

    PP.sel.drawOverlay(octx, V, antsOffset, tn === 'selrect' || tn === 'sellasso');
    const t = PP.tools[tn];
    if (t && t.overlay) t.overlay(octx, V);
    if (t && t.ring && V.hover && !panState && !V.space) drawRing(t);
  }

  function drawRing(t) {
    const size = t.ring();
    if (!size) return;
    const r = (size / 2) * V.zoom;
    const h = V.hover;
    octx.save();
    octx.lineWidth = 1;
    if (r >= 3) {
      octx.beginPath(); octx.arc(h.sx, h.sy, r, 0, Math.PI * 2);
      octx.strokeStyle = 'rgba(0,0,0,0.75)'; octx.stroke();
      octx.beginPath(); octx.arc(h.sx, h.sy, r - 1, 0, Math.PI * 2);
      octx.strokeStyle = 'rgba(255,255,255,0.75)'; octx.stroke();
    }
    octx.beginPath();
    octx.moveTo(h.sx - 4, h.sy + 0.5); octx.lineTo(h.sx + 5, h.sy + 0.5);
    octx.moveTo(h.sx + 0.5, h.sy - 4); octx.lineTo(h.sx + 0.5, h.sy + 5);
    octx.strokeStyle = 'rgba(0,0,0,0.8)'; octx.stroke();
    octx.restore();
  }

  // ---------- 눈금자 ----------
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
    return 10 * p;
  }

  function drawRuler(c, horizontal) {
    if (!PP.state.rulers) return;
    const ctx = c.getContext('2d');
    const { dpr, zoom } = V;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const len = horizontal ? V.w : V.h;
    ctx.clearRect(0, 0, horizontal ? len : RULER, horizontal ? RULER : len);
    ctx.fillStyle = V.colors.ruler;
    ctx.fillRect(0, 0, horizontal ? len : RULER, horizontal ? RULER : len);
    const off = horizontal ? V.ox : V.oy;
    const dl = horizontal ? PP.doc.width : PP.doc.height;
    const major = niceStep(60 / zoom);
    const minorDiv = major >= 10 ? 10 : major >= 5 ? 5 : major >= 2 ? 2 : 1;
    const minor = major / minorDiv;
    ctx.strokeStyle = V.colors.rulerLine;
    ctx.fillStyle = V.colors.rulerText;
    ctx.font = '9px "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const start = Math.max(0, Math.floor(-off / zoom / minor) * minor);
    const end = Math.min(dl, (len - off) / zoom);
    for (let p = start; p <= end + 1e-6; p += minor) {
      const s = Math.round(off + p * zoom) + 0.5;
      const isMajor = Math.abs(p / major - Math.round(p / major)) < 1e-6;
      const tl = isMajor ? RULER : (minorDiv > 2 && Math.abs(p / (major / 2) - Math.round(p / (major / 2))) < 1e-6) ? 8 : 4;
      if (minor * zoom < 3 && !isMajor) continue;
      if (horizontal) { ctx.moveTo(s, RULER - tl); ctx.lineTo(s, RULER); }
      else { ctx.moveTo(RULER - tl, s); ctx.lineTo(RULER, s); }
      if (isMajor) {
        const label = String(Math.round(p));
        if (horizontal) ctx.fillText(label, s + 3, 2);
        else {
          ctx.save();
          ctx.translate(2, s + 3);
          ctx.rotate(-Math.PI / 2);
          ctx.translate(-ctx.measureText(label).width - 3, 0);
          ctx.fillText(label, 0, 0);
          ctx.restore();
        }
      }
    }
    ctx.stroke();
    // 커서 위치 표시
    if (V.hover) {
      ctx.strokeStyle = V.colors.accent;
      ctx.beginPath();
      if (horizontal) { ctx.moveTo(Math.round(V.hover.sx) + 0.5, 0); ctx.lineTo(Math.round(V.hover.sx) + 0.5, RULER); }
      else { ctx.moveTo(0, Math.round(V.hover.sy) + 0.5); ctx.lineTo(RULER, Math.round(V.hover.sy) + 0.5); }
      ctx.stroke();
    }
  }
  function drawRulers() {
    if (!PP.state.rulers) return;
    drawRuler(rulerH, true);
    drawRuler(rulerV, false);
  }
})(window.PP);
