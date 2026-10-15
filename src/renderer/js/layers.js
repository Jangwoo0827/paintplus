'use strict';
/* 레이어 조작 (모두 실행 취소 가능) */
(function (PP) {
  const doc = PP.doc;
  const changed = () => { PP.emit('doc:structure'); PP.render(); };

  const L = (PP.layers = {
    setActive(id) {
      if (doc.activeId === id || !doc.byId(id)) return;
      PP.sel.finish();
      doc.activeId = id;
      changed();
    },

    add(name) {
      PP.sel.finish();
      const idx = doc.indexOf(doc.activeId) + 1;
      PP.history.structural('레이어 추가', () => {
        const l = new PP.Layer(doc.width, doc.height, name || `레이어 ${++doc.layerCounter}`);
        doc.layers.splice(idx, 0, l);
        doc.activeId = l.id;
      });
    },

    remove(id = doc.activeId) {
      if (doc.layers.length <= 1) { PP.toast('마지막 레이어는 삭제할 수 없습니다'); return; }
      PP.sel.finish();
      const i = doc.indexOf(id);
      PP.history.structural('레이어 삭제', () => {
        doc.layers.splice(i, 1);
        doc.activeId = doc.layers[Math.min(i, doc.layers.length - 1)].id;
      });
    },

    duplicate(id = doc.activeId) {
      PP.sel.finish();
      const i = doc.indexOf(id);
      const src = doc.layers[i];
      PP.history.structural('레이어 복제', () => {
        const l = new PP.Layer(doc.width, doc.height, src.name + ' 복사본', {
          canvas: PP.cloneCanvas(src.canvas), visible: src.visible, locked: false, opacity: src.opacity, blend: src.blend,
        });
        doc.layers.splice(i + 1, 0, l);
        doc.activeId = l.id;
      });
    },

    mergeDown(id = doc.activeId) {
      const i = doc.indexOf(id);
      if (i <= 0) { PP.toast('아래에 병합할 레이어가 없습니다'); return; }
      PP.sel.finish();
      const lower = doc.layers[i - 1], upper = doc.layers[i];
      if (lower.locked) { PP.toast('아래 레이어가 잠겨 있습니다'); return; }
      PP.history.structural('아래로 병합', () => {
        const merged = new PP.Layer(doc.width, doc.height, lower.name, {
          id: lower.id, canvas: PP.cloneCanvas(lower.canvas), visible: lower.visible, locked: lower.locked, opacity: lower.opacity, blend: lower.blend,
        });
        if (upper.visible) {
          const c = merged.ctx;
          c.globalAlpha = upper.opacity;
          c.globalCompositeOperation = upper.blend;
          c.drawImage(upper.canvas, 0, 0);
          c.globalAlpha = 1;
          c.globalCompositeOperation = 'source-over';
        }
        doc.layers.splice(i - 1, 2, merged);
        doc.activeId = merged.id;
      });
    },

    flatten() {
      if (doc.layers.length <= 1) return;
      PP.sel.finish();
      PP.history.structural('이미지 병합', () => {
        const l = new PP.Layer(doc.width, doc.height, '배경', { canvas: doc.flatten() });
        doc.layers = [l];
        doc.activeId = l.id;
      });
    },

    /** 인덱스 기준으로 이동 (newIdx = 제거 후 삽입 위치) */
    move(from, to) {
      if (from === to || from < 0 || to < 0 || from >= doc.layers.length || to >= doc.layers.length) return;
      PP.sel.finish();
      PP.history.structural('레이어 순서 변경', () => {
        const [l] = doc.layers.splice(from, 1);
        doc.layers.splice(to, 0, l);
      });
    },
    moveUp(id = doc.activeId) { const i = doc.indexOf(id); L.move(i, i + 1); },
    moveDown(id = doc.activeId) { const i = doc.indexOf(id); L.move(i, i - 1); },

    /** 속성 변경 + 히스토리. 슬라이더처럼 연속 변경은 before를 호출자가 넘긴다. */
    commitProp(id, prop, before, after, name) {
      if (before === after) return;
      const apply = (v) => {
        const l = doc.byId(id);
        if (l) { l[prop] = v; changed(); }
      };
      PP.history.prop(name, () => apply(before), () => apply(after));
    },
    setProp(id, prop, value, name) {
      const l = doc.byId(id);
      if (!l) return;
      const before = l[prop];
      l[prop] = value;
      changed();
      L.commitProp(id, prop, before, value, name);
    },
    rename(id, name) {
      name = name.trim();
      const l = doc.byId(id);
      if (!l || !name || l.name === name) return;
      L.setProp(id, 'name', name, '레이어 이름 변경');
    },
  });

  PP.defCmd('layer.add', '새 레이어', 'Ctrl+Shift+N', () => L.add());
  PP.defCmd('layer.dup', '레이어 복제', 'Ctrl+J', () => L.duplicate());
  PP.defCmd('layer.del', '레이어 삭제', '', () => L.remove());
  PP.defCmd('layer.up', '레이어를 위로', "Ctrl+]", () => L.moveUp());
  PP.defCmd('layer.down', '레이어를 아래로', "Ctrl+[", () => L.moveDown());
  PP.defCmd('layer.mergeDown', '아래 레이어와 병합', 'Ctrl+E', () => L.mergeDown());
  PP.defCmd('layer.flatten', '이미지 병합', 'Ctrl+Shift+E', () => L.flatten(), { enabled: () => doc.layers.length > 1 });
})(window.PP);
