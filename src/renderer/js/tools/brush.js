'use strict';
/* 연필 / 브러시(여러 종류) / 지우개 */
(function (PP) {
  const TYPE_PRESETS = {
    soft: { size: 24, opacity: 100, hardness: 50, spacing: 12 },
    marker: { size: 22, opacity: 65, hardness: 100, spacing: 6 },
    spray: { size: 48, opacity: 100, hardness: 100, spacing: 20 },
    bristle: { size: 28, opacity: 100, hardness: 100, spacing: 10 },
    crayon: { size: 22, opacity: 100, hardness: 100, spacing: 10 },
  };
  PP.BRUSH_TYPES = [['soft', '부드러운 브러시'], ['marker', '마커'], ['spray', '스프레이'], ['bristle', '붓'], ['crayon', '크레용']];
  PP.BRUSH_PRESETS = TYPE_PRESETS;

  function make(name, label) {
    const tool = {
      name, label, snap: false, cursor: 'none',
      stroke: null, sprayTimer: null,
      ring() {
        const o = PP.opts(name);
        return Math.max(1, o.size);
      },
      down(pt) {
        if (!PP.canPaint()) return;
        PP.sel.finish();
        const o = PP.opts(name);
        const right = pt.button === 2;
        const type = name === 'brush' ? o.type : name === 'pencil' ? 'pencil' : (o.hardness >= 98 ? 'pencil' : 'soft');
        const erase = name === 'eraser';
        const color = right && !erase ? PP.state.bg : PP.state.fg;
        PP.preview.begin(PP.doc.active(), { opacity: o.opacity / 100, erase });
        this.stroke = new PP.Stroke({
          ctx: PP.preview.ctx, type: erase && type === 'pencil' ? 'soft' : type, size: o.size,
          hardness: erase ? Math.min(o.hardness, 97) : o.hardness, spacing: erase ? 8 : (type === 'pencil' ? 12 : o.spacing),
          smoothing: o.smoothing, pressure: o.pressure, color: erase ? '#000000' : color,
        });
        this.color = color;
        this.stroke.start(pt);
        if (type === 'spray') {
          this.sprayTimer = setInterval(() => { if (this.stroke) { this.stroke.tick(); PP.render(); } }, 28);
        }
        PP.render();
      },
      move(pt) {
        if (!this.stroke) return;
        this.stroke.move(pt);
        PP.render();
      },
      up(pt) {
        if (!this.stroke) return;
        clearInterval(this.sprayTimer);
        this.stroke.end(pt);
        this.stroke = null;
        PP.preview.commit(label);
        if (name !== 'eraser') PP.pushRecent(this.color);
      },
      cancel() {
        clearInterval(this.sprayTimer);
        this.stroke = null;
        PP.preview.cancel();
      },
    };
    PP.tools[name] = tool;
  }
  make('pencil', '연필');
  make('brush', '브러시');
  make('eraser', '지우개');
})(window.PP);
