'use strict';
/*
 * 선택 영역: 다각형(poly)으로 표현. 이동/크기/회전을 하려면 내용을 '들어올려(lift)' 떠 있는 선택(float)로 만든다.
 * float는 확정(commitFloat) 시점에 레이어에 합쳐지고 변경 사각형 하나로 히스토리에 기록된다.
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

  const sel = (PP.sel = {
    poly: null, // 절대 문서 좌표 [{x,y}]
    float: null,
    creating: false,

    hasAny() { return !!(this.poly || this.float); },

    // ---------- 영역 설정 ----------
    setRect(x0, y0, x1, y1) {
      const W = PP.doc.width, H = PP.doc.height;
      x0 = PP.clamp(Math.round(x0), 0, W); x1 = PP.clamp(Math.round(x1), 0, W);
      y0 = PP.clamp(Math.round(y0), 0, H); y1 = PP.clamp(Math.round(y1), 0, H);
      const a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(y0, y1), d = Math.max(y0, y1);
      this.poly = [{ x: a, y: c }, { x: b, y: c }, { x: b, y: d }, { x: a, y: d }];
      PP.emit('selection');
      PP.renderOverlay();
    },
    setPoly(pts) {
      const W = PP.doc.width, H = PP.doc.height;
      this.poly = pts.map((p) => ({ x: PP.clamp(p.x, 0, W), y: PP.clamp(p.y, 0, H) }));
      PP.emit('selection');
      PP.renderOverlay();
    },
    selectAll() {
      this.finish();
      this.setRect(0, 0, PP.doc.width, PP.doc.height);
    },
    bounds() {
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
    /** 그리기 도구가 선택 영역 안에서만 칠해지도록 클립 */
    clipCtx(ctx) {
      if (!this.poly || this.float) return;
      this.pathOn(ctx);
      ctx.clip();
    },
    inside(pt) {
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
      if (this.poly) { this.poly = null; PP.emit('selection'); }
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
      if (!this.poly) return false;
      if (!PP.canPaint()) return false;
      const layer = PP.doc.active();
      const b = this.bounds();
      if (!b) return false;
      const orig = PP.cropCanvas(layer.canvas, b);
      const content = PP.cloneCanvas(orig);
      const cx = content.getContext('2d');
      cx.globalCompositeOperation = 'destination-in';
      cx.fillStyle = '#000';
      this.pathOn(cx, b.x, b.y);
      cx.fill();
      const lc = layer.ctx;
      lc.save();
      this.pathOn(lc);
      lc.clip();
      lc.clearRect(b.x, b.y, b.w, b.h);
      lc.restore();
      const mx = b.x + b.w / 2, my = b.y + b.h / 2;
      this.float = {
        canvas: content, nw: b.w, nh: b.h, w: b.w, h: b.h, cx: mx, cy: my, rot: 0,
        base: this.poly.map((p) => ({ x: p.x - mx, y: p.y - my })),
        layerId: layer.id, srcRect: b, origCrop: orig, moved: false,
      };
      PP.doc.touch(layer);
      return true;
    },

    /** 붙여넣기 등: 원본 없이 새 float 생성 */
    startFloat(canvas, x, y) {
      this.finish();
      if (!PP.canPaint()) return false;
      const w = canvas.width, h = canvas.height;
      const mx = x + w / 2, my = y + h / 2;
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
      if (f.srcRect) {
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
      if (!this.poly) return { canvas: PP.cloneCanvas(layer.canvas), x: 0, y: 0 };
      const b = this.bounds();
      if (!b) return null;
      const c = PP.cropCanvas(layer.canvas, b);
      const x = c.getContext('2d');
      x.globalCompositeOperation = 'destination-in';
      x.fillStyle = '#000';
      this.pathOn(x, b.x, b.y);
      x.fill();
      return { canvas: c, x: b.x, y: b.y };
    },

    /** 선택 영역 내용을 지움 (float 이면 버림) */
    clearContent() {
      if (this.float) { this.commitFloat(false); return true; }
      if (!this.poly) return false;
      if (!PP.canPaint()) return false;
      const b = this.bounds();
      if (!b) return false;
      const layer = PP.doc.active();
      PP.history.pixelOp(layer, b, '선택 영역 삭제', () => {
        const c = layer.ctx;
        c.save();
        this.pathOn(c);
        c.clip();
        c.clearRect(b.x, b.y, b.w, b.h);
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
      let best = null, bd = 9;
      for (const h of this.handles(z)) {
        const d = Math.hypot((h.x - pt.x) * z, (h.y - pt.y) * z);
        if (d <= bd) { bd = d; best = h; }
      }
      return best;
    },

    // ---------- 오버레이 ----------
    drawOverlay(ctx, vp, ants, showHandles) {
      if (!this.poly) return;
      ctx.save();
      const path = () => {
        ctx.beginPath();
        this.poly.forEach((p, i) => {
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
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.restore();
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
        for (const h of hs) {
          const s = vp.toScreen(h.x, h.y);
          ctx.beginPath();
          if (h.type === 'rotate') ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
          else ctx.rect(s.x - 4, s.y - 4, 8, 8);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
    },
  });

  // ---------- 드래그 상호작용(사각형/자유형 공용) ----------
  const CURSORS = { '-1,-1': 'nwse-resize', '1,1': 'nwse-resize', '1,-1': 'nesw-resize', '-1,1': 'nesw-resize', '0,-1': 'ns-resize', '0,1': 'ns-resize', '-1,0': 'ew-resize', '1,0': 'ew-resize' };

  function makeSelTool(name, label, lasso) {
    const tool = {
      name, label, cursor: 'crosshair', snap: true, altPick: false,
      mode: null, start: null, pts: null, drag: null,

      down(pt) {
        PP.commitTextEditor && PP.commitTextEditor(true);
        if (sel.hasAny()) {
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
        }
        this.mode = 'create';
        sel.creating = true;
        this.start = { x: pt.x, y: pt.y };
        this.pts = [{ x: pt.x, y: pt.y }];
        sel.poly = null;
      },

      move(pt) {
        if (this.mode === 'create') {
          if (lasso) {
            const last = this.pts[this.pts.length - 1];
            if (Math.hypot(pt.x - last.x, pt.y - last.y) >= 0.8 / Math.max(PP.vp.zoom, 0.25)) this.pts.push({ x: pt.x, y: pt.y });
            if (this.pts.length >= 2) sel.poly = this.pts.map((p) => ({ x: p.x, y: p.y }));
          } else {
            let x1 = pt.x, y1 = pt.y;
            if (pt.shift) {
              const m = Math.max(Math.abs(x1 - this.start.x), Math.abs(y1 - this.start.y));
              x1 = this.start.x + Math.sign(x1 - this.start.x || 1) * m;
              y1 = this.start.y + Math.sign(y1 - this.start.y || 1) * m;
            }
            sel.setRect(this.start.x, this.start.y, x1, y1);
          }
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

      up() {
        if (this.mode === 'create') {
          sel.creating = false;
          const p = sel.poly;
          const b = sel.bounds();
          if (!p || !b || (lasso ? this.pts.length < 3 : b.w < 2 && b.h < 2) || b.w < 1 || b.h < 1) {
            sel.poly = null;
          } else if (lasso) {
            sel.setPoly(this.pts);
          }
          PP.emit('selection');
        }
        this.mode = null; this.drag = null;
        PP.renderOverlay();
      },

      cancel() { sel.creating = false; this.mode = null; },

      hover(pt) {
        let c = 'crosshair';
        if (sel.hasAny()) {
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

  PP.on('doc:new', () => { sel.poly = null; sel.float = null; PP.emit('selection'); });
  PP.on('doc:structure', () => {
    if (sel.float && !PP.doc.byId(sel.float.layerId)) sel.float = null;
  });
})(window.PP);
