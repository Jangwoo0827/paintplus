'use strict';
/* 실행 취소/다시 실행: 명령 패턴. 픽셀 변경은 '변경 사각형만' 저장하고 undo/redo 때 서로 맞바꾼다. */
(function (PP) {
  const MAX_STEPS = 1000;
  const MIN_KEEP = 100; // 메모리가 넘쳐도 최소 이만큼은 유지
  const MAX_COST = 1.5e9; // 대략적인 바이트 한도

  const H = (PP.history = {
    stack: [],
    index: 0, // 적용된 명령 개수
    savedIndex: 0,
    cost: 0,
    busy: false,

    reset() {
      this.stack = [];
      this.index = 0;
      this.savedIndex = 0;
      this.cost = 0;
      PP.emit('history');
    },

    push(cmd) {
      cmd.cost = cmd.cost || 0;
      const dropped = this.stack.splice(this.index);
      dropped.forEach((c) => { this.cost -= c.cost; });
      if (this.savedIndex > this.index) this.savedIndex = -1;
      this.stack.push(cmd);
      this.cost += cmd.cost;
      this.index = this.stack.length;
      while (this.stack.length > MAX_STEPS || (this.cost > MAX_COST && this.stack.length > MIN_KEEP)) {
        const old = this.stack.shift();
        this.cost -= old.cost;
        this.index--;
        this.savedIndex--;
        if (this.savedIndex < 0) this.savedIndex = -1;
      }
      PP.emit('history');
    },

    canUndo() { return this.index > 0; },
    canRedo() { return this.index < this.stack.length; },

    undo() {
      if (!this.canUndo()) return;
      PP.sel && PP.sel.beforeHistory();
      const cmd = this.stack[--this.index];
      cmd.undo();
      PP.emit('history');
      PP.render();
    },
    redo() {
      if (!this.canRedo()) return;
      PP.sel && PP.sel.beforeHistory();
      const cmd = this.stack[this.index++];
      cmd.redo();
      PP.emit('history');
      PP.render();
    },
    /** 히스토리 패널에서 특정 상태로 이동 (i = 적용된 명령 개수) */
    jump(i) {
      i = PP.clamp(i, 0, this.stack.length);
      while (this.index > i) this.undo();
      while (this.index < i) this.redo();
    },

    isDirty() { return this.index !== this.savedIndex; },
    markSaved() { this.savedIndex = this.index; PP.emit('history'); },

    /** layer의 rect 영역을 fn()으로 바꾸고, 그 변경을 한 단계로 기록 */
    pixelOp(layer, rect, name, fn) {
      rect = rect && PP.clipToDoc(rect);
      if (!rect) { fn(); return; }
      const before = PP.cropCanvas(layer.canvas, rect);
      fn();
      this.pushSwap(layer.id, rect, before, name);
      PP.doc.touch(layer);
    },

    /** buf(변경 전 픽셀)가 있고 레이어에는 이미 변경 후 픽셀이 들어 있을 때 기록 */
    pushSwap(layerId, rect, buf, name) {
      const cmd = { name, cost: rect.w * rect.h * 4, buf };
      const swap = () => {
        const layer = PP.doc.byId(layerId);
        if (!layer) return;
        const tmp = PP.cropCanvas(layer.canvas, rect);
        layer.ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
        layer.ctx.drawImage(cmd.buf, rect.x, rect.y);
        cmd.buf = tmp;
        PP.doc.touch(layer);
      };
      cmd.undo = swap;
      cmd.redo = swap;
      this.push(cmd);
    },

    /** 레이어 구성/크기가 바뀌는 작업. fn() 전후 스냅샷으로 되돌린다. */
    structural(name, fn) {
      const before = PP.doc.snapshot();
      fn();
      const after = PP.doc.snapshot();
      const seen = new Set(before.layers.map((l) => l.canvas));
      let cost = 0;
      for (const l of after.layers) {
        if (!seen.has(l.canvas)) cost += l.canvas.width * l.canvas.height * 4;
      }
      const seen2 = new Set(after.layers.map((l) => l.canvas));
      for (const l of before.layers) {
        if (!seen2.has(l.canvas)) cost += l.canvas.width * l.canvas.height * 4;
      }
      this.push({
        name, cost,
        undo: () => PP.doc.restore(before),
        redo: () => PP.doc.restore(after),
      });
      PP.emit('doc:structure');
      PP.render();
    },

    /** 속성 변경(불투명도, 이름 등) 같은 가벼운 명령 */
    prop(name, undo, redo) {
      this.push({ name, cost: 64, undo, redo });
    },
  });
})(window.PP);
