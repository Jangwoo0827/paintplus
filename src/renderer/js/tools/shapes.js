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

  /*
   * 확정 전 편집: 도형을 그린 뒤에도 미리보기 상태로 남겨 두고
   *  - 핸들 드래그: 크기/모양 변경 (사각형류 8개, 직선·화살표 양 끝, 다각형 꼭짓점, 곡선 제어점)
   *  - 도형 안 드래그: 이동
   *  - 옵션/색 변경: 즉시 반영
   *  - Enter, 바깥 클릭(새 도형), 도구/레이어 전환: 확정 · Esc: 취소
   */
  const BOX_KINDS = ['rect', 'roundrect', 'ellipse', 'triangle'];

  function norm(g) {
    return { x0: Math.min(g.x0, g.x1), y0: Math.min(g.y0, g.y1), x1: Math.max(g.x0, g.x1), y1: Math.max(g.y0, g.y1) };
  }
  function handlesOf(kind, g) {
    if (BOX_KINDS.includes(kind)) {
      const b = norm(g), mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
      return [
        { id: 'nw', x: b.x0, y: b.y0 }, { id: 'n', x: mx, y: b.y0 }, { id: 'ne', x: b.x1, y: b.y0 },
        { id: 'e', x: b.x1, y: my }, { id: 'se', x: b.x1, y: b.y1 }, { id: 's', x: mx, y: b.y1 },
        { id: 'sw', x: b.x0, y: b.y1 }, { id: 'w', x: b.x0, y: my },
      ];
    }
    if (kind === 'line' || kind === 'arrow') return [{ id: 'p0', x: g.p0.x, y: g.p0.y }, { id: 'p1', x: g.p1.x, y: g.p1.y }];
    if (kind === 'polygon') return g.pts.map((p, i) => ({ id: 'v' + i, x: p.x, y: p.y }));
    if (kind === 'curve') return [{ id: 'p0', x: g.p0.x, y: g.p0.y }, { id: 'p1', x: g.p1.x, y: g.p1.y }, { id: 'c1', x: g.c1.x, y: g.c1.y, ctl: true }, { id: 'c2', x: g.c2.x, y: g.c2.y, ctl: true }];
    return [];
  }
  function applyHandle(kind, g, id, pt, shift) {
    if (BOX_KINDS.includes(kind)) {
      const b = norm(g);
      if (id.includes('w')) b.x0 = pt.x;
      if (id.includes('e')) b.x1 = pt.x;
      if (id.includes('n')) b.y0 = pt.y;
      if (id.includes('s')) b.y1 = pt.y;
      return b;
    }
    if (kind === 'line' || kind === 'arrow') {
      const o = id === 'p0' ? g.p1 : g.p0;
      let p = { x: pt.x, y: pt.y };
      if (shift) {
        const a = Math.round(Math.atan2(p.y - o.y, p.x - o.x) / (Math.PI / 12)) * (Math.PI / 12), L = Math.hypot(p.x - o.x, p.y - o.y);
        p = { x: o.x + Math.cos(a) * L, y: o.y + Math.sin(a) * L };
      }
      return { ...g, [id]: p };
    }
    if (kind === 'polygon') { const pts = g.pts.slice(); pts[+id.slice(1)] = { x: pt.x, y: pt.y }; return { ...g, pts }; }
    if (kind === 'curve') return { ...g, [id]: { x: pt.x, y: pt.y } };
    return g;
  }
  function translate(kind, g, dx, dy) {
    const m = (p) => ({ x: p.x + dx, y: p.y + dy });
    if (BOX_KINDS.includes(kind)) return { x0: g.x0 + dx, y0: g.y0 + dy, x1: g.x1 + dx, y1: g.y1 + dy };
    if (kind === 'line' || kind === 'arrow') return { p0: m(g.p0), p1: m(g.p1) };
    if (kind === 'polygon') return { ...g, pts: g.pts.map(m) };
    if (kind === 'curve') return { p0: m(g.p0), p1: m(g.p1), c1: m(g.c1), c2: m(g.c2) };
    return g;
  }
  function hitShape(kind, g, pt, lw) {
    const tol = Math.max(6 / PP.vp.zoom, lw / 2 + 2);
    if (BOX_KINDS.includes(kind)) {
      const b = norm(g);
      return pt.x >= b.x0 - tol && pt.x <= b.x1 + tol && pt.y >= b.y0 - tol && pt.y <= b.y1 + tol;
    }
    const segs = [];
    if (kind === 'line' || kind === 'arrow') segs.push([g.p0, g.p1]);
    else if (kind === 'polygon') g.pts.forEach((p, i) => segs.push([p, g.pts[(i + 1) % g.pts.length]]));
    else if (kind === 'curve') { for (let i = 0; i < 24; i++) { const a = bez(g, i / 24), b = bez(g, (i + 1) / 24); segs.push([a, b]); } }
    if (kind === 'polygon') {
      let c = false;
      for (let i = 0, j = g.pts.length - 1; i < g.pts.length; j = i++) {
        const P = g.pts;
        if ((P[i].y > pt.y) !== (P[j].y > pt.y) && pt.x < ((P[j].x - P[i].x) * (pt.y - P[i].y)) / (P[j].y - P[i].y) + P[i].x) c = !c;
      }
      if (c) return true;
    }
    return segs.some(([a, b]) => distSeg(pt, a, b) <= tol);
  }
  function bez(g, t) {
    const u = 1 - t;
    return {
      x: u * u * u * g.p0.x + 3 * u * u * t * g.c1.x + 3 * u * t * t * g.c2.x + t * t * t * g.p1.x,
      y: u * u * u * g.p0.y + 3 * u * u * t * g.c1.y + 3 * u * t * t * g.c2.y + t * t * t * g.p1.y,
    };
  }
  function distSeg(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    const t = L ? PP.clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L, 0, 1) : 0;
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  /** 모든 도형 도구가 공유하는 '확정 전 편집' 상태 */
  const edit = { kind: null, geom: null, st: null, right: false, drag: null };

  function redraw() {
    const P = PP.preview;
    if (!P.active || !edit.kind) return;
    P.clear();
    P.opacity = edit.st.opacity;
    P.mark(drawShape(P.ctx, edit.kind, edit.geom, edit.st));
    PP.render();
    PP.renderOverlay();
  }
  function commitEdit() {
    if (!edit.kind) return;
    const kind = edit.kind;
    edit.kind = null; edit.drag = null;
    PP.preview.commit(LABELS[kind]);
    PP.pushRecent(PP.state.fg);
  }
  function cancelEdit() {
    if (!edit.kind) return;
    edit.kind = null; edit.drag = null;
    PP.preview.cancel();
    PP.renderOverlay();
  }
  function beginEdit(kind, geom, right) {
    edit.kind = kind;
    edit.geom = geom;
    edit.right = right;
    edit.st = styleFor(kind, right);
    edit.drag = null;
    redraw();
  }
  /** 편집 중 도형에 대한 포인터 처리. 처리했으면 true */
  function editDown(kind, pt) {
    if (edit.kind !== kind) return false;
    const z = PP.vp.zoom, rad = pt.touch ? 20 : 9;
    for (const h of handlesOf(kind, edit.geom)) {
      if (Math.hypot((h.x - pt.x) * z, (h.y - pt.y) * z) <= rad) { edit.drag = { type: 'handle', id: h.id }; return true; }
    }
    if (hitShape(kind, edit.geom, pt, edit.st.lw)) { edit.drag = { type: 'move', last: { x: pt.x, y: pt.y } }; return true; }
    return false;
  }
  function editMove(pt) {
    const d = edit.drag;
    if (!d) return false;
    if (d.type === 'handle') edit.geom = applyHandle(edit.kind, edit.geom, d.id, pt, pt.shift);
    else { edit.geom = translate(edit.kind, edit.geom, pt.x - d.last.x, pt.y - d.last.y); d.last = { x: pt.x, y: pt.y }; }
    redraw();
    return true;
  }
  function drawHandles(ctx, vp, kind) {
    if (edit.kind !== kind) return;
    ctx.save();
    ctx.lineWidth = 1;
    const hs = handlesOf(kind, edit.geom);
    if (kind === 'curve') {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = vp.colors.accent;
      for (const [a, b] of [['p0', 'c1'], ['p1', 'c2']]) {
        const A = hs.find((h) => h.id === a), B = hs.find((h) => h.id === b);
        const sa = vp.toScreen(A.x, A.y), sb = vp.toScreen(B.x, B.y);
        ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
      }
      ctx.setLineDash([]);
    } else if (BOX_KINDS.includes(kind)) {
      const b = norm(edit.geom), a = vp.toScreen(b.x0, b.y0), c = vp.toScreen(b.x1, b.y1);
      ctx.strokeStyle = vp.colors.accent;
      ctx.strokeRect(a.x, a.y, c.x - a.x, c.y - a.y);
    }
    const big = vp.coarse ? 7 : 4;
    for (const h of hs) {
      const s = vp.toScreen(h.x, h.y);
      ctx.beginPath();
      if (h.ctl) ctx.arc(s.x, s.y, big, 0, Math.PI * 2); else ctx.rect(s.x - big, s.y - big, big * 2, big * 2);
      ctx.fillStyle = h.ctl ? vp.colors.accent : '#fff';
      ctx.fill();
      ctx.strokeStyle = h.ctl ? '#fff' : vp.colors.accent;
      ctx.stroke();
    }
    ctx.restore();
  }
  // 옵션/색 변경을 편집 중인 도형에 바로 반영
  const restyle = () => { if (edit.kind) { edit.st = styleFor(edit.kind, edit.right); redraw(); } };
  PP.on('opts', restyle);
  PP.on('color', restyle);

  function makeDragShape(kind) {
    const tool = {
      name: kind, label: LABELS[kind], cursor: 'crosshair', snap: true, altPick: false,
      start: null, st: null, creating: false,
      down(pt) {
        if (editDown(kind, pt)) return;
        if (edit.kind) commitEdit();
        if (!PP.canPaint()) return;
        PP.sel.finish();
        this.start = { x: pt.x, y: pt.y };
        this.st = styleFor(kind, pt.button === 2);
        this.right = pt.button === 2;
        this.creating = true;
        this.geom = null;
        PP.preview.begin(PP.doc.active(), { opacity: this.st.opacity });
      },
      move(pt) {
        if (edit.drag) { editMove(pt); return; }
        if (!this.creating) return;
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
        if (edit.drag) { edit.drag = null; return; }
        if (!this.creating) return;
        this.creating = false;
        const g = this.geom;
        this.geom = null;
        const tiny = !g || (g.p0 ? Math.hypot(g.p1.x - g.p0.x, g.p1.y - g.p0.y) < 3 : Math.abs(g.x1 - g.x0) < 2 && Math.abs(g.y1 - g.y0) < 2);
        if (tiny) { PP.preview.cancel(); return; }
        beginEdit(kind, g, this.right); // 확정하지 않고 핸들로 편집
      },
      hover(pt) {
        if (edit.kind !== kind) return;
        const z = PP.vp.zoom;
        for (const h of handlesOf(kind, edit.geom)) if (Math.hypot((h.x - pt.x) * z, (h.y - pt.y) * z) <= 9) { PP.vp.setCursor('pointer'); return; }
        PP.vp.setCursor(hitShape(kind, edit.geom, pt, edit.st.lw) ? 'move' : 'crosshair');
      },
      keydown(e) {
        if (edit.kind !== kind) return false;
        if (e.key === 'Enter') { commitEdit(); return true; }
        return false;
      },
      escape() { if (edit.kind === kind) { cancelEdit(); return true; } return false; },
      cancel() { this.creating = false; edit.drag = null; if (!edit.kind) PP.preview.cancel(); },
      cancelStroke() { this.creating = false; if (!edit.kind) PP.preview.cancel(); edit.drag = null; },
      isPending() { return edit.kind === kind; },
      finishPending() { if (edit.kind === kind) commitEdit(); },
      cancelPending() { if (edit.kind === kind) cancelEdit(); },
      deactivate() { if (edit.kind === kind) commitEdit(); },
      overlay(ctx, vp) { drawHandles(ctx, vp, kind); },
    };
    PP.tools[kind] = tool;
  }
  for (const k of ['line', 'rect', 'roundrect', 'ellipse', 'triangle', 'arrow']) makeDragShape(k);

  // ---------- 다각형: 점 찍기 → 닫으면 편집 상태(꼭짓점 이동) ----------
  PP.tools.polygon = {
    name: 'polygon', label: '다각형', cursor: 'crosshair', snap: true, altPick: false,
    pts: null, hoverPt: null, st: null,
    down(pt) {
      if (!this.pts) {
        if (editDown('polygon', pt)) return;
        if (edit.kind) commitEdit();
        if (!PP.canPaint()) return;
        PP.sel.finish();
        this.pts = [{ x: pt.x, y: pt.y }];
        this.st = styleFor('polygon', pt.button === 2);
        this.right = pt.button === 2;
        PP.preview.begin(PP.doc.active(), { opacity: this.st.opacity });
        this.hoverPt = { x: pt.x, y: pt.y };
        this.redraw();
        return;
      }
      const first = this.pts[0];
      const near = Math.hypot((pt.x - first.x) * PP.vp.zoom, (pt.y - first.y) * PP.vp.zoom) < (pt.touch ? 20 : 9);
      if (near && this.pts.length >= 3) { this.finish(); return; }
      this.pts.push({ x: pt.x, y: pt.y });
      this.redraw();
    },
    hover(pt) {
      if (this.pts) { this.hoverPt = { x: pt.x, y: pt.y }; this.redraw(); }
    },
    move(pt) {
      if (edit.drag) { editMove(pt); return; }
      this.hover(pt);
    },
    up() { if (edit.drag) edit.drag = null; },
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
    /** 점 찍기를 끝내면 확정하지 않고 편집 상태로 전환 */
    finish() {
      if (!this.pts) return;
      if (this.pts.length < 3) { this.cancel(); return; }
      const pts = this.pts;
      this.pts = null; this.hoverPt = null;
      beginEdit('polygon', { pts, closed: true }, this.right);
    },
    keydown(e) {
      if (this.pts && e.key === 'Enter') { this.finish(); return true; }
      if (edit.kind === 'polygon' && e.key === 'Enter') { commitEdit(); return true; }
      return false;
    },
    escape() {
      if (this.pts) { this.cancel(); return true; }
      if (edit.kind === 'polygon') { cancelEdit(); return true; }
      return false;
    },
    cancel() { this.pts = null; this.hoverPt = null; if (!edit.kind) PP.preview.cancel(); },
    cancelStroke() {},
    isPending() { return !!this.pts || edit.kind === 'polygon'; },
    finishPending() { if (this.pts) this.finish(); if (edit.kind === 'polygon') commitEdit(); },
    cancelPending() { if (this.pts) { this.cancel(); } else if (edit.kind === 'polygon') cancelEdit(); },
    deactivate() { this.finishPending(); },
    overlay(ctx, vp) {
      if (this.pts) {
        ctx.save();
        for (const p of this.pts) {
          const s = vp.toScreen(p.x, p.y);
          ctx.beginPath(); ctx.rect(s.x - 3, s.y - 3, 6, 6);
          ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke();
        }
        ctx.restore();
      }
      drawHandles(ctx, vp, 'polygon');
    },
  };

  // ---------- 곡선: 선 → 휘기 2번 → 편집 상태(끝점/제어점 이동) ----------
  PP.tools.curve = {
    name: 'curve', label: '곡선', cursor: 'crosshair', snap: true, altPick: false,
    stage: 0, p0: null, p1: null, c1: null, c2: null, st: null, dragging: false,
    down(pt) {
      const p = { x: pt.x, y: pt.y };
      if (this.stage === 0) {
        if (editDown('curve', pt)) return;
        if (edit.kind) commitEdit();
        if (!PP.canPaint()) return;
        PP.sel.finish();
        this.st = styleFor('curve', pt.button === 2);
        this.right = pt.button === 2;
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
      if (edit.drag) { editMove(pt); return; }
      if (!this.dragging) return;
      const p = { x: pt.x, y: pt.y };
      if (this.stage === 0) { this.p1 = p; this.c1 = this.c2 = this.mid(); }
      else if (this.stage === 1) { this.c1 = p; this.c2 = p; }
      else this.c2 = p;
      this.redraw();
    },
    mid() { return { x: (this.p0.x + this.p1.x) / 2, y: (this.p0.y + this.p1.y) / 2 }; },
    up() {
      if (edit.drag) { edit.drag = null; return; }
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
      beginEdit('curve', { p0: this.p0, p1: this.p1, c1: this.c1, c2: this.c2 }, this.right);
    },
    keydown(e) {
      if (this.stage > 0 && e.key === 'Enter') { this.finish(); return true; }
      if (edit.kind === 'curve' && e.key === 'Enter') { commitEdit(); return true; }
      return false;
    },
    escape() {
      if (this.stage > 0) { this.cancel(); return true; }
      if (edit.kind === 'curve') { cancelEdit(); return true; }
      return false;
    },
    cancel() { this.stage = 0; this.dragging = false; if (!edit.kind) PP.preview.cancel(); },
    cancelStroke() { this.dragging = false; },
    isPending() { return this.stage > 0 || edit.kind === 'curve'; },
    finishPending() { if (this.stage > 0) this.finish(); if (edit.kind === 'curve') commitEdit(); },
    cancelPending() { if (this.stage > 0) this.cancel(); else if (edit.kind === 'curve') cancelEdit(); },
    deactivate() { this.finishPending(); },
    overlay(ctx, vp) { drawHandles(ctx, vp, 'curve'); },
  };
})(window.PP);
