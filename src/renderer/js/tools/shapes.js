'use strict';
/* 도형: 직선, 사각형, 둥근 사각형, 원/타원, 삼각형, 다각형, 화살표, 곡선 */
(function (PP) {
  function styleFor(name, right) {
    const o = PP.opts(name);
    const fg = right ? PP.state.bg : PP.state.fg;
    const bg = right ? PP.state.fg : PP.state.bg;
    const lineOnly = name === 'line' || name === 'arrow' || name === 'curve';
    const mode = lineOnly ? 'stroke' : o.shapeMode;
    return {
      lw: o.lineWidth, mode,
      stroke: mode === 'fill' ? null : fg,
      fill: mode === 'stroke' ? null : (mode === 'fill' ? fg : bg),
      radius: o.radius || 0,
      opacity: o.opacity / 100,
    };
  }

  function paintPath(ctx, st) {
    if (st.fill) { ctx.fillStyle = st.fill; ctx.fill(); }
    if (st.stroke) {
      ctx.lineWidth = st.lw;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = st.stroke;
      ctx.stroke();
    }
  }

  function boxOf(a, b, shift, alt) {
    let dx = b.x - a.x, dy = b.y - a.y;
    if (shift) {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m;
    }
    let x0 = a.x, y0 = a.y, x1 = a.x + dx, y1 = a.y + dy;
    if (alt) { x0 = a.x - dx; y0 = a.y - dy; }
    return { x0, y0, x1, y1 };
  }

  function arrowHead(ctx, a, b, st) {
    const hl = Math.max(14, st.lw * 4.5);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const spread = Math.PI / 7;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - hl * Math.cos(ang - spread), b.y - hl * Math.sin(ang - spread));
    ctx.lineTo(b.x - hl * Math.cos(ang + spread), b.y - hl * Math.sin(ang + spread));
    ctx.closePath();
    ctx.fillStyle = st.stroke;
    ctx.fill();
    ctx.lineWidth = Math.max(1, st.lw * 0.4);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = st.stroke;
    ctx.stroke();
    return hl;
  }

  /** 도형을 ctx에 그리고 변경 영역(정수 사각형)을 반환 */
  function drawShape(ctx, kind, g, st) {
    ctx.save();
    ctx.beginPath();
    let pts = [];
    if (kind === 'line' || kind === 'arrow') {
      let b = g.p1;
      let tail = g.p1;
      if (kind === 'arrow') {
        const L = Math.hypot(g.p1.x - g.p0.x, g.p1.y - g.p0.y);
        const hl = Math.max(14, st.lw * 4.5);
        const k = L > hl * 0.8 ? (L - hl * 0.8) / L : 0;
        tail = { x: g.p0.x + (g.p1.x - g.p0.x) * k, y: g.p0.y + (g.p1.y - g.p0.y) * k };
      }
      ctx.moveTo(g.p0.x, g.p0.y);
      ctx.lineTo(tail.x, tail.y);
      ctx.lineWidth = st.lw; ctx.lineCap = 'round'; ctx.strokeStyle = st.stroke;
      ctx.stroke();
      if (kind === 'arrow') arrowHead(ctx, g.p0, b, st);
      pts = [g.p0, g.p1];
    } else if (kind === 'rect' || kind === 'roundrect') {
      const x = Math.min(g.x0, g.x1), y = Math.min(g.y0, g.y1), w = Math.abs(g.x1 - g.x0), h = Math.abs(g.y1 - g.y0);
      if (kind === 'roundrect') ctx.roundRect(x, y, w, h, Math.min(st.radius, w / 2, h / 2));
      else ctx.rect(x, y, w, h);
      paintPath(ctx, st);
      pts = [{ x: g.x0, y: g.y0 }, { x: g.x1, y: g.y1 }];
    } else if (kind === 'ellipse') {
      const cx = (g.x0 + g.x1) / 2, cy = (g.y0 + g.y1) / 2;
      ctx.ellipse(cx, cy, Math.max(0.01, Math.abs(g.x1 - g.x0) / 2), Math.max(0.01, Math.abs(g.y1 - g.y0) / 2), 0, 0, Math.PI * 2);
      paintPath(ctx, st);
      pts = [{ x: g.x0, y: g.y0 }, { x: g.x1, y: g.y1 }];
    } else if (kind === 'triangle') {
      ctx.moveTo((g.x0 + g.x1) / 2, g.y0);
      ctx.lineTo(g.x1, g.y1);
      ctx.lineTo(g.x0, g.y1);
      ctx.closePath();
      paintPath(ctx, st);
      pts = [{ x: g.x0, y: g.y0 }, { x: g.x1, y: g.y1 }];
    } else if (kind === 'polygon') {
      g.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (g.closed) ctx.closePath();
      if (g.closed) paintPath(ctx, st);
      else if (st.stroke) { ctx.lineWidth = st.lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = st.stroke; ctx.stroke(); }
      pts = g.pts;
    } else if (kind === 'curve') {
      ctx.moveTo(g.p0.x, g.p0.y);
      ctx.bezierCurveTo(g.c1.x, g.c1.y, g.c2.x, g.c2.y, g.p1.x, g.p1.y);
      ctx.lineWidth = st.lw; ctx.lineCap = 'round'; ctx.strokeStyle = st.stroke;
      ctx.stroke();
      pts = [g.p0, g.p1, g.c1, g.c2];
    }
    ctx.restore();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const pad = st.lw + (kind === 'arrow' ? Math.max(14, st.lw * 4.5) : 0) + 4;
    return PP.intRect(x0, y0, x1, y1, Math.ceil(pad));
  }
  PP.drawShape = drawShape;

  const LABELS = { line: '직선', rect: '사각형', roundrect: '둥근 사각형', ellipse: '원/타원', triangle: '삼각형', polygon: '다각형', arrow: '화살표', curve: '곡선' };

  function makeDragShape(kind) {
    const tool = {
      name: kind, label: LABELS[kind], cursor: 'crosshair', snap: true, altPick: false,
      start: null, st: null,
      down(pt) {
        if (!PP.canPaint()) return;
        PP.sel.finish();
        this.start = { x: pt.x, y: pt.y };
        this.st = styleFor(kind, pt.button === 2);
        PP.preview.begin(PP.doc.active(), { opacity: this.st.opacity });
      },
      move(pt) {
        if (!this.start) return;
        PP.preview.clear();
        let geom;
        if (kind === 'line' || kind === 'arrow') {
          let p1 = { x: pt.x, y: pt.y };
          if (pt.shift) {
            const a = Math.round(Math.atan2(p1.y - this.start.y, p1.x - this.start.x) / (Math.PI / 12)) * (Math.PI / 12);
            const L = Math.hypot(p1.x - this.start.x, p1.y - this.start.y);
            p1 = { x: this.start.x + Math.cos(a) * L, y: this.start.y + Math.sin(a) * L };
          }
          geom = { p0: this.start, p1 };
        } else {
          geom = boxOf(this.start, pt, pt.shift, pt.alt);
        }
        this.geom = geom;
        PP.preview.mark(drawShape(PP.preview.ctx, kind, geom, this.st));
        PP.render();
      },
      up() {
        if (!this.start) return;
        this.start = null;
        if (!this.geom) { PP.preview.cancel(); return; }
        this.geom = null;
        PP.preview.commit(LABELS[kind]);
        PP.pushRecent(PP.state.fg);
      },
      cancel() { this.start = null; this.geom = null; PP.preview.cancel(); },
    };
    PP.tools[kind] = tool;
  }
  for (const k of ['line', 'rect', 'roundrect', 'ellipse', 'triangle', 'arrow']) makeDragShape(k);

  // ---------- 다각형 ----------
  PP.tools.polygon = {
    name: 'polygon', label: '다각형', cursor: 'crosshair', snap: true, altPick: false,
    pts: null, hoverPt: null, st: null,
    down(pt) {
      if (!this.pts) {
        if (!PP.canPaint()) return;
        PP.sel.finish();
        this.pts = [{ x: pt.x, y: pt.y }];
        this.st = styleFor('polygon', pt.button === 2);
        PP.preview.begin(PP.doc.active(), { opacity: this.st.opacity });
        this.hoverPt = { x: pt.x, y: pt.y };
        this.redraw();
        return;
      }
      const first = this.pts[0];
      const near = Math.hypot((pt.x - first.x) * PP.vp.zoom, (pt.y - first.y) * PP.vp.zoom) < 9;
      if (near && this.pts.length >= 3) { this.finish(); return; }
      this.pts.push({ x: pt.x, y: pt.y });
      this.redraw();
    },
    hover(pt) {
      if (!this.pts) return;
      this.hoverPt = { x: pt.x, y: pt.y };
      this.redraw();
    },
    move(pt) { this.hover(pt); },
    up() {},
    dblclick() {
      if (!this.pts) return;
      const n = this.pts.length;
      if (n >= 2) {
        const a = this.pts[n - 1], b = this.pts[n - 2];
        if (Math.hypot(a.x - b.x, a.y - b.y) < 3) this.pts.pop();
      }
      this.finish();
    },
    redraw() {
      const P = PP.preview;
      P.clear();
      const pts = [...this.pts, ...(this.hoverPt ? [this.hoverPt] : [])];
      P.mark(drawShape(P.ctx, 'polygon', { pts, closed: false }, this.st));
      PP.render();
    },
    finish() {
      if (!this.pts) return;
      const P = PP.preview;
      if (this.pts.length < 3) { this.cancel(); return; }
      P.clear();
      P.mark(drawShape(P.ctx, 'polygon', { pts: this.pts, closed: true }, this.st));
      this.pts = null; this.hoverPt = null;
      P.commit('다각형');
      PP.pushRecent(PP.state.fg);
    },
    keydown(e) {
      if (!this.pts) return false;
      if (e.key === 'Enter') { this.finish(); return true; }
      return false;
    },
    escape() { if (this.pts) { this.cancel(); return true; } return false; },
    cancel() { this.pts = null; this.hoverPt = null; PP.preview.cancel(); },
    isPending() { return !!this.pts; },
    finishPending() { if (this.pts) this.finish(); },
    cancelPending() { if (this.pts) this.cancel(); },
    deactivate() { if (this.pts) this.finish(); },
    overlay(ctx, vp) {
      if (!this.pts) return;
      ctx.save();
      for (const p of this.pts) {
        const s = vp.toScreen(p.x, p.y);
        ctx.beginPath(); ctx.rect(s.x - 3, s.y - 3, 6, 6);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke();
      }
      ctx.restore();
    },
  };

  // ---------- 곡선 ----------
  PP.tools.curve = {
    name: 'curve', label: '곡선', cursor: 'crosshair', snap: true, altPick: false,
    stage: 0, p0: null, p1: null, c1: null, c2: null, st: null, dragging: false,
    down(pt) {
      const p = { x: pt.x, y: pt.y };
      if (this.stage === 0) {
        if (!PP.canPaint()) return;
        PP.sel.finish();
        this.st = styleFor('curve', pt.button === 2);
        PP.preview.begin(PP.doc.active(), { opacity: this.st.opacity });
        this.p0 = p; this.p1 = p; this.c1 = p; this.c2 = p;
      } else if (this.stage === 1) {
        this.c1 = p; this.c2 = p;
      } else {
        this.c2 = p;
      }
      this.dragging = true;
      this.redraw();
    },
    move(pt) {
      if (!this.dragging) return;
      const p = { x: pt.x, y: pt.y };
      if (this.stage === 0) { this.p1 = p; this.c1 = this.c2 = this.mid(); }
      else if (this.stage === 1) { this.c1 = p; this.c2 = p; }
      else this.c2 = p;
      this.redraw();
    },
    mid() { return { x: (this.p0.x + this.p1.x) / 2, y: (this.p0.y + this.p1.y) / 2 }; },
    up() {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.stage === 0) {
        if (Math.hypot(this.p1.x - this.p0.x, this.p1.y - this.p0.y) < 2) { this.cancel(); return; }
        this.stage = 1;
      } else if (this.stage === 1) this.stage = 2;
      else this.finish();
    },
    dblclick() { if (this.stage > 0) this.finish(); },
    redraw() {
      const P = PP.preview;
      P.clear();
      P.mark(drawShape(P.ctx, 'curve', { p0: this.p0, p1: this.p1, c1: this.c1, c2: this.c2 }, this.st));
      PP.render();
    },
    finish() {
      if (this.stage === 0 && !this.p0) return;
      this.stage = 0; this.dragging = false;
      PP.preview.commit('곡선');
      PP.pushRecent(PP.state.fg);
    },
    keydown(e) {
      if (this.stage > 0 && e.key === 'Enter') { this.finish(); return true; }
      return false;
    },
    escape() { if (this.stage > 0) { this.cancel(); return true; } return false; },
    cancel() { this.stage = 0; this.dragging = false; PP.preview.cancel(); },
    isPending() { return this.stage > 0; },
    finishPending() { if (this.stage > 0) this.finish(); },
    cancelPending() { if (this.stage > 0) this.cancel(); },
    deactivate() { if (this.stage > 0) this.finish(); },
  };
})(window.PP);
