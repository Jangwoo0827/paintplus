'use strict';
/* 프로젝트 파일(.paintplus): 레이어 구성을 그대로 보존하는 JSON (레이어 이미지는 PNG data URL) + 자동 임시 저장(복구) */
(function (PP) {
  const api = window.api;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  PP.project = {
    /** 현재 문서를 .paintplus 바이트로 */
    async serialize(opts = {}) {
      if (!opts.keepFloat) PP.sel.finish();
      const d = PP.doc;
      const json = {
        app: 'paintplus', version: 1,
        width: d.width, height: d.height,
        activeIndex: d.indexOf(d.activeId),
        layers: d.layers.map((l) => ({
          name: l.name, visible: l.visible, locked: l.locked, opacity: l.opacity, blend: l.blend,
          data: l.canvas.toDataURL('image/png'),
        })),
      };
      return enc.encode(JSON.stringify(json));
    },

    /** .paintplus 바이트로 문서 열기 */
    async load(bytes, name, path, opts = {}) {
      const j = JSON.parse(dec.decode(bytes));
      if (!j || j.app !== 'paintplus' || !Array.isArray(j.layers) || !j.layers.length) throw new Error('그림판+ 프로젝트 파일이 아닙니다');
      const w = PP.clamp(j.width | 0, 1, 16384), h = PP.clamp(j.height | 0, 1, 16384);
      const layers = [];
      for (const ld of j.layers) {
        const img = await PP.clip.loadDataUrl(ld.data);
        const c = PP.makeCanvas(w, h);
        c.getContext('2d').drawImage(img, 0, 0);
        layers.push(new PP.Layer(w, h, ld.name || '레이어', {
          canvas: c, visible: ld.visible !== false, locked: !!ld.locked,
          opacity: typeof ld.opacity === 'number' ? PP.clamp(ld.opacity, 0, 1) : 1, blend: ld.blend || 'source-over',
        }));
      }
      PP.doc.initFromLayers(w, h, layers, j.activeIndex | 0, name, opts.recovered ? null : path, opts.recovered ? null : 'paintplus');
    },
  };

  // ---------- 자동 임시 저장 / 복구 ----------
  let lastIndex = -1;
  let timer = null;
  const A = (PP.autosave = {
    async tick() {
      if (!api || !PP.history.isDirty()) return;
      if (PP.vp.isDrawing() || PP.preview.active || PP.sel.float || PP.pendingActive()) return;
      const key = PP.history.index + ':' + PP.history.stack.length;
      if (key === A.lastKey) return;
      try {
        const bytes = await PP.project.serialize({ keepFloat: true });
        await api.writeRecovery(bytes);
        A.lastKey = key;
      } catch (e) { console.error('자동 저장 실패', e); }
    },
    start() {
      if (!api || timer) return;
      timer = setInterval(() => A.tick(), 30000);
    },
    async offerRecovery() {
      if (!api) return;
      const data = await api.readRecovery();
      if (!data || !data.length) return;
      const ok = await PP.ui.confirm('저장하지 않고 종료된 이전 작업이 있습니다.\n복구할까요?', '복구', '작업 복구');
      if (ok) {
        try {
          await PP.project.load(new Uint8Array(data), '복구된 작업', null, { recovered: true });
          PP.history.savedIndex = -1; // 저장되지 않은 상태로 표시
          PP.emit('history');
          PP.toast('이전 작업을 복구했습니다');
        } catch (e) {
          PP.ui.alert('복구할 수 없습니다.\n' + e.message);
        }
      } else {
        api.clearRecovery();
      }
    },
  });
})(window.PP);
