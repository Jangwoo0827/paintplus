'use strict';
/* 마술봉: 클릭한 곳과 비슷한 색(허용 오차)을 선택. Shift=더하기, Alt=빼기, Shift+Alt=교차 (또는 옵션바 모드) */
(function (PP) {
  PP.tools.wand = {
    name: 'wand', label: '마술봉', cursor: 'crosshair', altPick: false,
    down(pt) {
      const d = PP.doc;
      const sx = Math.floor(pt.x), sy = Math.floor(pt.y);
      if (sx < 0 || sy < 0 || sx >= d.width || sy >= d.height) return;
      PP.sel.finish();
      const o = PP.opts('wand');
      const src = o.allLayers ? d.flatten() : d.active().canvas;
      const img = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, d.width, d.height);
      const r = o.contiguous ? PP.floodMask(img, sx, sy, o.tolerance) : PP.colorMask(img, sx, sy, o.tolerance);
      if (r.x1 < r.x0) return;
      const bw = r.x1 - r.x0 + 1, bh = r.y1 - r.y0 + 1;
      const out = new ImageData(bw, bh);
      const o32 = new Uint32Array(out.data.buffer);
      for (let y = 0; y < bh; y++) {
        const row = (r.y0 + y) * d.width + r.x0;
        for (let x = 0; x < bw; x++) if (r.mask[row + x]) o32[y * bw + x] = 0xff000000;
      }
      const m = PP.makeCanvas(d.width, d.height);
      m.getContext('2d').putImageData(out, r.x0, r.y0);
      PP.sel.combine(m, PP.selModeFor(pt));
    },
    up() {},
    hover() { PP.vp.setCursor('crosshair'); },
    keydown(e) {
      if (!PP.sel.hasAny()) return false;
      if (e.key === 'Enter') { PP.sel.commitFloat(); PP.renderOverlay(); return true; }
      return false;
    },
  };
})(window.PP);
