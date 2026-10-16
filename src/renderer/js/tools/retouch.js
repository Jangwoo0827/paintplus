'use strict';
/*
 * 보정 도구: 손가락(번지기), 흐림 브러시, 선명 브러시, 닷지(밝게), 번(어둡게), 복제 도장
 * 레이어에 직접 그리되, 건드린 영역의 '변경 전' 타일만 저장했다가 획이 끝나면 변경 사각형 하나로 히스토리에 기록한다.
 */
(function (PP) {
  const TILE = 128;
  const LABELS = { smudge: '손가락', oil: '유화/아크릴(색 섞기)', liquify: '픽셀 유동화', blurbrush: '흐림 브러시', sharpbrush: '선명 브러시', dodge: '닷지', burn: '번', clone: '복제 도장' };

  /** 획 하나 동안의 변경 전 타일 보관 */
  class Session {
    constructor(layer) { this.layer = layer; this.tiles = new Map(); this.bbox = null; }
    touch(r) {
      const c = this.layer.canvas;
      for (let ty = Math.floor(r.y / TILE); ty <= Math.floor((r.y + r.h - 1) / TILE); ty++) {
        for (let tx = Math.floor(r.x / TILE); tx <= Math.floor((r.x + r.w - 1) / TILE); tx++) {
          const k = tx + ',' + ty;
          if (this.tiles.has(k)) continue;
          const tr = PP.rectIntersect({ x: tx * TILE, y: ty * TILE, w: TILE, h: TILE }, { x: 0, y: 0, w: c.width, h: c.height });
          if (tr) this.tiles.set(k, { r: tr, img: PP.cropCanvas(c, tr) });
        }
      }
      this.bbox = PP.rectUnion(this.bbox, r);
    }
    commit(name) {
      if (!this.bbox) return;
      const layer = this.layer, b = this.bbox;
      const before = PP.cropCanvas(layer.canvas, b);
      const bx = before.getContext('2d');
      for (const t of this.tiles.values()) {
        bx.clearRect(t.r.x - b.x, t.r.y - b.y, t.r.w, t.r.h);
        bx.drawImage(t.img, t.r.x - b.x, t.r.y - b.y);
      }
      PP.history.pushSwap(layer.id, b, before, name);
      PP.doc.touch(layer);
    }
  }

  function dabRect(x, y, size) {
    const d = Math.max(2, Math.round(size));
    const r = { x: Math.floor(x - d / 2), y: Math.floor(y - d / 2), w: d, h: d };
    return PP.clipToDoc(r);
  }
  /** 브러시 모양 알파 마스크(rect 크기) */
  function maskFor(rect, x, y, size, hardness) {
    const d = Math.max(2, Math.round(size));
    const st = PP.softStamp(d, hardness, '#000000');
    const m = PP.makeCanvas(rect.w, rect.h);
    m.getContext('2d').drawImage(st, Math.floor(x - d / 2) - 1 - rect.x, Math.floor(y - d / 2) - 1 - rect.y);
    return m;
  }
  /** result(rect 크기)를 선택 영역 안에서만, 알파 a 로 레이어에 합성 */
  function writeBack(layer, rect, result, a) {
    let res = result;
    if (PP.sel.hasRegion() && !PP.sel.float) {
      res = PP.cloneCanvas(result);
      const rx = res.getContext('2d');
      rx.globalCompositeOperation = 'destination-in';
      rx.drawImage(PP.sel.regionMask(rect), 0, 0);
    }
    const c = layer.ctx;
    c.save();
    c.globalAlpha = a;
    if (layer.alphaLock) c.globalCompositeOperation = 'source-atop';
    c.drawImage(res, rect.x, rect.y);
    c.restore();
  }
  const masked = (canvas, mask) => {
    const c = PP.cloneCanvas(canvas);
    const x = c.getContext('2d');
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(mask, 0, 0);
    return c;
  };

  const dabs = {
    smudge(ctx, o, x, y, size) {
      const r = dabRect(x, y, size);
      if (!r) return;
      ctx.ses.touch(r);
      const m = maskFor(r, x, y, size, o.hardness / 100);
      if (!ctx.buf) { ctx.buf = PP.cropCanvas(ctx.layer.canvas, r); ctx.bufRect = r; return; }
      // 버퍼를 현재 크기에 맞춰 가져와서 찍고, 새로 집어 올린다
      const b = PP.makeCanvas(r.w, r.h);
      b.getContext('2d').drawImage(ctx.buf, 0, 0, ctx.buf.width, ctx.buf.height, 0, 0, r.w, r.h);
      writeBack(ctx.layer, r, masked(b, m), o.strength / 100);
      const pick = PP.cropCanvas(ctx.layer.canvas, r);
      const nb = PP.makeCanvas(r.w, r.h);
      const nx = nb.getContext('2d');
      nx.drawImage(b, 0, 0);
      nx.globalAlpha = 0.55;
      nx.drawImage(pick, 0, 0);
      ctx.buf = nb;
    },
    oil(ctx, o, x, y, size) {
      // 붓에 묻은 물감(전경색)을 캔버스 색과 섞으며 끌고 간다
      const r = dabRect(x, y, size);
      if (!r) return;
      ctx.ses.touch(r);
      const m = maskFor(r, x, y, size, o.hardness / 100);
      let b = PP.makeCanvas(r.w, r.h);
      const bx = b.getContext('2d');
      if (!ctx.buf) { bx.fillStyle = PP.state.fg; bx.fillRect(0, 0, r.w, r.h); } else bx.drawImage(ctx.buf, 0, 0, ctx.buf.width, ctx.buf.height, 0, 0, r.w, r.h);
      writeBack(ctx.layer, r, masked(b, m), o.strength / 100);
      const pick = PP.cropCanvas(ctx.layer.canvas, r);
      bx.globalAlpha = 0.3;
      bx.drawImage(pick, 0, 0);
      ctx.buf = b;
    },
    liquify(ctx, o, x, y, size) {
      const r = dabRect(x, y, size);
      if (!r) return;
      ctx.ses.touch(r);
      const prev = ctx.last || { x, y };
      const dx = x - prev.x, dy = y - prev.y;
      ctx.last = { x, y };
      const src = PP.cropCanvas(ctx.layer.canvas, r).getContext('2d', { willReadFrequently: true }).getImageData(0, 0, r.w, r.h);
      const out = new ImageData(new Uint8ClampedArray(src.data), r.w, r.h);
      const rad = size / 2, cx = x - r.x, cy = y - r.y, k = o.strength / 100;
      const S = src.data, O = out.data, W = r.w, H = r.h;
      const sample = (fx, fy, oi) => {
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) return;
        const tx = fx - x0, ty = fy - y0;
        for (let c = 0; c < 4; c++) {
          const a = S[(y0 * W + x0) * 4 + c], b = S[(y0 * W + x0 + 1) * 4 + c], d = S[((y0 + 1) * W + x0) * 4 + c], e = S[((y0 + 1) * W + x0 + 1) * 4 + c];
          O[oi + c] = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + d * (1 - tx) * ty + e * tx * ty;
        }
      };
      for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
          const ddx = px - cx, ddy = py - cy, dist = Math.hypot(ddx, ddy);
          if (dist >= rad) continue;
          let w = 1 - dist / rad;
          w = w * w * k;
          let sx, sy;
          if (o.mode === 'bloat') { const f = 1 - 0.6 * w; sx = cx + ddx * f; sy = cy + ddy * f; }
          else if (o.mode === 'pinch') { const f = 1 + 0.6 * w; sx = cx + ddx * f; sy = cy + ddy * f; }
          else if (o.mode === 'twirl') { const a = w * 0.5; sx = cx + ddx * Math.cos(a) + ddy * Math.sin(a); sy = cy - ddx * Math.sin(a) + ddy * Math.cos(a); }
          else { sx = px - dx * w * 0.85; sy = py - dy * w * 0.85; }
          sample(sx, sy, (py * W + px) * 4);
        }
      }
      const tmp = PP.makeCanvas(W, H);
      tmp.getContext('2d').putImageData(out, 0, 0);
      const lc = ctx.layer.ctx;
      lc.clearRect(r.x, r.y, W, H);
      lc.drawImage(tmp, r.x, r.y);
    },
    blurbrush(ctx, o, x, y, size) {
      const r = dabRect(x, y, size);
      if (!r) return;
      ctx.ses.touch(r);
      const src = PP.cropCanvas(ctx.layer.canvas, r);
      const bl = PP.makeCanvas(r.w, r.h);
      const bx = bl.getContext('2d');
      bx.filter = `blur(${Math.max(1, size * 0.07).toFixed(1)}px)`;
      bx.drawImage(src, 0, 0);
      writeBack(ctx.layer, r, masked(bl, maskFor(r, x, y, size, o.hardness / 100)), (o.strength / 100) * 0.6);
    },
    sharpbrush(ctx, o, x, y, size) {
      const r = dabRect(x, y, size);
      if (!r) return;
      ctx.ses.touch(r);
      const src = PP.cropCanvas(ctx.layer.canvas, r);
      const bl = PP.makeCanvas(r.w, r.h);
      const bx = bl.getContext('2d');
      bx.filter = 'blur(1.5px)';
      bx.drawImage(src, 0, 0);
      const s = src.getContext('2d').getImageData(0, 0, r.w, r.h), b = bx.getImageData(0, 0, r.w, r.h);
      const k = 1.2;
      for (let i = 0; i < s.data.length; i += 4) {
        for (let c = 0; c < 3; c++) s.data[i + c] = PP.clamp(s.data[i + c] + (s.data[i + c] - b.data[i + c]) * k, 0, 255);
      }
      const out = PP.makeCanvas(r.w, r.h);
      out.getContext('2d').putImageData(s, 0, 0);
      writeBack(ctx.layer, r, masked(out, maskFor(r, x, y, size, o.hardness / 100)), Math.min(1, (o.strength / 100) * 0.8));
    },
    light(ctx, o, x, y, size, color) {
      const r = dabRect(x, y, size);
      if (!r) return;
      ctx.ses.touch(r);
      const src = PP.cropCanvas(ctx.layer.canvas, r);
      const t = PP.cloneCanvas(src);
      const tx = t.getContext('2d');
      tx.globalCompositeOperation = 'soft-light';
      tx.globalAlpha = 0.9;
      tx.fillStyle = color;
      tx.fillRect(0, 0, r.w, r.h);
      tx.globalCompositeOperation = 'destination-in'; // 투명한 곳은 건드리지 않음
      tx.globalAlpha = 1;
      tx.drawImage(src, 0, 0);
      writeBack(ctx.layer, r, masked(t, maskFor(r, x, y, size, o.hardness / 100)), (o.strength / 100) * 0.35);
    },
    clone(ctx, o, x, y, size) {
      if (!ctx.offset) return;
      const r = dabRect(x, y, size);
      if (!r) return;
      ctx.ses.touch(r);
      const sr = { x: r.x + ctx.offset.x, y: r.y + ctx.offset.y, w: r.w, h: r.h };
      const src = PP.makeCanvas(r.w, r.h);
      src.getContext('2d').drawImage(ctx.layer.canvas, sr.x, sr.y, sr.w, sr.h, 0, 0, r.w, r.h);
      writeBack(ctx.layer, r, masked(src, maskFor(r, x, y, size, o.hardness / 100)), o.strength / 100);
    },
  };

  function make(name) {
    const tool = {
      name, label: LABELS[name], snap: false, cursor: 'none', altPick: false,
      ring() { return Math.max(1, PP.opts(name).size); },
      src: null, // 복제 도장 원본 지점
      armSource: false,
      down(pt) {
        if (name === 'clone' && (pt.alt || this.armSource)) {
          this.src = { x: pt.x, y: pt.y };
          this.armSource = false;
          PP.toast('복제 원본을 지정했습니다');
          PP.renderOverlay();
          return;
        }
        if (name === 'clone' && !this.src) { PP.toast('Alt+클릭(또는 옵션바의 "원본 지정" 후 탭)으로 복제할 원본을 먼저 지정하세요'); return; }
        if (!PP.canPaint()) return;
        PP.sel.finish();
        const o = PP.opts(name);
        const layer = PP.doc.active();
        const c = { layer, ses: new Session(layer), buf: null, offset: name === 'clone' ? { x: Math.round(this.src.x - pt.x), y: Math.round(this.src.y - pt.y) } : null };
        this.ctx = c;
        const cb = (x, y, size) => {
          if (name === 'dodge') dabs.light(c, o, x, y, size, '#ffffff');
          else if (name === 'burn') dabs.light(c, o, x, y, size, '#000000');
          else dabs[name](c, o, x, y, size);
          PP.doc.touch(layer);
        };
        this.stroke = new PP.Stroke({
          ctx: null, type: 'custom', cb, size: o.size, hardness: o.hardness, spacing: name === 'smudge' || name === 'oil' ? 6 : name === 'liquify' ? 4 : o.spacing,
          smoothing: o.smoothing, pressure: o.pressure && name !== 'smudge' && name !== 'oil' && name !== 'liquify', color: '#000000',
        });
        this.stroke.start(pt);
        PP.render();
      },
      move(pt) { if (this.stroke) { this.stroke.move(pt); PP.render(); } },
      up(pt) {
        if (!this.stroke) return;
        this.stroke.end(pt);
        this.stroke = null;
        this.ctx.ses.commit(LABELS[name]);
        this.ctx = null;
      },
      cancel() { this.stroke = null; this.ctx = null; },
      overlay(octx, vp) {
        if (name !== 'clone' || !this.src) return;
        const s = vp.toScreen(this.src.x, this.src.y);
        octx.save();
        octx.strokeStyle = '#fff'; octx.lineWidth = 2;
        octx.beginPath(); octx.arc(s.x, s.y, 8, 0, 7); octx.moveTo(s.x - 12, s.y); octx.lineTo(s.x + 12, s.y); octx.moveTo(s.x, s.y - 12); octx.lineTo(s.x, s.y + 12); octx.stroke();
        octx.strokeStyle = '#000'; octx.lineWidth = 1; octx.stroke();
        octx.restore();
      },
    };
    PP.tools[name] = tool;
  }
  for (const n of Object.keys(LABELS)) make(n);
  PP.RETOUCH_LABELS = LABELS;
})(window.PP);
