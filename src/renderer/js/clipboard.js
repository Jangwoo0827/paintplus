'use strict';
/* 클립보드(복사/잘라내기/붙여넣기) + 편집 명령 */
(function (PP) {
  const api = window.api;
  const C = (PP.clip = {
    internal: null, // 마지막으로 복사한 캔버스 (시스템 클립보드를 못 읽을 때 대비)

    async writeSystem(canvas) {
      if (!api) return;
      try { await api.writeClipboardImage(canvas.toDataURL('image/png')); } catch (e) { console.error(e); }
    },

    loadDataUrl(url) {
      return new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => {
          const c = PP.makeCanvas(img.naturalWidth, img.naturalHeight);
          c.getContext('2d').drawImage(img, 0, 0);
          res(c);
        };
        img.onerror = () => rej(new Error('이미지를 읽을 수 없습니다'));
        img.src = url;
      });
    },

    async copy() {
      const r = PP.sel.extract();
      if (!r) return;
      C.internal = r.canvas;
      await C.writeSystem(r.canvas);
      PP.toast(PP.sel.hasAny() ? '선택 영역을 복사했습니다' : '현재 레이어를 복사했습니다');
    },

    async copyAll() {
      PP.sel.finish();
      const c = PP.doc.flatten();
      C.internal = c;
      await C.writeSystem(c);
      PP.toast('전체 이미지를 클립보드에 복사했습니다');
    },

    async cut() {
      if (!PP.sel.hasAny()) { PP.toast('잘라낼 선택 영역이 없습니다'); return; }
      if (!PP.canPaint()) return;
      const r = PP.sel.extract();
      if (!r) return;
      C.internal = r.canvas;
      await C.writeSystem(r.canvas);
      PP.sel.clearContent();
      PP.sel.poly = null;
      PP.emit('selection');
      PP.renderOverlay();
      PP.toast('잘라냈습니다');
    },

    delete() {
      if (!PP.sel.hasAny()) return;
      PP.sel.clearContent();
    },

    async readImage() {
      if (api) {
        try {
          const url = await api.readClipboardImage();
          if (url) return await C.loadDataUrl(url);
        } catch (e) { console.error(e); }
      }
      return C.internal;
    },

    async paste() {
      const img = await C.readImage();
      if (!img) { PP.toast('클립보드에 이미지가 없습니다'); return; }
      await C.pasteBitmap(img);
    },

    /** ImageBitmap/Canvas 를 떠 있는 선택으로 붙여넣기 */
    async pasteBitmap(img) {
      PP.sel.finish();
      if (!PP.canPaint()) return;
      let canvas = img;
      if (!(img instanceof HTMLCanvasElement)) {
        canvas = PP.makeCanvas(img.width, img.height);
        canvas.getContext('2d').drawImage(img, 0, 0);
      }
      if (canvas.width > PP.doc.width || canvas.height > PP.doc.height) {
        const grow = await PP.ui.confirm(
          `붙여넣을 이미지(${canvas.width}×${canvas.height})가 캔버스(${PP.doc.width}×${PP.doc.height})보다 큽니다.\n캔버스 크기를 이미지에 맞게 늘릴까요?`, '캔버스 확장', '붙여넣기');
        if (grow) PP.img.canvasSize(Math.max(PP.doc.width, canvas.width), Math.max(PP.doc.height, canvas.height), 0, 0, false);
      }
      PP.selectTool('selrect');
      const vr = PP.vp.visibleDocRect();
      const x = PP.clamp(Math.round(vr.x), 0, Math.max(0, PP.doc.width - canvas.width));
      const y = PP.clamp(Math.round(vr.y), 0, Math.max(0, PP.doc.height - canvas.height));
      PP.sel.startFloat(canvas, x, y);
      PP.toast('붙여넣었습니다 — 드래그하여 이동, Enter 로 확정');
    },

    async pasteAsNew() {
      const img = await C.readImage();
      if (!img) { PP.toast('클립보드에 이미지가 없습니다'); return; }
      if (!(await PP.files.confirmDiscard())) return;
      PP.doc.init(img.width, img.height, null);
      PP.doc.layers[0].ctx.drawImage(img, 0, 0);
      PP.doc.touch(PP.doc.layers[0]);
    },
  });

  const D = PP.defCmd;
  const hasSel = () => PP.sel.hasAny();
  D('edit.copy', '복사', 'Ctrl+C', () => C.copy());
  D('edit.cut', '잘라내기', 'Ctrl+X', () => C.cut(), { enabled: hasSel });
  D('edit.paste', '붙여넣기', 'Ctrl+V', () => C.paste());
  D('edit.pasteNew', '새 이미지로 붙여넣기', 'Ctrl+Alt+V', () => C.pasteAsNew());
  D('edit.delete', '삭제', 'Delete / Backspace', () => C.delete(), { enabled: hasSel });
  D('edit.selectall', '모두 선택', 'Ctrl+A', () => { PP.selectTool(PP.state.tool === 'sellasso' ? 'sellasso' : 'selrect'); PP.sel.selectAll(); });
  D('edit.deselect', '선택 해제', 'Ctrl+D', () => PP.sel.deselect(), { enabled: hasSel });
  D('clip.copyAll', '전체 이미지를 클립보드로 복사', 'Ctrl+Shift+C', () => C.copyAll());
})(window.PP);
