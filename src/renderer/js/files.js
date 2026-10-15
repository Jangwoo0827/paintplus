'use strict';
/* 파일 열기/저장/새로 만들기 */
(function (PP) {
  const IMG_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'];
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif' };
  const extOf = (n) => (n.split('.').pop() || '').toLowerCase();
  const baseName = (p) => p.split(/[\\/]/).pop();
  const api = window.api;

  const F = (PP.files = {
    /** 현재 문서를 버려도 되는지 확인(저장 여부 묻기). true = 진행 */
    async confirmDiscard() {
      PP.sel.finish();
      if (!PP.history.isDirty()) return true;
      const r = await PP.ui.confirmSave(PP.doc.name);
      if (r === 'save') return F.save();
      return r === 'discard';
    },

    async newDoc() {
      if (!(await F.confirmDiscard())) return;
      const o = await PP.ui.newDocDialog();
      if (!o) return;
      const bg = o.bg === 'white' ? '#ffffff' : o.bg === 'transparent' ? null : o.bg === 'bg' ? PP.state.bg : PP.state.fg;
      PP.doc.init(o.w, o.h, bg);
    },

    async open() {
      if (!(await F.confirmDiscard())) return;
      if (!api) { PP.toast('브라우저 모드에서는 파일 열기를 지원하지 않습니다'); return; }
      const files = await api.openDialog({
        title: '열기',
        filters: [
          { name: '그림판+ 지원 파일', extensions: [...IMG_EXTS, 'paintplus'] },
          { name: '이미지 (PNG, JPG, WebP, BMP)', extensions: IMG_EXTS },
          { name: '그림판+ 프로젝트', extensions: ['paintplus'] },
          { name: '모든 파일', extensions: ['*'] },
        ],
      });
      if (files.length) await F.openFile(files[0]);
    },

    /** {name, path, data:Uint8Array} 로 문서 열기 (저장 확인은 호출 측에서) */
    async openFile(f) {
      const ext = extOf(f.name);
      try {
        if (ext === 'paintplus') {
          await PP.project.load(f.data, f.name, f.path);
        } else {
          const bmp = await PP.bytesToBitmap(f.data, MIME[ext]);
          PP.doc.initFromBitmap(bmp, f.name, f.path, ext === 'jpeg' ? 'jpg' : ext);
          bmp.close && bmp.close();
        }
        api && api.clearRecovery();
      } catch (err) {
        console.error(err);
        PP.ui.alert('파일을 열 수 없습니다.\n' + (err.message || err));
      }
    },

    async openPath(p) {
      if (!api) return;
      if (!(await F.confirmDiscard())) return;
      try {
        await F.openFile(await api.readFile(p));
      } catch (err) {
        PP.ui.alert('파일을 열 수 없습니다.\n' + (err.message || err));
      }
    },

    /** 드래그&드롭 File */
    async openDropped(file) {
      const ext = extOf(file.name);
      if (!IMG_EXTS.includes(ext) && ext !== 'paintplus') { PP.toast('지원하지 않는 파일 형식입니다'); return; }
      if (!(await F.confirmDiscard())) return;
      const data = new Uint8Array(await file.arrayBuffer());
      await F.openFile({ name: file.name, path: api ? api.pathForFile(file) : '', data });
    },

    /** 이미지 파일을 새 레이어로 가져오기 */
    async importAsLayer() {
      if (!api) return;
      const files = await api.openDialog({ title: '이미지를 레이어로 가져오기', filters: [{ name: '이미지', extensions: IMG_EXTS }] });
      if (!files.length) return;
      const bmp = await PP.bytesToBitmap(files[0].data, MIME[extOf(files[0].name)]);
      PP.layers.add('가져온 이미지');
      await PP.clip.pasteBitmap(bmp);
    },

    async save() {
      if (!PP.doc.path || !PP.doc.fileType) return F.saveAs();
      return F.writeTo(PP.doc.path, PP.doc.fileType);
    },

    async saveAs() {
      PP.sel.finish();
      const t = PP.doc.fileType;
      const all = [
        { name: 'PNG 이미지', extensions: ['png'] },
        { name: 'JPEG 이미지', extensions: ['jpg', 'jpeg'] },
        { name: 'WebP 이미지', extensions: ['webp'] },
        { name: '그림판+ 프로젝트 (레이어 보존)', extensions: ['paintplus'] },
      ];
      const first = t === 'jpg' ? 1 : t === 'webp' ? 2 : t === 'paintplus' ? 3 : (PP.doc.layers.length > 1 && !t ? 3 : 0);
      const filters = [all[first], ...all.filter((_, i) => i !== first)];
      const stem = PP.doc.name.replace(/\.[^.]+$/, '');
      if (!api) return F.browserDownload(stem);
      const p = await api.saveDialog({ title: '다른 이름으로 저장', defaultPath: PP.doc.path || stem + '.' + filters[0].extensions[0], filters });
      if (!p) return false;
      let ext = extOf(p);
      let path = p;
      if (!['png', 'jpg', 'jpeg', 'webp', 'paintplus'].includes(ext)) { ext = 'png'; path = p + '.png'; }
      return F.writeTo(path, ext === 'jpeg' ? 'jpg' : ext);
    },

    async encode(type) {
      PP.sel.finish();
      if (type === 'paintplus') return PP.project.serialize();
      const flat = PP.doc.flatten(type === 'jpg' ? '#ffffff' : null);
      const mime = type === 'jpg' ? 'image/jpeg' : type === 'webp' ? 'image/webp' : 'image/png';
      return PP.canvasToBytes(flat, mime, 0.92);
    },

    async writeTo(path, type) {
      try {
        const bytes = await F.encode(type);
        await api.writeFile(path, bytes);
        PP.doc.path = path;
        PP.doc.name = baseName(path);
        PP.doc.fileType = type;
        PP.history.markSaved();
        api.clearRecovery();
        PP.emit('doc:meta');
        PP.toast('저장했습니다: ' + PP.doc.name);
        return true;
      } catch (err) {
        console.error(err);
        PP.ui.alert('저장하지 못했습니다.\n' + (err.message || err));
        return false;
      }
    },

    async browserDownload(stem) {
      const bytes = await F.encode('png');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      a.download = stem + '.png';
      a.click();
      return true;
    },
  });
  PP.defCmd('file.import', '이미지를 레이어로 가져오기...', '', () => F.importAsLayer());
})(window.PP);
