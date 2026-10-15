'use strict';
/*
 * 미리보기 레이어: 그리는 동안은 문서 크기의 스트로크 캔버스(canvas) 한 장에만 그린다.
 * 화면에는 뷰포트 크기의 임시 캔버스에서 (레이어 + 스트로크)를 합성해 보여 주므로 프레임 비용이 문서 크기와 무관하다.
 * 획이 끝나면 commit()이 변경 영역(bounds)만 레이어에 병합하고 히스토리에 기록한다.
 */
(function (PP) {
  const P = (PP.preview = {
    canvas: null, ctx: null,
    layer: null, active: false,
    opacity: 1, erase: false,
    bounds: null,

    ensure() {
      const d = PP.doc;
      if (!this.canvas || this.canvas.width !== d.width || this.canvas.height !== d.height) {
        this.canvas = PP.makeCanvas(d.width, d.height);
        this.ctx = this.canvas.getContext('2d');
      }
    },

    begin(layer, opt = {}) {
      if (this.active) this.cancel();
      this.ensure();
      this.layer = layer;
      this.opacity = opt.opacity == null ? 1 : opt.opacity;
      this.erase = !!opt.erase;
      this.active = true;
      this.bounds = null;
      return this.ctx;
    },

    /** 정수 사각형(문서 좌표)을 변경 영역으로 표시 */
    mark(r) {
      r = PP.clipToDoc(r);
      if (!r) return;
      this.bounds = PP.rectUnion(this.bounds, r);
    },
    markPts(x0, y0, x1, y1, pad = 2) {
      this.mark(PP.intRect(x0, y0, x1, y1, pad));
    },
    markAll() { this.mark({ x: 0, y: 0, w: PP.doc.width, h: PP.doc.height }); },

    /** 지금까지 그린 내용을 지운다(도형 미리보기 갱신용). 변경 영역(bounds)은 누적 유지 */
    clear() {
      if (!this.bounds) return;
      this.ctx.clearRect(this.bounds.x, this.bounds.y, this.bounds.w, this.bounds.h);
    },

    /** 스트로크 캔버스의 r 영역을 ctx에 합성 (선택 영역 클립 적용) */
    compositeInto(ctx, r) {
      ctx.save();
      PP.sel.clipCtx(ctx);
      ctx.globalAlpha = this.opacity;
      ctx.globalCompositeOperation = this.erase ? 'destination-out' : 'source-over';
      ctx.drawImage(this.canvas, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      ctx.restore();
    },

    commit(name) {
      if (!this.active) return;
      const layer = this.layer;
      const r = this.bounds;
      this.active = false;
      this.layer = null;
      if (!r) { PP.render(); return; }
      PP.history.pixelOp(layer, r, name, () => this.compositeInto(layer.ctx, r));
      this.ctx.clearRect(r.x, r.y, r.w, r.h);
      this.bounds = null;
      PP.render();
    },

    cancel() {
      if (!this.active) return;
      if (this.bounds) this.ctx.clearRect(this.bounds.x, this.bounds.y, this.bounds.w, this.bounds.h);
      this.active = false;
      this.layer = null;
      this.bounds = null;
      PP.render();
    },
  });

  PP.on('doc:structure', () => {
    const d = PP.doc;
    if (P.canvas && (P.canvas.width !== d.width || P.canvas.height !== d.height)) {
      P.active = false;
      P.canvas = null;
    }
  });
})(window.PP);
