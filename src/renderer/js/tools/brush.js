'use strict';
/* 연필 / 브러시(여러 종류) / 지우개 */
(function (PP) {
  const TYPE_PRESETS = {
    soft: { size: 24, opacity: 100, hardness: 50, spacing: 12 },
    marker: { size: 22, opacity: 65, hardness: 100, spacing: 6 },
    spray: { size: 48, opacity: 100, hardness: 100, spacing: 20 },
    bristle: { size: 28, opacity: 100, hardness: 100, spacing: 10 },
    crayon: { size: 22, opacity: 100, hardness: 100, spacing: 10 },
    airbrush: { size: 70, opacity: 100, hardness: 0, spacing: 6, smoothing: 10 },
    ink: { size: 10, opacity: 100, hardness: 100, spacing: 6, smoothing: 40, pressure: true, velocity: 55 },
    watercolor: { size: 54, opacity: 70, hardness: 0, spacing: 12, smoothing: 25 },
    gouache: { size: 36, opacity: 92, hardness: 100, spacing: 8, smoothing: 15 },
    chalk: { size: 32, opacity: 90, hardness: 100, spacing: 8 },
    charcoal: { size: 28, opacity: 95, hardness: 100, spacing: 7 },
    pastel: { size: 36, opacity: 85, hardness: 100, spacing: 9 },
    glow: { size: 34, opacity: 100, hardness: 0, spacing: 7, smoothing: 20 },
    pixel: { size: 4, opacity: 100, hardness: 100, spacing: 40, smoothing: 0 },
    star: { size: 30, opacity: 100, hardness: 100, spacing: 170, smoothing: 10 },
  };
  PP.BRUSH_TYPES = [['soft', '부드러운 브러시'], ['airbrush', '에어브러시'], ['ink', '잉크 / 핀펜'], ['watercolor', '수채화'], ['gouache', '과슈'], ['chalk', '분필'], ['charcoal', '목탄'], ['pastel', '파스텔'], ['crayon', '크레용'], ['marker', '마커'], ['spray', '스프레이'], ['bristle', '붓'], ['glow', '네온 / 글로우'], ['pixel', '픽셀 아트'], ['star', '패턴(별)']];
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
        PP.preview.begin(PP.doc.active(), { opacity: o.opacity / 100, erase, blend: type === 'glow' ? 'lighter' : null });
        this.stroke = new PP.Stroke({
          ctx: PP.preview.ctx, type: erase && type === 'pencil' ? 'soft' : type, size: o.size,
          hardness: erase ? Math.min(o.hardness, 97) : o.hardness, spacing: erase ? 8 : (type === 'pencil' ? 12 : o.spacing),
          smoothing: o.smoothing, pressure: o.pressure, color: erase ? '#000000' : color,
          jitter: o.jitter, velocity: o.velocity, tilt: o.tilt, colorJitter: o.colorJitter,
        });
        this.color = color;
        this.stroke.start(pt);
        if (type === 'spray' || type === 'airbrush') {
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
