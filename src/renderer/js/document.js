'use strict';
/* 문서 모델: 레이어 목록, 합성(flatten), 스냅샷 */
(function (PP) {
  PP.BLENDS = [
    ['source-over', '보통'], ['multiply', '곱하기'], ['screen', '스크린'], ['overlay', '오버레이'],
    ['darken', '어둡게'], ['lighten', '밝게'], ['color-dodge', '색상 닷지'], ['color-burn', '색상 번'],
    ['hard-light', '하드 라이트'], ['soft-light', '소프트 라이트'], ['difference', '차이'], ['exclusion', '제외'],
    ['hue', '색조'], ['saturation', '채도'], ['color', '색상'], ['luminosity', '광도'],
  ];

  class Layer {
    constructor(w, h, name, opt = {}) {
      this.id = opt.id || ++PP.uid;
      if (opt.id && opt.id > PP.uid) PP.uid = opt.id;
      this.name = name;
      this.canvas = opt.canvas || PP.makeCanvas(w, h);
      this.visible = opt.visible !== false;
      this.locked = !!opt.locked;
      this.opacity = opt.opacity == null ? 1 : opt.opacity;
      this.blend = opt.blend || 'source-over';
      this.alphaLock = !!opt.alphaLock;
      this.clip = !!opt.clip;
    }
    get ctx() {
      if (!this._ctx || this._ctxCanvas !== this.canvas) {
        this._ctx = this.canvas.getContext('2d');
        this._ctxCanvas = this.canvas;
      }
      return this._ctx;
    }
  }
  PP.Layer = Layer;

  const doc = (PP.doc = {
    width: 0,
    height: 0,
    layers: [], // 아래 → 위
    activeId: null,
    name: '제목 없음',
    path: null,
    fileType: null,
    layerCounter: 0,

    active() { return this.layers.find((l) => l.id === this.activeId) || null; },
    byId(id) { return this.layers.find((l) => l.id === id) || null; },
    indexOf(id) { return this.layers.findIndex((l) => l.id === id); },

    /** 새 문서. bg: 색상 문자열 또는 null(투명) */
    init(w, h, bg, name = '제목 없음') {
      this.width = w;
      this.height = h;
      this.layers = [];
      this.layerCounter = 0;
      const l = new Layer(w, h, '배경');
      if (bg) {
        l.ctx.fillStyle = bg;
        l.ctx.fillRect(0, 0, w, h);
      }
      this.layers.push(l);
      this.activeId = l.id;
      this.name = name;
      this.path = null;
      this.fileType = null;
      PP.history.reset();
      PP.emit('doc:new');
      PP.emit('doc:structure');
    },

    /** 비트맵 하나로 문서 만들기 */
    initFromBitmap(bmp, name, path, fileType) {
      this.init(bmp.width, bmp.height, null, name);
      const l = this.layers[0];
      l.ctx.drawImage(bmp, 0, 0);
      this.path = path || null;
      this.fileType = fileType || null;
      PP.emit('doc:new');
    },

    /** 레이어 배열로 문서 만들기(프로젝트 파일/복구) */
    initFromLayers(w, h, layers, activeIndex, name, path, fileType) {
      this.width = w;
      this.height = h;
      this.layers = layers;
      this.activeId = (layers[activeIndex] || layers[layers.length - 1]).id;
      this.layerCounter = layers.length - 1;
      this.name = name;
      this.path = path || null;
      this.fileType = fileType || null;
      PP.history.reset();
      PP.emit('doc:new');
      PP.emit('doc:structure');
    },

    snapshot() {
      return {
        w: this.width,
        h: this.height,
        activeId: this.activeId,
        layers: this.layers.map((l) => ({
          id: l.id, name: l.name, visible: l.visible, locked: l.locked,
          opacity: l.opacity, blend: l.blend, canvas: l.canvas, alphaLock: l.alphaLock, clip: l.clip,
        })),
      };
    },
    restore(s) {
      this.width = s.w;
      this.height = s.h;
      this.layers = s.layers.map((r) => new Layer(s.w, s.h, r.name, r));
      this.activeId = s.activeId;
      PP.emit('doc:structure');
      PP.render();
    },

    /** 레이어 픽셀이 바뀌었음을 알림 */
    touch(layer) {
      PP.emit('doc:pixels', layer ? layer.id : null);
      PP.render();
    },

    /** 보이는 레이어를 합성한 문서 크기 캔버스 */
    flatten(bg) {
      const c = PP.makeCanvas(this.width, this.height);
      const ctx = c.getContext('2d');
      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, c.width, c.height);
      }
      let base = null;
      for (const l of this.layers) {
        if (!l.clip) base = l;
        if (!l.visible) continue;
        ctx.globalAlpha = l.opacity;
        ctx.globalCompositeOperation = l.blend;
        if (l.clip && base && base !== l) {
          const t = PP.cloneCanvas(l.canvas);
          const tx = t.getContext('2d');
          tx.globalCompositeOperation = 'destination-in';
          tx.drawImage(base.canvas, 0, 0);
          ctx.drawImage(t, 0, 0);
        } else ctx.drawImage(l.canvas, 0, 0);
      }
      return c;
    },

    /** (x,y) 픽셀색. mode: 'all' | 'layer' → {r,g,b,a} */
    sample(x, y, mode) {
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
      const c = PP.makeCanvas(1, 1);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      const list = mode === 'layer' ? [this.active()] : this.layers;
      for (const l of list) {
        if (!l || (!l.visible && mode !== 'layer')) continue;
        ctx.globalAlpha = mode === 'layer' ? 1 : l.opacity;
        ctx.globalCompositeOperation = mode === 'layer' ? 'source-over' : l.blend;
        ctx.drawImage(l.canvas, x, y, 1, 1, 0, 0, 1, 1);
      }
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] };
    },
  });

  /** 현재 레이어에 그릴 수 있는지 검사(숨김/잠금) */
  PP.canPaint = function () {
    const l = doc.active();
    if (!l) return false;
    if (!l.visible) { PP.toast('숨겨진 레이어에는 그릴 수 없습니다'); return false; }
    if (l.locked) { PP.toast('잠긴 레이어입니다'); return false; }
    return true;
  };
})(window.PP);
