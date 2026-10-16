'use strict';
/* 페인트통(채우기) / 그라디언트 */
(function (PP) {
  /** 스캔라인 채우기. 반환: {mask, x0,y0,x1,y1} (x1,y1 포함) */
  function floodMask(img, sx, sy, tol) {
    const w = img.width, h = img.height, d = img.data;
    const mask = new Uint8Array(w * h);
    const si = (sy * w + sx) * 4;
    const tr = d[si], tg = d[si + 1], tb = d[si + 2], ta = d[si + 3];
    const match = (i) => {
      const p = i * 4;
      return Math.abs(d[p] - tr) <= tol && Math.abs(d[p + 1] - tg) <= tol && Math.abs(d[p + 2] - tb) <= tol && Math.abs(d[p + 3] - ta) <= tol;
    };
    let x0 = sx, x1 = sx, y0 = sy, y1 = sy;
    const stack = [sx, sy];
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      let xl = x;
      while (xl >= 0 && !mask[y * w + xl] && match(y * w + xl)) xl--;
      xl++;
      let up = false, down = false;
      let xr = xl;
      while (xr < w && !mask[y * w + xr] && match(y * w + xr)) {
        mask[y * w + xr] = 1;
        if (y > 0) {
          const m = !mask[(y - 1) * w + xr] && match((y - 1) * w + xr);
          if (!up && m) { stack.push(xr, y - 1); up = true; } else if (up && !m) up = false;
        }
        if (y < h - 1) {
          const m = !mask[(y + 1) * w + xr] && match((y + 1) * w + xr);
          if (!down && m) { stack.push(xr, y + 1); down = true; } else if (down && !m) down = false;
        }
        xr++;
      }
      if (xl < x0) x0 = xl;
      if (xr - 1 > x1) x1 = xr - 1;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    return { mask, x0, y0, x1, y1 };
  }

  /** 연결 여부와 상관없이 문서 전체에서 같은 색(허용 오차 이내)인 곳 */
  function colorMask(img, sx, sy, tol) {
    const w = img.width, h = img.height, d = img.data;
    const mask = new Uint8Array(w * h);
    const si = (sy * w + sx) * 4;
    const tr = d[si], tg = d[si + 1], tb = d[si + 2], ta = d[si + 3];
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        if (Math.abs(d[p] - tr) <= tol && Math.abs(d[p + 1] - tg) <= tol && Math.abs(d[p + 2] - tb) <= tol && Math.abs(d[p + 3] - ta) <= tol) {
          mask[y * w + x] = 1;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          y1 = y;
        }
      }
    }
    return { mask, x0, y0, x1, y1 };
  }
  PP.floodMask = floodMask;
  PP.colorMask = colorMask;

  function dilate(mask, w, h, b, n) {
    for (let k = 0; k < n; k++) {
      const add = [];
      const xa = Math.max(0, b.x0 - 1), xb = Math.min(w - 1, b.x1 + 1), ya = Math.max(0, b.y0 - 1), yb = Math.min(h - 1, b.y1 + 1);
      for (let y = ya; y <= yb; y++) {
        for (let x = xa; x <= xb; x++) {
          const i = y * w + x;
          if (mask[i]) continue;
          if ((x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) || (y > 0 && mask[i - w]) || (y < h - 1 && mask[i + w])) add.push(i);
        }
      }
      for (const i of add) mask[i] = 1;
      b.x0 = xa; b.x1 = xb; b.y0 = ya; b.y1 = yb;
    }
  }

  PP.tools.fill = {
    name: 'fill', label: '페인트통', cursor: 'crosshair',
    down(pt) {
      if (!PP.canPaint()) return;
      PP.sel.finish();
      const o = PP.opts('fill');
      const d = PP.doc;
      const sx = Math.floor(pt.x), sy = Math.floor(pt.y);
      if (sx < 0 || sy < 0 || sx >= d.width || sy >= d.height) return;
      const layer = d.active();
      const srcCanvas = o.allLayers ? d.flatten() : layer.canvas;
      const img = srcCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, d.width, d.height);
      const r = floodMask(img, sx, sy, o.tolerance);
      dilate(r.mask, d.width, d.height, r, o.expand);
      const bw = r.x1 - r.x0 + 1, bh = r.y1 - r.y0 + 1;
      const out = new ImageData(bw, bh);
      const rgb = PP.hexToRgb(pt.button === 2 ? PP.state.bg : PP.state.fg);
      const o32 = new Uint32Array(out.data.buffer);
      const col = (255 << 24) | (rgb.b << 16) | (rgb.g << 8) | rgb.r;
      for (let y = 0; y < bh; y++) {
        const row = (r.y0 + y) * d.width + r.x0;
        for (let x = 0; x < bw; x++) if (r.mask[row + x]) o32[y * bw + x] = col;
      }
      const tmp = PP.makeCanvas(bw, bh);
      tmp.getContext('2d').putImageData(out, 0, 0);
      PP.preview.begin(layer, { opacity: o.opacity / 100 });
      PP.preview.ctx.drawImage(tmp, r.x0, r.y0);
      PP.preview.mark({ x: r.x0, y: r.y0, w: bw, h: bh });
      PP.preview.commit('페인트통');
      PP.pushRecent(pt.button === 2 ? PP.state.bg : PP.state.fg);
    },
  };

  // ---------- 그라디언트 ----------
  const grad = {
    name: 'gradient', label: '그라디언트', cursor: 'crosshair', snap: true,
    start: null, cur: null, area: null,
    down(pt) {
      if (!PP.canPaint()) return;
      PP.sel.finish();
      this.start = { x: pt.x, y: pt.y };
      this.cur = { x: pt.x, y: pt.y };
      this.area = PP.sel.boundsOrDoc();
      PP.preview.begin(PP.doc.active(), { opacity: PP.opts('gradient').opacity / 100 });
    },
    move(pt) {
      if (!this.start) return;
      let x = pt.x, y = pt.y;
      if (pt.shift) {
        const a = Math.round(Math.atan2(y - this.start.y, x - this.start.x) / (Math.PI / 12)) * (Math.PI / 12);
        const L = Math.hypot(x - this.start.x, y - this.start.y);
        x = this.start.x + Math.cos(a) * L; y = this.start.y + Math.sin(a) * L;
      }
      this.cur = { x, y };
      this.paint();
      PP.render();
    },
    paint() {
      const o = PP.opts('gradient');
      const P = PP.preview, ctx = P.ctx;
      const s = this.start, e = this.cur;
      const fg = PP.state.fg, bg = PP.state.bg;
      let c1, c2;
      if (o.gradColors === 'fg-clear') { c1 = fg; c2 = PP.rgba(fg, 0); }
      else if (o.gradColors === 'bg-fg') { c1 = bg; c2 = fg; }
      else { c1 = fg; c2 = bg; }
      const dist = Math.hypot(e.x - s.x, e.y - s.y);
      let g;
      if (dist < 1) g = null;
      else if (o.gradType === 'radial') {
        g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, dist);
        g.addColorStop(0, c1); g.addColorStop(1, c2);
      } else if (o.gradType === 'reflected') {
        g = ctx.createLinearGradient(2 * s.x - e.x, 2 * s.y - e.y, e.x, e.y);
        g.addColorStop(0, c2); g.addColorStop(0.5, c1); g.addColorStop(1, c2);
      } else if (o.gradType === 'angular') {
        g = ctx.createConicGradient(Math.atan2(e.y - s.y, e.x - s.x), s.x, s.y);
        g.addColorStop(0, c1); g.addColorStop(0.5, c2); g.addColorStop(1, c1);
      } else {
        g = ctx.createLinearGradient(s.x, s.y, e.x, e.y);
        g.addColorStop(0, c1); g.addColorStop(1, c2);
      }
      P.clear();
      ctx.fillStyle = g || c1;
      ctx.fillRect(this.area.x, this.area.y, this.area.w, this.area.h);
      P.mark(this.area);
    },
    up() {
      if (!this.start) return;
      const moved = Math.hypot(this.cur.x - this.start.x, this.cur.y - this.start.y) >= 1;
      this.start = null;
      if (!moved) { PP.preview.cancel(); return; }
      PP.preview.commit('그라디언트');
      PP.pushRecent(PP.state.fg);
    },
    cancel() { this.start = null; PP.preview.cancel(); },
    overlay(ctx, vp) {
      if (!this.start) return;
      const a = vp.toScreen(this.start.x, this.start.y), b = vp.toScreen(this.cur.x, this.cur.y);
      ctx.save();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.stroke();
      for (const p of [a, b]) { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); }
      ctx.restore();
    },
  };
  PP.tools.gradient = grad;
})(window.PP);
