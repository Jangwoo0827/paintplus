'use strict';
/*
 * 탭: 2D 그림 / 3D 모델 여러 개를 동시에 연다.
 * 2D 문서는 PP.doc / PP.history 싱글턴을 쓰므로, 탭을 떠날 때 상태를 통째로 보관했다가 돌아오면 되돌려 놓는다.
 * 3D 탭은 Scene3D 객체를 들고 있고, 작업실(PP.three)이 활성 장면에 연결된다.
 */
(function (PP) {
  const api = window.api;
  const T = (PP.tabs = { list: [], activeId: null });

  T.active = () => T.list.find((t) => t.id === T.activeId) || null;
  T.kind = () => (T.active() ? T.active().kind : '2d');
  T.is3d = () => T.kind() === '3d';

  // ---------- 2D 상태 보관/복원 ----------
  function capture2d() {
    const d = PP.doc, h = PP.history, v = PP.vp;
    return {
      doc: { width: d.width, height: d.height, layers: d.layers, activeId: d.activeId, name: d.name, path: d.path, fileType: d.fileType, layerCounter: d.layerCounter },
      hist: { stack: h.stack, index: h.index, savedIndex: h.savedIndex, cost: h.cost },
      view: { zoom: v.zoom, ox: v.ox, oy: v.oy },
    };
  }
  function restore2d(s) {
    PP.preview.cancel();
    Object.assign(PP.doc, s.doc);
    Object.assign(PP.history, s.hist);
    PP.sel.poly = null; PP.sel.mask = null; PP.sel.maskB = null; PP.sel.float = null;
    PP.emit('doc:structure');
    PP.emit('history');
    PP.emit('doc:meta');
    PP.emit('selection');
    Object.assign(PP.vp, s.view);
    PP.emit('zoom', PP.vp.zoom);
    PP.render();
  }

  // ---------- 제목 / 변경 여부 ----------
  T.titleOf = (tab) => {
    if (tab.kind === '3d') return tab.s3d.name;
    return tab.id === T.activeId ? PP.doc.name : tab.s2d.doc.name;
  };
  T.dirtyOf = (tab) => {
    if (tab.kind === '3d') return tab.s3d.isDirty();
    if (tab.id === T.activeId) return PP.history.isDirty();
    return tab.s2d.hist.index !== tab.s2d.hist.savedIndex;
  };

  // ---------- 화면 전환 ----------
  function enter(tab) {
    const is3 = tab.kind === '3d';
    PP.ui.setMenuKind(tab.kind);
    if (is3) {
      PP.three.show(true);
      PP.three.attach(tab.s3d);
    } else {
      PP.three.ready && PP.three.show(false);
      if (tab.s2d) { restore2d(tab.s2d); tab.s2d = null; }
      PP.vp.resize();
    }
    PP.emit('history');
    PP.emit('doc:meta');
    T.renderBar();
  }
  function leave(tab) {
    if (!tab) return;
    if (tab.kind === '2d') { PP.sel.finish(); tab.s2d = capture2d(); } else PP.three.detach();
  }
  T.switchTo = function (id) {
    if (id === T.activeId) return;
    const next = T.list.find((t) => t.id === id);
    if (!next) return;
    leave(T.active());
    T.activeId = id;
    enter(next);
  };
  PP.on('tabs:update', () => T.renderBar());

  // ---------- 새 탭 ----------
  /** 현재 2D 탭이 '비어 있고 저장 안 한' 초기 상태면 새 탭을 만들지 않고 재사용한다 */
  function pristine() {
    const t = T.active();
    return t && t.kind === '2d' && !PP.history.isDirty() && !PP.doc.path && PP.history.index === 0 && PP.doc.layers.length === 1;
  }
  function add(tab) {
    tab.id = ++PP.uid;
    leave(T.active());
    T.list.push(tab);
    T.activeId = tab.id;
    return tab;
  }
  T.new2d = function (w, h, bg, name) {
    if (pristine()) { PP.doc.init(w, h, bg, name); T.renderBar(); return; }
    add({ kind: '2d', s2d: null });
    PP.ui.setMenuKind('2d');
    PP.three.ready && PP.three.show(false);
    PP.sel.poly = null; PP.sel.mask = null; PP.sel.float = null;
    PP.doc.init(w, h, bg, name);
    PP.vp.resize();
    T.renderBar();
  };
  /** 이미지/프로젝트를 새 2D 탭에 열기 위한 준비 (이미 비어 있으면 현재 탭 재사용) */
  T.prepare2d = function () {
    if (pristine()) return;
    add({ kind: '2d', s2d: null });
    PP.ui.setMenuKind('2d');
    PP.three.ready && PP.three.show(false);
    PP.sel.poly = null; PP.sel.mask = null; PP.sel.float = null;
  };
  T.new2dFromCanvas = function (canvas, name) {
    T.new2d(canvas.width, canvas.height, null, name);
    PP.doc.layers[0].ctx.drawImage(canvas, 0, 0);
    PP.doc.touch(PP.doc.layers[0]);
    PP.history.markSaved();
    T.renderBar();
  };
  T.new3d = function (scene) {
    const s3d = scene || PP.Scene3D.starter();
    const tab = add({ kind: '3d', s3d });
    PP.ui.setMenuKind('3d');
    PP.three.show(true);
    PP.three.attach(s3d);
    PP.emit('history');
    PP.emit('doc:meta');
    T.renderBar();
    return tab;
  };

  // ---------- 닫기 ----------
  async function confirmTab(tab) {
    if (!T.dirtyOf(tab)) return true;
    T.switchTo(tab.id);
    const r = await PP.ui.confirmSave(T.titleOf(tab));
    if (r === 'save') return PP.files.save();
    return r === 'discard';
  }
  T.close = async function (id) {
    const tab = T.list.find((t) => t.id === id);
    if (!tab) return;
    if (!(await confirmTab(tab))) return;
    const idx = T.list.indexOf(tab);
    if (tab.kind === '3d' && tab.id === T.activeId) PP.three.detach();
    T.list.splice(idx, 1);
    if (!T.list.length) {
      // 마지막 탭을 닫으면 빈 2D 탭을 남기고 허브를 보여 준다
      T.activeId = null;
      const t = { id: ++PP.uid, kind: '2d', s2d: null };
      T.list.push(t);
      T.activeId = t.id;
      PP.ui.setMenuKind('2d');
      PP.three.ready && PP.three.show(false);
      PP.doc.init(1280, 720, '#ffffff');
      PP.vp.resize();
      T.renderBar();
      PP.hub && PP.hub.open();
      return;
    }
    if (tab.id === T.activeId) {
      T.activeId = null;
      const next = T.list[Math.min(idx, T.list.length - 1)];
      T.activeId = next.id;
      enter(next);
    } else T.renderBar();
  };
  /** 모든 탭 저장 확인 (창 닫기용). true = 닫아도 됨 */
  T.confirmAll = async function () {
    for (const tab of T.list.slice()) if (!(await confirmTab(tab))) return false;
    return true;
  };

  // ---------- 탭 바 ----------
  let barEl, listEl;
  T.renderBar = function () {
    if (!listEl) return;
    listEl.textContent = '';
    for (const tab of T.list) {
      const dirty = T.dirtyOf(tab);
      const b = PP.el('div', { class: 'tab' + (tab.id === T.activeId ? ' active' : ''), title: T.titleOf(tab) },
        PP.el('span', { class: 'tab-k', text: tab.kind === '3d' ? '3D' : '2D' }),
        PP.el('span', { class: 'tab-t', text: (dirty ? '● ' : '') + T.titleOf(tab) }),
        PP.el('button', { class: 'tab-x', text: '✕', title: '탭 닫기', onclick: (e) => { e.stopPropagation(); T.close(tab.id); } }));
      b.addEventListener('click', () => { T.switchTo(tab.id); PP.hub && PP.hub.close(); });
      b.addEventListener('auxclick', (e) => { if (e.button === 1) T.close(tab.id); });
      listEl.append(b);
    }
  };

  T.init = function () {
    barEl = PP.el('div', { id: 'tabbar' });
    barEl.append(PP.el('button', { class: 'tab-home', text: '⌂', title: '허브 (시작 화면)', onclick: () => PP.hub && PP.hub.toggle() }));
    listEl = PP.el('div', { class: 'tab-list' });
    barEl.append(listEl);
    barEl.append(PP.el('button', { class: 'tab-add', text: '+', title: '새 탭 (허브 열기)', onclick: () => PP.hub && PP.hub.open() }));
    PP.$('#menubar').after(barEl);
    const first = { id: ++PP.uid, kind: '2d', s2d: null };
    T.list.push(first);
    T.activeId = first.id;
    T.renderBar();
  };

  // 현재 창 닫기/문서 제목이 바뀔 때 탭 이름 갱신
  PP.on('history', () => T.renderBar());
  PP.on('doc:meta', () => T.renderBar());

  // 2D 명령 상태 조회용
  T.hasPath = () => { const a = T.active(); return a && (a.kind === '3d' ? !!a.s3d.path : !!PP.doc.path); };
})(window.PP);
