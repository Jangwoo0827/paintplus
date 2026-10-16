'use strict';
/* 파일 열기/저장/새로 만들기 */
(function (PP) {
  const IMG_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'];
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif' };
  const extOf = (n) => (n.split('.').pop() || '').toLowerCase();
  const baseName = (p) => p.split(/[\\/]/).pop();
  const api = window.api;


  // ---------- 플랫폼 계층 (Electron API 없이 동작: 안드로이드 앱/브라우저) ----------
  const cap = window.Capacitor;
  PP.isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const toBase64 = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  PP.platform = {
    pickFile(accept) {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept || 'image/*,.paintplus';
        input.style.display = 'none';
        document.body.append(input);
        let done = false;
        const finish = (v) => { if (!done) { done = true; input.remove(); resolve(v); } };
        input.addEventListener('change', async () => {
          const f = input.files && input.files[0];
          finish(f ? { name: f.name, path: '', data: new Uint8Array(await f.arrayBuffer()) } : null);
        });
        input.addEventListener('cancel', () => finish(null));
        input.click();
      });
    },
    async saveBytes(name, bytes, mime) {
      if (PP.isNative && cap.Plugins && cap.Plugins.Filesystem && cap.Plugins.Share) {
        const w = await cap.Plugins.Filesystem.writeFile({ path: name, data: toBase64(bytes), directory: 'CACHE' });
        await cap.Plugins.Share.share({ title: name, files: [w.uri], dialogTitle: '저장할 곳을 선택하세요' });
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes], { type: mime }));
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
    },
  };

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
      const o = await PP.ui.newDocDialog();
      if (!o) return;
      const bg = o.bg === 'white' ? '#ffffff' : o.bg === 'transparent' ? null : o.bg === 'bg' ? PP.state.bg : PP.state.fg;
      PP.tabs.new2d(o.w, o.h, bg);
    },

    async open() {
      if (!api) {
        const f = await PP.platform.pickFile();
        if (f) await F.openFile(f);
        return;
      }
      const files = await api.openDialog({
        title: '열기',
        filters: [
          { name: '그림판+ 지원 파일', extensions: [...IMG_EXTS, 'paintplus', 'pp3d', 'glb', 'gltf', 'obj', 'stl'] },
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
        if (['pp3d', 'glb', 'gltf', 'obj', 'stl'].includes(ext)) { await F.open3d(f); return; }
        PP.tabs.prepare2d();
        if (ext === 'paintplus') {
          await PP.project.load(f.data, f.name, f.path);
        } else {
          const bmp = await PP.bytesToBitmap(f.data, MIME[ext]);
          PP.doc.initFromBitmap(bmp, f.name, f.path, ext === 'jpeg' ? 'jpg' : ext);
          bmp.close && bmp.close();
        }
        api && api.clearRecovery();
        if (f.path && PP.hub) PP.addRecentFile(f.path, f.name, '2d', PP.thumb2d());
      } catch (err) {
        console.error(err);
        PP.ui.alert('파일을 열 수 없습니다.\n' + (err.message || err));
      }
    },

    async openPath(p) {
      if (!api) return;
      try {
        await F.openFile(await api.readFile(p));
      } catch (err) {
        PP.ui.alert('파일을 열 수 없습니다.\n' + (err.message || err));
      }
    },

    /** 드래그&드롭 File */
    async openDropped(file) {
      const ext = extOf(file.name);
      if (![...IMG_EXTS, 'paintplus', 'pp3d', 'glb', 'gltf', 'obj', 'stl'].includes(ext)) { PP.toast('지원하지 않는 파일 형식입니다'); return; }
      const data = new Uint8Array(await file.arrayBuffer());
      await F.openFile({ name: file.name, path: api ? api.pathForFile(file) : '', data });
    },

    /** 이미지 파일을 새 레이어로 가져오기 */
    async importAsLayer() {
      const files = api
        ? await api.openDialog({ title: '이미지를 레이어로 가져오기', filters: [{ name: '이미지', extensions: IMG_EXTS }] })
        : [await PP.platform.pickFile('image/*')].filter(Boolean);
      if (!files.length) return;
      const bmp = await PP.bytesToBitmap(files[0].data, MIME[extOf(files[0].name)]);
      PP.layers.add('가져온 이미지');
      await PP.clip.pasteBitmap(bmp);
    },

    async save() {
      if (PP.tabs.is3d()) return F.save3d(false);
      if (!PP.doc.path || !PP.doc.fileType) return F.saveAs();
      return F.writeTo(PP.doc.path, PP.doc.fileType);
    },

    async saveAs() {
      if (PP.tabs.is3d()) return F.save3d(true);
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
      if (!api) return F.mobileSave(stem);
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
        if (PP.hub) PP.addRecentFile(path, PP.doc.name, '2d', PP.thumb2d());
        PP.toast('저장했습니다: ' + PP.doc.name);
        return true;
      } catch (err) {
        console.error(err);
        PP.ui.alert('저장하지 못했습니다.\n' + (err.message || err));
        return false;
      }
    },

    /** 데스크톱 API가 없을 때(휴대폰/브라우저): 형식을 고르고 공유/다운로드로 내보낸다 */
    async mobileSave(stem) {
      const name = PP.ui.text(stem, 'text');
      const fmt = PP.ui.select([['png', 'PNG 이미지'], ['jpg', 'JPEG 이미지'], ['webp', 'WebP 이미지'], ['paintplus', '그림판+ 프로젝트 (레이어 보존)']], PP.doc.layers.length > 1 ? 'paintplus' : 'png');
      const r = await PP.ui.modal({
        title: PP.isNative ? '저장 / 공유' : '저장',
        body: [PP.ui.row('파일 이름', name), PP.ui.row('형식', fmt)],
        buttons: [{ label: PP.isNative ? '저장/공유' : '다운로드', value: true, primary: true }, { label: '취소', value: null }],
      }).promise;
      if (!r) return false;
      const type = fmt.value;
      const fname = (name.value.trim() || stem).replace(/\.[^.]+$/, '') + '.' + type;
      try {
        const bytes = await F.encode(type);
        await PP.platform.saveBytes(fname, bytes, type === 'paintplus' ? 'application/json' : MIME[type]);
        PP.doc.name = fname;
        PP.doc.fileType = type;
        PP.history.markSaved();
        PP.emit('doc:meta');
        return true;
      } catch (e) {
        if (e && /cancel/i.test(String(e.message || e))) return false;
        console.error(e);
        PP.ui.alert('저장하지 못했습니다.\n' + (e.message || e));
        return false;
      }
    },
  });

  // ---------- 3D 파일 ----------
  F.openPathAny = async function (p) {
    if (!api) return;
    const f = await api.readFile(p);
    await F.openFile(f);
  };
  F.open3d = async function (f) {
    const ext = extOf(f.name);
    if (ext === 'pp3d') {
      const s = PP.Scene3D.fromBytes(f.data, f.name);
      s.path = f.path || null;
      PP.tabs.new3d(s);
      if (f.path) PP.addRecentFile(f.path, f.name, '3d', PP.three.thumbnail());
      return;
    }
    // glb/gltf/obj/stl: 현재 3D 탭에 객체로 추가 (3D 탭이 아니면 새 3D 탭)
    if (!PP.tabs.is3d()) { const s = new PP.Scene3D(); s.resetHistory(); PP.tabs.new3d(s); }
    await PP.three.importModel(f.name, f.data);
  };
  F.importModel = async function () {
    const f = api
      ? (await api.openDialog({ title: '3D 모델 가져오기', filters: [{ name: '3D 모델', extensions: ['glb', 'gltf', 'obj', 'stl'] }] }))[0]
      : await PP.platform.pickFile('.glb,.gltf,.obj,.stl');
    if (f) await F.open3d(f);
  };
  F.save3d = async function (as) {
    const s = PP.three.scene;
    if (!s) return false;
    let path = s.path;
    const bytes = s.serialize();
    if (!api) {
      const name = (s.name.replace(/\.[^.]+$/, '') || 'model') + '.pp3d';
      await PP.platform.saveBytes(name, bytes, 'application/json');
      s.name = name; s.savedIndex = s.index; PP.emit('tabs:update');
      return true;
    }
    if (!path || as) {
      path = await api.saveDialog({ title: '3D 저장', defaultPath: path || s.name.replace(/\.[^.]+$/, '') + '.pp3d', filters: [{ name: '그림판+ 3D', extensions: ['pp3d'] }] });
      if (!path) return false;
      if (!/\.pp3d$/i.test(path)) path += '.pp3d';
    }
    await api.writeFile(path, bytes);
    s.path = path;
    s.name = path.split(/[\\/]/).pop();
    s.savedIndex = s.index;
    PP.addRecentFile(path, s.name, '3d', PP.three.thumbnail());
    PP.emit('tabs:update');
    PP.toast('저장했습니다: ' + s.name);
    return true;
  };

  PP.defCmd('file.import', '이미지를 레이어로 가져오기...', '', () => F.importAsLayer());
})(window.PP);
