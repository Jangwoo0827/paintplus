'use strict';
/* 스포이드 / 손바닥 / 돋보기 */
(function (PP) {
  PP.tools.picker = {
    name: 'picker', label: '스포이드', cursor: 'crosshair', altPick: false,
    down(pt) { this.pick(pt); },
    move(pt) { this.pick(pt); },
    pick(pt) {
      const o = PP.opts('picker');
      const c = PP.doc.sample(pt.x, pt.y, o.sample === 'layer' ? 'layer' : 'all');
      if (!c) return;
      if (c.a === 0) return;
      PP.setColor(pt.button === 2 ? 'bg' : 'fg', PP.rgbToHex(c.r, c.g, c.b), true);
    },
    up() {},
    /** 돋보기: 커서 주변 11x11 픽셀을 확대해서 보여 준다 */
    overlay(ctx, vp) {
      const h = vp.hover;
      if (!h) return;
      const S = 110, R = 5, cx = h.sx + (vp.coarse ? 0 : 70), cy = h.sy - (vp.coarse ? 110 : 70);
      const d = PP.doc, px = Math.floor(h.x), py = Math.floor(h.y);
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, S / 2, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#fff'; ctx.fillRect(cx - S / 2, cy - S / 2, S, S);
      ctx.imageSmoothingEnabled = false;
      for (const l of d.layers) {
        if (!l.visible) continue;
        ctx.globalAlpha = l.opacity;
        ctx.drawImage(l.canvas, px - R, py - R, R * 2 + 1, R * 2 + 1, cx - S / 2, cy - S / 2, S, S);
      }
      ctx.restore();
      ctx.save();
      ctx.lineWidth = 2; ctx.strokeStyle = '#000';
      ctx.beginPath(); ctx.arc(cx, cy, S / 2, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.strokeRect(cx - S / 22, cy - S / 22, S / 11, S / 11);
      ctx.restore();
    },
  };

  PP.tools.hand = {
    name: 'hand', label: '손바닥', cursor: 'grab',
  };

  PP.tools.zoom = {
    name: 'zoom', label: '돋보기', cursor: 'zoom-in', altPick: false,
    down(pt) {
      PP.vp.zoomStep(pt.button === 2 || pt.alt ? -1 : 1, pt.sx, pt.sy);
    },
  };
})(window.PP);
