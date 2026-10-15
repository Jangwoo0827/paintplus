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
