'use strict';
/*
 * 브러시 엔진: 포인터 입력 → 보정(스무딩) → 간격(spacing)대로 점(dab) 배치 → 대칭 복제 → 스트로크 캔버스에 그리기.
 * type: pencil | soft | marker | spray | bristle | crayon  (지우개는 soft/pencil + preview.erase)
 */
(function (PP) {
  const stampCache = new Map();

  function softStamp(d, hardness, color) {
    const key = d + '|' + hardness.toFixed(2) + '|' + color;
    let c = stampCache.get(key);
    if (c) return c;
    const pad = 1;
    c = PP.makeCanvas(d + pad * 2, d + pad * 2);
    const x = c.getContext('2d');
    const r = d / 2, cx = r + pad, cy = r + pad;
    if (hardness >= 0.98) {
      x.fillStyle = color;
      x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    } else {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      const h = Math.max(0.001, hardness);
      g.addColorStop(0, PP.rgba(color, 1));
      g.addColorStop(h, PP.rgba(color, 1));
      for (let i = 1; i <= 8; i++) {
        const u = i / 8;
        const a = 1 - (3 * u * u - 2 * u * u * u); // smoothstep 감쇠
        g.addColorStop(h + (1 - h) * u, PP.rgba(color, a));
      }
      x.fillStyle = g;
      x.fillRect(0, 0, c.width, c.height);
    }
    if (stampCache.size > 80) stampCache.delete(stampCache.keys().next().value);
    stampCache.set(key, c);
    return c;
  }

  function pixelDisc(ctx, cx, cy, d) {
    if (d > 64) {
      ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const r = d / 2;
    const x0 = Math.round(cx - r), y0 = Math.round(cy - r);
    for (let j = 0; j < d; j++) {
      const yy = j + 0.5 - r;
      const hw = Math.sqrt(Math.max(0, r * r - yy * yy));
      const xs = Math.round(r - hw), xe = Math.round(r + hw);
      if (xe > xs) ctx.fillRect(x0 + xs, y0 + j, xe - xs, 1);
    }
  }

  let crayonTileKey = '', crayonTile = null;
  function crayonPattern(ctx, color) {
    if (crayonTileKey !== color) {
      const c = PP.makeCanvas(128, 128);
      const x = c.getContext('2d');
      const id = x.createImageData(128, 128);
      const rgb = PP.hexToRgb(color) || { r: 0, g: 0, b: 0 };
      for (let i = 0; i < id.data.length; i += 4) {
        const n = Math.random();
        id.data[i] = rgb.r; id.data[i + 1] = rgb.g; id.data[i + 2] = rgb.b;
        id.data[i + 3] = n < 0.32 ? 0 : n < 0.5 ? 120 : 255;
      }
      x.putImageData(id, 0, 0);
      crayonTile = c;
      crayonTileKey = color;
    }
    return ctx.createPattern(crayonTile, 'repeat');
  }

  class Stroke {
    constructor(o) {
      this.ctx = o.ctx;
      this.type = o.type;
      this.size = o.size;
      this.hardness = PP.clamp((o.hardness == null ? 100 : o.hardness) / 100, 0, 1);
      this.spacing = Math.max(0.02, (o.spacing || 10) / 100);
      this.k = PP.clamp((o.smoothing || 0) / 100, 0, 1) * 0.93;
      this.usePressure = !!o.pressure;
      this.color = o.color;
      this.sym = { ...PP.state.symmetry };
      this.cx = PP.doc.width / 2;
      this.cy = PP.doc.height / 2;
      this.pos = null;
      this.last = null;
      this.acc = 0;
      this.target = null;
      if (this.type === 'bristle') this.initBristles();
      if (this.type === 'crayon') this.pattern = crayonPattern(this.ctx, this.color);
    }

    pf(p) { return this.usePressure ? 0.12 + 0.88 * p : 1; }
    alphaF(p) { return this.usePressure ? 0.25 + 0.75 * p : 1; }
    sizeAt(p) { return Math.max(1, this.size * this.pf(p)); }
    stepFor(p) { return Math.max(this.type === 'spray' ? 1.5 : 0.75, this.sizeAt(p) * this.spacing); }

    start(pt) {
      this.pos = { x: pt.x, y: pt.y, p: pt.pressure || 0.5 };
      this.last = { ...this.pos };
      this.target = { ...this.pos };
      this.dab(this.pos.x, this.pos.y, this.pos.p);
    }

    move(pt) {
      this.target = { x: pt.x, y: pt.y, p: pt.pressure || (pt.pen ? 0.02 : 1) };
      const k = this.k;
      const np = {
        x: this.pos.x + (pt.x - this.pos.x) * (1 - k),
        y: this.pos.y + (pt.y - this.pos.y) * (1 - k),
        p: this.pos.p + (this.target.p - this.pos.p) * (1 - Math.min(k, 0.6)),
      };
      this.segment(this.last, np);
      this.last = np;
      this.pos = np;
    }

    end() {
      // 스무딩으로 뒤처진 꼬리를 마지막 입력 위치까지 이어 준다
      if (this.k > 0 && this.target) {
        for (let i = 0; i < 60; i++) {
          if (Math.hypot(this.target.x - this.pos.x, this.target.y - this.pos.y) < 0.4) break;
          const np = {
            x: this.pos.x + (this.target.x - this.pos.x) * 0.35,
            y: this.pos.y + (this.target.y - this.pos.y) * 0.35,
            p: this.pos.p,
          };
          this.segment(this.last, np);
          this.last = np; this.pos = np;
        }
      }
    }

    /** 가만히 누르고 있을 때(스프레이) 현재 위치에 계속 뿌리기 */
    tick() {
      if (this.pos) this.dab(this.pos.x, this.pos.y, this.pos.p);
    }

    segment(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-6) return;
      if (this.type === 'bristle') { this.bristleSeg(a, b); return; }
      let pos = 0;
      let step = this.stepFor((a.p + b.p) / 2);
      while (this.acc + (dist - pos) >= step) {
        pos += step - this.acc;
        this.acc = 0;
        const t = pos / dist;
        const p = a.p + (b.p - a.p) * t;
        this.dab(a.x + dx * t, a.y + dy * t, p);
        step = this.stepFor(p);
      }
      this.acc += dist - pos;
    }

    mirror(x, y) {
      const m = this.sym.mode;
      const out = [[x, y]];
      if (m === 'none') return out;
      const dx = x - this.cx, dy = y - this.cy;
      if (m === 'h' || m === 'both') out.push([this.cx - dx, y]);
      if (m === 'v' || m === 'both') out.push([x, this.cy - dy]);
      if (m === 'both') out.push([this.cx - dx, this.cy - dy]);
      if (m === 'radial') {
        const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
        for (let i = 1; i < this.sym.n; i++) {
          const ang = a + (Math.PI * 2 * i) / this.sym.n;
          out.push([this.cx + Math.cos(ang) * r, this.cy + Math.sin(ang) * r]);
        }
      }
      return out;
    }

    dab(x, y, p) {
      for (const [mx, my] of this.mirror(x, y)) this.dab1(mx, my, p);
    }

    dab1(x, y, p) {
      const ctx = this.ctx;
      const size = this.sizeAt(p);
      const R = size / 2 + 3;
      PP.preview.markPts(x - R, y - R, x + R, y + R, 1);
      switch (this.type) {
        case 'pencil': {
          ctx.fillStyle = this.color;
          const d = Math.max(1, Math.round(size));
          pixelDisc(ctx, x, y, d);
          break;
        }
        case 'soft': {
          const d = Math.max(1, Math.round(size));
          const st = softStamp(d, this.hardness, this.color);
          ctx.globalAlpha = this.alphaF(p);
          ctx.drawImage(st, x - st.width / 2, y - st.height / 2);
          ctx.globalAlpha = 1;
          break;
        }
        case 'marker': {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(-Math.PI / 4);
          ctx.fillStyle = this.color;
          ctx.fillRect(-size / 2, -size * 0.16, size, size * 0.32);
          ctx.restore();
          break;
        }
        case 'spray': {
          const r = size / 2;
          const n = Math.max(3, Math.round(r * r * 0.07));
          ctx.fillStyle = this.color;
          let ga = -1;
          for (let i = 0; i < n; i++) {
            const ang = Math.random() * Math.PI * 2;
            const rad = r * Math.pow(Math.random(), 0.65);
            const a = Math.random() < 0.5 ? 0.45 : Math.random() < 0.5 ? 0.75 : 1;
            if (a !== ga) { ctx.globalAlpha = a; ga = a; }
            const s = 0.7 + Math.random() * 0.9;
            ctx.fillRect(x + Math.cos(ang) * rad - s / 2, y + Math.sin(ang) * rad - s / 2, s, s);
          }
          ctx.globalAlpha = 1;
          break;
        }
        case 'crayon': {
          ctx.fillStyle = this.pattern;
          ctx.globalAlpha = this.alphaF(p);
          ctx.beginPath();
          ctx.arc(x, y, size / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        default:
          break;
      }
    }

    // ----- 붓(강모) -----
    initBristles() {
      const n = PP.clamp(Math.round(this.size * 1.1), 8, 64);
      this.bristles = [];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const rad = Math.sqrt(Math.random());
        this.bristles.push({
          ox: Math.cos(a) * rad, oy: Math.sin(a) * rad,
          w: 0.6 + Math.random() * 0.8,
          alpha: 0.5 + Math.random() * 0.5,
          shade: (Math.random() - 0.5) * 0.22,
        });
      }
      const rgb = PP.hexToRgb(this.color) || { r: 0, g: 0, b: 0 };
      this.bristleColors = this.bristles.map((b) => {
        const f = b.shade;
        const adj = (v) => Math.round(PP.clamp(v + (f > 0 ? (255 - v) * f : v * f), 0, 255));
        return `rgb(${adj(rgb.r)},${adj(rgb.g)},${adj(rgb.b)})`;
      });
    }

    bristleSeg(a, b) {
      const ctx = this.ctx;
      const sa = this.sizeAt(a.p) / 2, sb = this.sizeAt(b.p) / 2;
      const lw = Math.max(0.8, this.size * 0.11);
      ctx.lineCap = 'round';
      const ma = this.mirrorPair(a.x, a.y, sa);
      const mb = this.mirrorPair(b.x, b.y, sb);
      const R = Math.max(sa, sb) + lw + 3;
      PP.preview.markPts(Math.min(a.x, b.x) - R, Math.min(a.y, b.y) - R, Math.max(a.x, b.x) + R, Math.max(a.y, b.y) + R, 2);
      for (let m = 0; m < ma.length; m++) {
        const pa = ma[m], pb = mb[m];
        for (let i = 0; i < this.bristles.length; i++) {
          const br = this.bristles[i];
          ctx.strokeStyle = this.bristleColors[i];
          ctx.globalAlpha = br.alpha * this.alphaF((a.p + b.p) / 2);
          ctx.lineWidth = lw * br.w;
          ctx.beginPath();
          ctx.moveTo(pa.x + br.ox * pa.r, pa.y + br.oy * pa.r);
          ctx.lineTo(pb.x + br.ox * pb.r, pb.y + br.oy * pb.r);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    mirrorPair(x, y, r) {
      return this.mirror(x, y).map(([mx, my]) => ({ x: mx, y: my, r }));
    }
  }

  PP.Stroke = Stroke;
})(window.PP);
