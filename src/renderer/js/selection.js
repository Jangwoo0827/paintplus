'use strict';
/*
 * 선택 영역
 *  - poly : 사각형/자유형 하나(벡터). 핸들로 크기/회전 변형 가능
 *  - mask : 마술봉, 더하기/빼기/교차, 반전 결과(문서 크기 알파 캔버스)
 * 이동/크기/회전은 내용을 '들어올려(lift)' 떠 있는 선택(float)로 만들어 처리하고,
 * 확정(commitFloat) 시 레이어에 합치며 변경 사각형 하나로 히스토리에 기록한다.
 */
(function (PP) {
  PP.commitPending = function () {
    PP.commitTextEditor && PP.commitTextEditor(true);
    const t = PP.tools[PP.state.tool];
    if (t && t.finishPending) t.finishPending();
  };
  PP.cancelPending = function () {
    PP.commitTextEditor && PP.commitTextEditor(false);
    const t = PP.tools[PP.state.tool];
    if (t && t.cancelPending) t.cancelPending();
  };
  PP.pendingActive = function () {
    const t = PP.tools[PP.state.tool];
    return !!((t && t.isPending && t.isPending()) || document.querySelector('.text-editor'));
  };

  const rot = (x, y, a) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });
  const rectPoly = (b) => [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];

  // 마스크 캔버스 도우미
  function polyToMask(poly) {
    const c = PP.makeCanvas(PP.doc.width, PP.doc.height);
    const x = c.getContext('2d');
    x.fillStyle = '#000';
    x.beginPath();
    poly.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y)));
    x.closePath();
    x.fill();
    return c;
  }
  function maskBounds(c) {
    const w = c.width, h = c.height;
    const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        if (d[row + x * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  const sel = (PP.sel = {
    poly: null, // 절대 문서 좌표 [{x,y}]
    mask: null, // 문서 크기 캔버스(알파)
    maskB: null,
    float: null,
    pending: null, // 더하기/빼기 도중 미리 보여 줄 도형
    creating: false,

    hasAny() { return !!(this.poly || this.mask || this.float); },
    hasRegion() { return !!(this.poly || this.mask); },

    // ---------- 영역 설정 ----------
    setRect(x0, y0, x1, y1) {
      const W = PP.doc.width, H = PP.doc.height;
      x0 = PP.clamp(Math.round(x0), 0, W); x1 = PP.clamp(Math.round(x1), 0, W);
      y0 = PP.clamp(Math.round(y0), 0, H); y1 = PP.clamp(Math.round(y1), 0, H);
      const a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(y0, y1), d = Math.max(y0, y1);
      this.mask = null; this.maskB = null;
      this.poly = [{ x: a, y: c }, { x: b, y: c }, { x: b, y: d }, { x: a, y: d }];
      PP.emit('selection');
      PP.renderOverlay();
    },
    setPoly(pts) {
      const W = PP.doc.width, H = PP.doc.height;
      this.mask = null; this.maskB = null;
      this.poly = pts.map((p) => ({ x: PP.clamp(p.x, 0, W), y: PP.clamp(p.y, 0, H) }));
      PP.emit('selection');
      PP.renderOverlay();
    },
    /** 알파 마스크 캔버스를 선택 영역으로 (비어 있으면 선택 해제) */
    setMask(canvas) {
      const b = maskBounds(canvas);
      this.poly = null;
      if (!b) { this.mask = null; this.maskB = null; } else { this.mask = canvas; this.maskB = b; }
      PP.emit('selection');
      PP.renderOverlay();
    },
    /** 현재 선택을 문서 크기 마스크로(복사본) */
    toMask() {
      if (this.mask) return PP.cloneCanvas(this.mask);
      if (this.poly) return polyToMask(this.poly);
      return PP.makeCanvas(PP.doc.width, PP.doc.height);
    },
    /** mode: replace | add | sub | inter. shapeMask = 새 영역(문서 크기 캔버스) */
    combine(shapeMask, mode) {
      if (mode === 'replace' || !this.hasRegion()) { this.setMask(shapeMask); this.simplifyIfRect(); return; }
      const base = this.toMask();
      const x = base.getContext('2d');
      x.globalCompositeOperation = mode === 'add' ? 'source-over' : mode === 'sub' ? 'destination-out' : 'destination-in';
      x.drawImage(shapeMask, 0, 0);
      this.setMask(base);
    },
    simplifyIfRect() { /* 마스크 그대로 유지 (벡터 변환 불필요) */ },
    invert() {
      this.finish();
      if (!this.hasRegion()) { this.selectAll(); }
      const m = PP.makeCanvas(PP.doc.width, PP.doc.height);
      const x = m.getContext('2d');
      x.fillStyle = '#000';
      x.fillRect(0, 0, m.width, m.height);
      x.globalCompositeOperation = 'destination-out';
      x.drawImage(this.toMask(), 0, 0);
      this.setMask(m);
    },
    selectAll() {
      this.finish();
      this.setRect(0, 0, PP.doc.width, PP.doc.height);
    },
    bounds() {
      if (this.mask) return this.maskB ? PP.clipToDoc(this.maskB) : null;
      if (!this.poly) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of this.poly) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      return PP.clipToDoc(PP.intRect(x0, y0, x1, y1));
    },
    boundsOrDoc() { return this.bounds() || { x: 0, y: 0, w: PP.doc.width, h: PP.doc.height }; },

    pathOn(ctx, dx = 0, dy = 0) {
      ctx.beginPath();
      this.poly.forEach((p, i) => (i ? ctx.lineTo(p.x - dx, p.y - dy) : ctx.moveTo(p.x - dx, p.y - dy)));
      ctx.closePath();
    },
    /** rect 영역에서 선택된 곳만 불투명한 마스크 캔버스(rect 크기) */
    regionMask(rect) {
      const c = PP.makeCanvas(rect.w, rect.h);
      const x = c.getContext('2d');
      if (this.mask) x.drawImage(this.mask, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
      else if (this.poly) { x.fillStyle = '#000'; this.pathOn(x, rect.x, rect.y); x.fill(); }
      return c;
    },
    /** source 의 r 영역을 선택 영역 안에서만 ctx(문서 좌표)에 그린다. 호출 전 ctx 의 alpha/합성 모드를 설정해 둘 것 */
    drawClipped(ctx, source, r) {
      if (this.float || !this.hasRegion()) {
        ctx.drawImage(source, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      } else if (this.poly) {
        ctx.save();
        this.pathOn(ctx);
        ctx.clip();
        ctx.drawImage(source, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
        ctx.restore();
      } else {
        const t = PP.cropCanvas(source, r);
        const tx = t.getContext('2d');
        tx.globalCompositeOperation = 'destination-in';
        tx.drawImage(this.mask, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
        ctx.drawImage(t, r.x, r.y);
      }
    },
    inside(pt) {
      if (this.mask) {
        const x = Math.floor(pt.x), y = Math.floor(pt.y);
        if (x < 0 || y < 0 || x >= this.mask.width || y >= this.mask.height) return false;
        return this.mask.getContext('2d', { willReadFrequently: true }).getImageData(x, y, 1, 1).data[3] > 8;
      }
      const P = this.poly;
      if (!P) return false;
      let c = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        if ((P[i].y > pt.y) !== (P[j].y > pt.y) && pt.x < ((P[j].x - P[i].x) * (pt.y - P[i].y)) / (P[j].y - P[i].y) + P[i].x) c = !c;
      }
      return c;
    },

    // ---------- 확정 / 취소 ----------
    finish() {
      PP.commitPending();
      this.commitFloat();
    },
    deselect() {
      this.finish();
      if (this.poly || this.mask) { this.poly = null; this.mask = null; this.maskB = null; PP.emit('selection'); }
      PP.renderOverlay();
    },
    beforeHistory() {
      PP.cancelPending();
      this.cancelFloat();
    },

    // ---------- 떠 있는 선택 ----------
    frame() {
      const f = this.float;
      if (f) return { cx: f.cx, cy: f.cy, w: f.w, h: f.h, rot: f.rot };
      const b = this.bounds();
      if (!b) return null;
      return { cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h, rot: 0 };
    },

    lift() {
      if (this.float) return true;
      if (!this.hasRegion()) return false;
      if (!PP.canPaint()) return false;
      const layer = PP.doc.active();
      const b = this.bounds();
      if (!b) return false;
      const orig = PP.cropCanvas(layer.canvas, b);
      const content = PP.cloneCanvas(orig);
      const rm = this.regionMask(b);
      const cx = content.getContext('2d');
      cx.globalCompositeOperation = 'destination-in';
      cx.drawImage(rm, 0, 0);
      const lc = layer.ctx;
      lc.save();
      lc.globalCompositeOperation = 'destination-out';
      lc.drawImage(rm, b.x, b.y);
      lc.restore();
      const mx = b.x + b.w / 2, my = b.y + b.h / 2;
      const outline = this.poly || rectPoly(b);
      this.float = {
        canvas: content, nw: b.w, nh: b.h, w: b.w, h: b.h, cx: mx, cy: my, rot: 0,
        base: outline.map((p) => ({ x: p.x - mx, y: p.y - my })),
        layerId: layer.id, srcRect: b, origCrop: orig, moved: false, srcMask: this.mask, srcMaskB: this.maskB,
      };
      this.mask = null; this.maskB = null;
      this.poly = outline;
      PP.doc.touch(layer);
      return true;
    },

    /** 붙여넣기 등: 원본 없이 새 float 생성 */
    startFloat(canvas, x, y) {
      this.finish();
      if (!PP.canPaint()) return false;
      const w = canvas.width, h = canvas.height;
      const mx = x + w / 2, my = y + h / 2;
      this.mask = null; this.maskB = null;
      this.float = {
        canvas, nw: w, nh: h, w, h, cx: mx, cy: my, rot: 0,
        base: [{ x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 }, { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }],
        layerId: PP.doc.activeId, srcRect: null, origCrop: null, moved: true, pasted: true,
      };
      this.syncPoly();
      PP.emit('selection');
      PP.render();
      return true;
    },

    syncPoly() {
      const f = this.float;
      if (!f) return;
      const sx = f.w / f.nw, sy = f.h / f.nh;
      this.poly = f.base.map((p) => {
        const r = rot(p.x * sx, p.y * sy, f.rot);
        return { x: f.cx + r.x, y: f.cy + r.y };
      });
    },

    floatBounds(f = this.float) {
      const sx = f.w / f.nw, sy = f.h / f.nh;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [px, py] of [[-f.nw / 2, -f.nh / 2], [f.nw / 2, -f.nh / 2], [f.nw / 2, f.nh / 2], [-f.nw / 2, f.nh / 2]]) {
        const r = rot(px * sx, py * sy, f.rot);
        x0 = Math.min(x0, f.cx + r.x); x1 = Math.max(x1, f.cx + r.x);
        y0 = Math.min(y0, f.cy + r.y); y1 = Math.max(y1, f.cy + r.y);
      }
      return PP.intRect(x0, y0, x1, y1, 1);
    },

    drawFloat(ctx, f = this.float) {
      if (!f) return;
      ctx.save();
      ctx.translate(f.cx, f.cy);
      ctx.rotate(f.rot);
      ctx.drawImage(f.canvas, -f.w / 2, -f.h / 2, f.w, f.h);
      ctx.restore();
    },

    /** 떠 있는 선택을 좌우/상하 뒤집기, 90° 회전 */
    flipFloat(horizontal) {
      if (!this.lift()) return;
      const f = this.float;
      const c = PP.makeCanvas(f.nw, f.nh);
      const x = c.getContext('2d');
      if (horizontal) { x.translate(f.nw, 0); x.scale(-1, 1); } else { x.translate(0, f.nh); x.scale(1, -1); }
      x.drawImage(f.canvas, 0, 0);
      f.canvas = c;
      f.base = f.base.map((p) => (horizontal ? { x: -p.x, y: p.y } : { x: p.x, y: -p.y }));
      f.moved = true;
      this.syncPoly();
      PP.render();
    },
    rotateFloat90() {
      if (!this.lift()) return;
      this.float.rot += Math.PI / 2;
      this.float.moved = true;
      this.syncPoly();
      PP.render();
    },

    /** draw=false 이면 내용을 버린다(삭제) */
    commitFloat(draw = true) {
      const f = this.float;
      if (!f) return;
      this.float = null;
      const layer = PP.doc.byId(f.layerId);
      if (!layer) return;
      let rect = draw ? this.floatBounds(f) : null;
      if (f.srcRect) rect = PP.rectUnion(rect, f.srcRect);
      rect = rect && PP.clipToDoc(rect);
      if (!rect) { PP.doc.touch(layer); return; }
      const before = PP.cropCanvas(layer.canvas, rect);
      if (f.origCrop) {
        const bx = before.getContext('2d');
        bx.clearRect(f.srcRect.x - rect.x, f.srcRect.y - rect.y, f.srcRect.w, f.srcRect.h);
        bx.drawImage(f.origCrop, f.srcRect.x - rect.x, f.srcRect.y - rect.y);
      }
      if (draw) {
        const c = layer.ctx;
        c.save();
        c.imageSmoothingEnabled = !(f.rot === 0 && f.w === f.nw && f.h === f.nh);
        c.imageSmoothingQuality = 'high';
        this.drawFloat(c, f);
        c.restore();
      }
      const name = !draw ? '선택 영역 삭제' : f.pasted ? '붙여넣기' : f.moved ? '선택 영역 이동/변형' : '선택 영역 이동';
      PP.history.pushSwap(layer.id, rect, before, name);
      PP.doc.touch(layer);
      PP.renderOverlay();
    },

    /** 실행 취소 등에서: 떠 있는 선택을 원래대로 되돌리고 기록하지 않는다 */
    cancelFloat() {
      const f = this.float;
      if (!f) return;
      this.float = null;
      const layer = PP.doc.byId(f.layerId);
      if (layer && f.origCrop) {
        layer.ctx.clearRect(f.srcRect.x, f.srcRect.y, f.srcRect.w, f.srcRect.h);
        layer.ctx.drawImage(f.origCrop, f.srcRect.x, f.srcRect.y);
        PP.doc.touch(layer);
      }
      if (f.srcMask) {
        this.mask = f.srcMask; this.maskB = f.srcMaskB; this.poly = null;
      } else if (f.srcRect) {
        const mx = f.srcRect.x + f.srcRect.w / 2, my = f.srcRect.y + f.srcRect.h / 2;
        this.poly = f.base.map((p) => ({ x: p.x + mx, y: p.y + my }));
      } else {
        this.poly = null;
      }
      PP.emit('selection');
      PP.render();
    },

    /** 선택 영역 내용(없으면 레이어 전체)을 캔버스로. 반환 {canvas, x, y} */
    extract() {
      if (this.float) {
        const b = this.floatBounds();
        const c = PP.makeCanvas(b.w, b.h);
        const x = c.getContext('2d');
        x.translate(-b.x, -b.y);
        x.imageSmoothingQuality = 'high';
        this.drawFloat(x);
        return { canvas: c, x: b.x, y: b.y };
      }
      const layer = PP.doc.active();
      if (!this.hasRegion()) return { canvas: PP.cloneCanvas(layer.canvas), x: 0, y: 0 };
      const b = this.bounds();
      if (!b) return null;
      const c = PP.cropCanvas(layer.canvas, b);
      const x = c.getContext('2d');
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(this.regionMask(b), 0, 0);
      return { canvas: c, x: b.x, y: b.y };
    },

    /** 선택 영역 내용을 지움 (float 이면 버림) */
    clearContent() {
      if (this.float) { this.commitFloat(false); return true; }
      if (!this.hasRegion()) return false;
      if (!PP.canPaint()) return false;
      const b = this.bounds();
      if (!b) return false;
      const layer = PP.doc.active();
      const rm = this.regionMask(b);
      PP.history.pixelOp(layer, b, '선택 영역 삭제', () => {
        const c = layer.ctx;
        c.save();
        c.globalCompositeOperation = 'destination-out';
        c.drawImage(rm, b.x, b.y);
        c.restore();
      });
      return true;
    },

    // ---------- 핸들 ----------
    handles(zoom) {
      const fr = this.frame();
      if (!fr) return [];
      const out = [];
      for (const hy of [-1, 0, 1]) {
        for (const hx of [-1, 0, 1]) {
          if (!hx && !hy) continue;
          const r = rot((hx * fr.w) / 2, (hy * fr.h) / 2, fr.rot);
          out.push({ type: 'scale', hx, hy, x: fr.cx + r.x, y: fr.cy + r.y });
        }
      }
      const r = rot(0, -fr.h / 2 - 26 / zoom, fr.rot);
      out.push({ type: 'rotate', hx: 0, hy: -1, x: fr.cx + r.x, y: fr.cy + r.y });
      return out;
    },
    hitHandle(pt) {
      const z = PP.vp.zoom;
      let best = null, bd = pt && pt.touch ? 22 : 9;
      for (const h of this.handles(z)) {
        const d = Math.hypot((h.x - pt.x) * z, (h.y - pt.y) * z);
        if (d <= bd) { bd = d; best = h; }
      }
      return best;
    },

    // ---------- 오버레이 ----------
    drawOverlay(ctx, vp, ants, showHandles) {
      const strokePoly = (poly, dashed) => {
        ctx.save();
        const path = () => {
          ctx.beginPath();
          poly.forEach((p, i) => {
            const s = vp.toScreen(p.x, p.y);
            if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y);
          });
          ctx.closePath();
        };
        path();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        path();
        ctx.setLineDash([5, 5]);
        ctx.lineDashOffset = -ants;
        ctx.strokeStyle = dashed ? vp.colors.accent : '#000';
        ctx.stroke();
        ctx.restore();
      };
      if (this.mask) drawMaskAnts(ctx, vp, this.mask, ants);
      if (this.poly) strokePoly(this.poly, false);
      if (this.pending) strokePoly(this.pending, true);
      if (!this.hasRegion()) return;
      if (showHandles && !this.creating) {
        const fr = this.frame();
        if (!fr) return;
        ctx.save();
        ctx.strokeStyle = vp.colors.accent;
        ctx.lineWidth = 1;
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([hx, hy]) => {
          const r = rot((hx * fr.w) / 2, (hy * fr.h) / 2, fr.rot);
          return vp.toScreen(fr.cx + r.x, fr.cy + r.y);
        });
        ctx.beginPath();
        corners.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
        ctx.closePath();
        ctx.stroke();
        const hs = this.handles(vp.zoom);
        const top = hs.find((h) => h.type === 'scale' && h.hx === 0 && h.hy === -1);
        const rh = hs.find((h) => h.type === 'rotate');
        const a = vp.toScreen(top.x, top.y), b = vp.toScreen(rh.x, rh.y);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        const big = PP.vp.coarse ? 7 : 4;
        for (const h of hs) {
          const s = vp.toScreen(h.x, h.y);
          ctx.beginPath();
          if (h.type === 'rotate') ctx.arc(s.x, s.y, big + 1, 0, Math.PI * 2);
          else ctx.rect(s.x - big, s.y - big, big * 2, big * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
    },
  });

  // ---------- 마스크 외곽선(마칭 앤츠): 화면 해상도에서 경계 1px 를 뽑아 점선 패턴으로 칠한다 ----------
  let antA = null, antB = null, antPat = null;
  function drawMaskAnts(ctx, vp, mask, ants) {
    const dpr = vp.dpr, W = ctx.canvas.width, H = ctx.canvas.height;
    if (!antA || antA.width !== W || antA.height !== H) {
      antA = PP.makeCanvas(W, H); antB = PP.makeCanvas(W, H);
      const p = PP.makeCanvas(16, 16);
      const px = p.getContext('2d');
      px.fillStyle = '#fff'; px.fillRect(0, 0, 16, 16);
      px.fillStyle = '#000';
      for (let i = -16; i < 32; i += 16) { px.beginPath(); px.moveTo(i, 16); px.lineTo(i + 8, 16); px.lineTo(i + 24, 0); px.lineTo(i + 16, 0); px.fill(); }
      antPat = p;
    }
    const a = antA.getContext('2d'), b = antB.getContext('2d');
    a.setTransform(1, 0, 0, 1, 0, 0);
    a.globalCompositeOperation = 'source-over';
    a.clearRect(0, 0, W, H);
    a.imageSmoothingEnabled = false;
    a.drawImage(mask, 0, 0, mask.width, mask.height, vp.ox * dpr, vp.oy * dpr, mask.width * vp.zoom * dpr, mask.height * vp.zoom * dpr);
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalCompositeOperation = 'source-over';
    b.clearRect(0, 0, W, H);
    b.drawImage(antA, 0, 0);
    b.globalCompositeOperation = 'destination-in';
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.drawImage(antA, dx, dy);
    a.globalCompositeOperation = 'destination-out';
    a.drawImage(antB, 0, 0);
    a.globalCompositeOperation = 'source-in';
    a.fillStyle = a.createPattern(antPat, 'repeat');
    a.save();
    a.translate((ants % 16) * dpr, 0);
    a.fillRect(-16 * dpr, 0, W + 32 * dpr, H);
    a.restore();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(antA, 0, 0);
    ctx.restore();
  }

  // ---------- 드래그 상호작용(사각형/자유형 공용) ----------
  const CURSORS = { '-1,-1': 'nwse-resize', '1,1': 'nwse-resize', '1,-1': 'nesw-resize', '-1,1': 'nesw-resize', '0,-1': 'ns-resize', '0,1': 'ns-resize', '-1,0': 'ew-resize', '1,0': 'ew-resize' };

  /** 선택 방식: 옵션바의 모드 + Shift(더하기)/Alt(빼기)/Shift+Alt(교차) */
  PP.selModeFor = function (pt) {
    if (pt && pt.shift && pt.alt) return 'inter';
    if (pt && pt.shift) return 'add';
    if (pt && pt.alt) return 'sub';
    return PP.state.selMode || 'replace';
  };

  function makeSelTool(name, label, lasso) {
    const tool = {
      name, label, cursor: 'crosshair', snap: true, altPick: false,
      mode: null, start: null, pts: null, drag: null, cmode: 'replace',

      down(pt) {
        PP.commitTextEditor && PP.commitTextEditor(true);
        const cm = PP.selModeFor(pt);
        if (sel.hasAny() && cm === 'replace') {
          const h = sel.hitHandle(pt);
          if (h) {
            this.mode = 'xform';
            this.drag = { h, pt, fr: sel.frame(), started: false };
            return;
          }
          if (sel.inside(pt)) {
            this.mode = 'move';
            this.drag = { pt, fr: sel.frame(), started: false };
            return;
          }
          sel.deselect();
        } else if (sel.hasAny()) {
          sel.finish();
        }
        this.cmode = cm;
        this.mode = 'create';
        sel.creating = true;
        this.start = { x: pt.x, y: pt.y };
        this.pts = [{ x: pt.x, y: pt.y }];
        if (cm === 'replace') { sel.poly = null; sel.mask = null; sel.maskB = null; }
      },

      shape(pt) {
        if (lasso) return this.pts.map((p) => ({ x: p.x, y: p.y }));
        let x1 = pt.x, y1 = pt.y;
        if (pt.shift && this.cmode === 'replace') {
          const m = Math.max(Math.abs(x1 - this.start.x), Math.abs(y1 - this.start.y));
          x1 = this.start.x + Math.sign(x1 - this.start.x || 1) * m;
          y1 = this.start.y + Math.sign(y1 - this.start.y || 1) * m;
        }
        const W = PP.doc.width, H = PP.doc.height;
        const a = PP.clamp(Math.round(Math.min(this.start.x, x1)), 0, W), b = PP.clamp(Math.round(Math.max(this.start.x, x1)), 0, W);
        const c = PP.clamp(Math.round(Math.min(this.start.y, y1)), 0, H), d = PP.clamp(Math.round(Math.max(this.start.y, y1)), 0, H);
        return [{ x: a, y: c }, { x: b, y: c }, { x: b, y: d }, { x: a, y: d }];
      },

      move(pt) {
        if (this.mode === 'create') {
          if (lasso) {
            const last = this.pts[this.pts.length - 1];
            if (Math.hypot(pt.x - last.x, pt.y - last.y) >= 0.8 / Math.max(PP.vp.zoom, 0.25)) this.pts.push({ x: pt.x, y: pt.y });
            if (this.pts.length < 2) return;
          }
          const s = this.shape(pt);
          if (this.cmode === 'replace') sel.poly = s; else sel.pending = s;
          PP.renderOverlay();
        } else if (this.mode === 'move') {
          const d = this.drag;
          let dx = pt.x - d.pt.x, dy = pt.y - d.pt.y;
          if (!d.started && Math.hypot(dx, dy) * PP.vp.zoom < 2) return;
          if (!d.started) {
            if (!sel.lift()) { this.mode = null; return; }
            d.started = true;
          }
          if (pt.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
          sel.float.cx = d.fr.cx + Math.round(dx);
          sel.float.cy = d.fr.cy + Math.round(dy);
          sel.float.moved = true;
          sel.syncPoly();
          PP.render();
        } else if (this.mode === 'xform') {
          const d = this.drag;
          if (!d.started) {
            if (Math.hypot(pt.x - d.pt.x, pt.y - d.pt.y) * PP.vp.zoom < 2) return;
            if (!sel.lift()) { this.mode = null; return; }
            d.started = true;
            d.fr = sel.frame();
          }
          this.transform(pt);
          PP.render();
        }
      },

      transform(pt) {
        const f = sel.float, d = this.drag, fr = d.fr, h = d.h;
        f.moved = true;
        if (h.type === 'rotate') {
          let a = Math.atan2(pt.y - fr.cy, pt.x - fr.cx) + Math.PI / 2;
          if (pt.shift) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
          f.rot = a;
        } else {
          const l = rot(pt.x - fr.cx, pt.y - fr.cy, -fr.rot);
          let nw = fr.w, nh = fr.h;
          const ax = (-h.hx * fr.w) / 2, ay = (-h.hy * fr.h) / 2;
          if (h.hx) nw = Math.max(2, (l.x - ax) * h.hx);
          if (h.hy) nh = Math.max(2, (l.y - ay) * h.hy);
          if (pt.shift && h.hx && h.hy) {
            const k = Math.max(nw / fr.w, nh / fr.h);
            nw = fr.w * k; nh = fr.h * k;
          }
          const clx = h.hx ? ax + (h.hx * nw) / 2 : 0;
          const cly = h.hy ? ay + (h.hy * nh) / 2 : 0;
          const r = rot(clx, cly, fr.rot);
          f.w = nw; f.h = nh; f.cx = fr.cx + r.x; f.cy = fr.cy + r.y;
        }
        sel.syncPoly();
      },

      up(pt) {
        if (this.mode === 'create') {
          sel.creating = false;
          const s = this.shape(pt || this.start);
          const bad = lasso ? this.pts.length < 3 : (Math.abs(s[2].x - s[0].x) < 2 && Math.abs(s[2].y - s[0].y) < 2);
          if (this.cmode === 'replace') {
            sel.poly = bad ? null : s;
            if (!bad && lasso) sel.setPoly(this.pts);
          } else {
            sel.pending = null;
            if (!bad) sel.combine(polyToMask(s), this.cmode);
          }
          PP.emit('selection');
        }
        this.mode = null; this.drag = null;
        PP.renderOverlay();
      },

      cancel() { sel.creating = false; sel.pending = null; this.mode = null; },

      hover(pt) {
        let c = 'crosshair';
        if (sel.hasAny() && PP.selModeFor(pt) === 'replace') {
          const h = sel.hitHandle(pt);
          if (h) c = h.type === 'rotate' ? 'grab' : CURSORS[h.hx + ',' + h.hy];
          else if (sel.inside(pt)) c = 'move';
        }
        PP.vp.setCursor(c);
      },

      keydown(e) {
        if (!sel.hasAny()) return false;
        const step = e.shiftKey ? 10 : 1;
        const dir = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (dir) {
          if (!sel.lift()) return true;
          sel.float.cx += dir[0]; sel.float.cy += dir[1]; sel.float.moved = true;
          sel.syncPoly();
          PP.render();
          return true;
        }
        if (e.key === 'Enter') { sel.commitFloat(); PP.renderOverlay(); return true; }
        return false;
      },
    };
    PP.tools[name] = tool;
  }
  makeSelTool('selrect', '사각형 선택', false);
  makeSelTool('sellasso', '자유형 선택', true);
  PP.polyToMask = polyToMask;


  // ---------- 자유 변형: 레이어 내용(또는 현재 선택)을 떠 있는 선택으로 만들어 핸들로 이동/크기/회전 ----------
  function contentBounds(layer) {
    const w = layer.canvas.width, h = layer.canvas.height;
    const d = layer.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        if (d[row + x * 4 + 3]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  PP.freeTransform = function () {
    sel.finish();
    if (!PP.canPaint()) return;
    if (!sel.hasRegion()) {
      const b = contentBounds(PP.doc.active());
      if (!b) { PP.toast('변형할 내용이 없습니다'); return; }
      sel.setRect(b.x, b.y, b.x + b.w, b.y + b.h);
    }
    PP.selectTool('selrect');
    if (sel.lift()) {
      PP.render();
      PP.toast('핸들로 크기·회전, 드래그로 이동 — Enter 로 확정');
    }
  };

  PP.on('doc:new', () => { sel.poly = null; sel.mask = null; sel.maskB = null; sel.float = null; PP.emit('selection'); });
  PP.on('doc:structure', () => {
    if (sel.float && !PP.doc.byId(sel.float.layerId)) sel.float = null;
    // 캔버스 크기가 바뀌면 마스크 크기도 맞지 않으므로 해제
    if (sel.mask && (sel.mask.width !== PP.doc.width || sel.mask.height !== PP.doc.height)) { sel.mask = null; sel.maskB = null; }
  });
})(window.PP);
