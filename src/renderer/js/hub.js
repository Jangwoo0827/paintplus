'use strict';
/* 허브(시작 화면): 새로 만들기, 열기, 최근 파일, 내 폴더(라이브러리), 3D 가져오기 */
(function (PP) {
  const api = window.api;
  const H = (PP.hub = {});
  let root, recentBox, libBox;

  const KIND_OF = { paintplus: '2d', png: '2d', jpg: '2d', jpeg: '2d', webp: '2d', bmp: '2d', gif: '2d', pp3d: '3d', glb: '3d', gltf: '3d', obj: '3d', stl: '3d' };
  const extOf = (n) => (n.split('.').pop() || '').toLowerCase();

  // ---------- 최근 파일 ----------
  PP.recentFiles = PP.store.get('recentFiles', []);
  PP.addRecentFile = function (path, name, kind, thumb) {
    if (!path) return;
    PP.recentFiles = [{ path, name, kind, thumb: thumb || null, time: Date.now() }, ...PP.recentFiles.filter((r) => r.path !== path)].slice(0, 24);
    PP.store.set('recentFiles', PP.recentFiles);
  };
  PP.thumb2d = function () {
    try {
      const flat = PP.doc.flatten('#ffffff');
      const k = Math.min(1, 220 / Math.max(flat.width, flat.height));
      const c = PP.makeCanvas(flat.width * k, flat.height * k);
      c.getContext('2d').drawImage(flat, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.7);
    } catch (_) { return null; }
  };

  // ---------- 화면 ----------
  function card(item) {
    const c = PP.el('button', { class: 'hub-card', title: item.path || item.name });
    const th = PP.el('div', { class: 'hub-th' });
    if (item.thumb) th.style.backgroundImage = `url(${item.thumb})`;
    else th.textContent = item.kind === '3d' ? '3D' : '2D';
    c.append(th, PP.el('div', { class: 'hub-nm', text: item.name }), PP.el('div', { class: 'hub-sub', text: (item.kind === '3d' ? '3D 모델' : '2D 그림') + (item.time ? ' · ' + new Date(item.time).toLocaleDateString('ko-KR') : '') }));
    c.addEventListener('click', () => H.openPath(item.path));
    return c;
  }
  function renderRecent() {
    recentBox.textContent = '';
    if (!api) {
      recentBox.append(PP.el('div', { class: 'set-dim', text: '이 기기에서는 "파일 열기"로 불러오세요. (최근 파일 목록은 PC 앱에서 제공됩니다)' }));
      return;
    }
    if (!PP.recentFiles.length) { recentBox.append(PP.el('div', { class: 'set-dim', text: '아직 저장한 파일이 없습니다. 새 프로젝트를 시작해 보세요.' })); return; }
    for (const r of PP.recentFiles) recentBox.append(card(r));
  }
  async function renderLibrary() {
    libBox.textContent = '';
    if (!api) return;
    const dirs = PP.store.get('libraryDirs', []);
    for (const d of dirs) {
      const head = PP.el('div', { class: 'hub-lh' }, PP.el('b', { text: d.split(/[\\/]/).pop() || d }), PP.el('span', { class: 'set-dim', text: d }),
        PP.el('button', { class: 'tgl', text: '제거', onclick: () => { PP.store.set('libraryDirs', dirs.filter((x) => x !== d)); renderLibrary(); } }));
      libBox.append(head);
      let files = [];
      try { files = await api.listDir(d); } catch (_) { files = []; }
      const row = PP.el('div', { class: 'hub-grid' });
      if (!files.length) row.append(PP.el('div', { class: 'set-dim', text: '열 수 있는 파일이 없습니다 (.paintplus, .pp3d, 이미지, glb/obj/stl)' }));
      for (const f of files.slice(0, 60)) row.append(card({ path: f.path, name: f.name, kind: KIND_OF[extOf(f.name)] || '2d', time: f.mtime }));
      libBox.append(row);
    }
  }
  function build() {
    root = PP.el('div', { id: 'hub', hidden: true });
    const side = PP.el('div', { class: 'hub-side' },
      PP.el('div', { class: 'hub-logo' }, PP.el('img', { src: 'icon.png', alt: '' }), PP.el('div', null, PP.el('b', { text: '그림판+' }), PP.el('div', { class: 'set-dim', text: '허브' }))),
      PP.el('div', { class: 'hub-h', text: '새 프로젝트' }),
      PP.el('button', { class: 'hub-btn', text: '🖌  2D 그림', onclick: async () => { H.close(); const o = await PP.ui.newDocDialog(); if (o) PP.tabs.new2d(o.w, o.h, o.bg === 'white' ? '#ffffff' : o.bg === 'transparent' ? null : o.bg === 'bg' ? PP.state.bg : PP.state.fg); } }),
      PP.el('button', { class: 'hub-btn', text: '🧊  3D 모델', onclick: () => { H.close(); PP.tabs.new3d(); } }),
      PP.el('button', { class: 'hub-btn', text: '▫  빈 3D 장면', onclick: () => { H.close(); const s = new PP.Scene3D(); s.resetHistory(); PP.tabs.new3d(s); } }),
      PP.el('div', { class: 'hub-h', text: '열기' }),
      PP.el('button', { class: 'hub-btn', text: '📂  파일 열기…', onclick: () => { H.close(); PP.files.open(); } }),
      PP.el('button', { class: 'hub-btn', text: '⬇  3D 모델 가져오기…', onclick: () => { H.close(); PP.files.importModel(); } }),
      api ? PP.el('button', { class: 'hub-btn', text: '＋  라이브러리 폴더 추가…', onclick: async () => {
        const d = await api.pickDir();
        if (!d) return;
        const dirs = PP.store.get('libraryDirs', []);
        if (!dirs.includes(d)) { dirs.push(d); PP.store.set('libraryDirs', dirs); }
        renderLibrary();
      } }) : null,
      PP.el('div', { class: 'hub-sp' }),
      PP.el('button', { class: 'hub-btn dim', text: '⚙  설정', onclick: () => PP.runCmd('app.settings') }),
      PP.el('button', { class: 'hub-btn dim', text: '닫고 작업 계속 (Esc)', onclick: () => H.close() }));
    recentBox = PP.el('div', { class: 'hub-grid' });
    libBox = PP.el('div', { class: 'hub-lib' });
    const main = PP.el('div', { class: 'hub-main' },
      PP.el('h2', { text: '최근 파일' }), recentBox,
      PP.el('h2', { text: '내 폴더' }), libBox);
    root.append(side, main);
    // 드래그&드롭으로 바로 열기는 app.js 의 전역 drop 처리가 담당
    document.body.append(root);
  }
  H.isOpen = () => root && !root.hidden;
  H.open = function () { renderRecent(); renderLibrary(); root.hidden = false; };
  H.close = function () { if (root) root.hidden = true; };
  H.toggle = function () { if (H.isOpen()) H.close(); else H.open(); };
  H.init = function () {
    build();
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && H.isOpen() && !(PP.ui.isModalOpen && PP.ui.isModalOpen())) { H.close(); } });
  };
  H.openPath = async function (path) {
    H.close();
    try { await PP.files.openPathAny(path); } catch (e) { PP.ui.alert('파일을 열 수 없습니다.\n' + (e.message || e)); }
  };

  PP.defCmd('app.hub', '허브 열기', 'Ctrl+H', () => H.toggle());
})(window.PP);
