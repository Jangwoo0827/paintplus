'use strict';
/* 3D 작업실: 뷰포트(three.js) + 도구 + 아웃라이너/속성 패널 + 가져오기/내보내기 */
(function (PP) {
  const { THREE, OrbitControls, TransformControls, GLTFLoader, OBJLoader, STLLoader, GLTFExporter, OBJExporter, STLExporter } = window.T3;
  const DEG = Math.PI / 180;

  const T = (PP.three = {
    scene: null, // 활성 Scene3D
    sel: null, // 선택된 항목 id
    mode: 'translate',
    shading: 'solid',
    grid: true,
    snap: false,
    ready: false,
  });

  let renderer, camera, orbit, tc, canvas, stageEl, wsEl;
  let gridH, axesH, boxH, hemi, studio;
  let queued = false;
  let el = {}; // 패널 DOM 참조

  const ICON = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
  const TOOLS3 = [
    ['select', '선택', 'Q', ICON('<path d="M5 3l14 8-6 2-3 6z"/>')],
    ['translate', '이동', 'G', ICON('<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>')],
    ['rotate', '회전', 'R', ICON('<path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M20 4v5h-5"/>')],
    ['scale', '크기', 'S', ICON('<rect x="5" y="5" width="9" height="9"/><path d="M14 14l6 6M20 14v6h-6"/>')],
  ];

  // ---------- 초기화 ----------
  T.init = function () {
    if (T.ready) return;
    T.ready = true;
    wsEl = PP.el('div', { id: 'ws3d' });
    wsEl.hidden = true;
    // 왼쪽 도구
    const tb = PP.el('div', { id: 'tb3d' });
    el.toolBtns = {};
    for (const [id, name, key, icon] of TOOLS3) {
      const b = PP.el('button', { class: 'tool-btn', html: icon, title: `${name} (${key})`, onclick: () => T.setMode(id) });
      el.toolBtns[id] = b;
      tb.append(b);
    }
    tb.append(PP.el('div', { class: 'tool-sep' }));
    tb.append(PP.el('button', { class: 'tool-btn', text: 'F', title: '선택에 초점 (F)', onclick: () => T.focus() }));
    tb.append(PP.el('button', { class: 'tool-btn', text: '⧉', title: '복제 (Shift+D)', onclick: () => T.duplicate() }));
    tb.append(PP.el('button', { class: 'tool-btn', text: '✕', title: '삭제 (X / Delete)', onclick: () => T.deleteSel() }));

    // 가운데: 옵션바 + 뷰포트
    const mid = PP.el('div', { id: 'mid3d' });
    const bar = PP.el('div', { id: 'bar3d' });
    const sh = PP.el('select', { title: '표시 방식' });
    for (const [v, t] of [['solid', '솔리드'], ['wire', '와이어프레임'], ['render', '렌더(그림자)']]) sh.append(PP.el('option', { value: v, text: t }));
    sh.addEventListener('change', () => T.setShading(sh.value));
    const mkTgl = (text, title, get, set) => {
      const b = PP.el('button', { class: 'tgl' + (get() ? ' on' : ''), text, title });
      b.addEventListener('click', () => { set(!get()); b.classList.toggle('on', get()); });
      return b;
    };
    bar.append(
      PP.el('span', { class: 'opt-title', text: '3D' }), sh,
      mkTgl('격자', '격자 표시', () => T.grid, (v) => { T.grid = v; if (gridH) gridH.visible = v; T.request(); }),
      mkTgl('스냅', '이동 0.5 / 회전 15° / 크기 0.25 단위로 맞춤', () => T.snap, (v) => { T.snap = v; T.applySnap(); }),
      ...[['앞', 'front'], ['옆', 'right'], ['위', 'top'], ['원근', 'persp']].map(([t, v]) => PP.el('button', { class: 'tgl', text: t, title: '시점: ' + t, onclick: () => T.view(v) })),
      PP.el('label', { class: 'set-dim', text: '배경' }),
      (el.bg = PP.el('input', { type: 'color', value: '#2a2d33', title: '배경색', oninput: (e) => { if (T.scene) { T.scene.bg = e.target.value; T.applyBg(); } }, onchange: () => T.commit('배경색') })),
      PP.el('button', { class: 'tgl', text: '렌더 이미지', title: '현재 시점을 PNG로 저장', onclick: () => T.exportPNG() }),
      PP.el('button', { class: 'tgl', text: '2D로 보내기', title: '현재 시점을 새 2D 탭으로', onclick: () => T.to2D() }),
    );
    stageEl = PP.el('div', { id: 'stage3d' });
    canvas = PP.el('canvas', { id: 'cv3d' });
    stageEl.append(canvas);
    mid.append(bar, stageEl);

    // 오른쪽 패널
    const side = PP.el('div', { id: 'side3d' });
    const addBox = PP.el('div', { class: 'add3d' });
    for (const [k, [name]] of Object.entries(PP.PRIMS3D)) addBox.append(PP.el('button', { text: name, onclick: () => T.add('mesh', k) }));
    addBox.append(PP.el('button', { text: '☀ 태양광', onclick: () => T.add('light', 'sun') }), PP.el('button', { text: '💡 점광원', onclick: () => T.add('light', 'point') }));
    el.outliner = PP.el('div', { class: 'outliner' });
    el.props = PP.el('div', { class: 'props3d' });
    const sec = (title, body) => PP.el('section', { class: 'panel' }, PP.el('header', { text: title }), PP.el('div', { class: 'body' }, body));
    side.append(sec('추가', addBox), sec('아웃라이너', el.outliner), sec('속성', el.props));
    el.side = side;

    wsEl.append(tb, mid, side);
    PP.$('#main').insertBefore(wsEl, PP.$('#sidebar'));

    // three.js
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
    orbit = new OrbitControls(camera, canvas);
    orbit.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    orbit.addEventListener('change', () => { T.request(); });
    orbit.addEventListener('end', () => { if (T.scene) { T.scene.camera = { pos: camera.position.toArray(), target: orbit.target.toArray() }; } });
    tc = new TransformControls(camera, canvas);
    tc.addEventListener('dragging-changed', (e) => {
      orbit.enabled = !e.value;
      if (!e.value) { T.commit('변형'); T.refreshProps(); }
    });
    tc.addEventListener('objectChange', () => { updateBox(); T.refreshTransformFields(); T.request(); });
    tc.addEventListener('change', () => T.request());

    gridH = new THREE.GridHelper(20, 20, 0x6b7280, 0x3b4048);
    axesH = new THREE.AxesHelper(1.5);
    axesH.material.depthTest = false;
    boxH = new THREE.Box3Helper(new THREE.Box3(), 0xffc83d);
    boxH.visible = false;
    hemi = new THREE.HemisphereLight(0xffffff, 0x445066, 0.9);
    studio = new THREE.DirectionalLight(0xffffff, 1.4);
    studio.position.set(5, 8, 6);

    new ResizeObserver(() => T.resize()).observe(stageEl);
    bindPointer();
    PP.on('theme', () => T.request());
    PP.on('frame3d', () => T.render());
  };

  // ---------- 장면 연결 ----------
  T.attach = function (s3) {
    T.init();
    if (T.scene) detach();
    T.scene = s3;
    T.sel = null;
    const sc = s3.scene;
    sc.add(gridH, axesH, boxH, hemi, studio, tc.getHelper());
    camera.position.fromArray(s3.camera.pos);
    orbit.target.fromArray(s3.camera.target);
    orbit.update();
    el.bg.value = s3.bg;
    T.setShading(T.shading, true);
    T.applyBg();
    T.setMode(T.mode, true);
    T.refreshAll();
    T.resize();
  };
  function detach() {
    const s = T.scene;
    if (!s) return;
    s.camera = { pos: camera.position.toArray(), target: orbit.target.toArray() };
    tc.detach();
    s.scene.remove(gridH, axesH, boxH, hemi, studio, tc.getHelper());
    s.scene.overrideMaterial = null;
  }
  T.detach = detach;
  T.show = (on) => {
    wsEl.hidden = !on;
    document.body.classList.toggle('mode3d', on);
    if (on) { T.resize(); T.request(); }
  };

  // ---------- 렌더 ----------
  T.request = function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; T.render(); });
  };
  T.render = function () {
    if (!T.scene || wsEl.hidden) return;
    updateBox();
    renderer.render(T.scene.scene, camera);
  };
  T.resize = function () {
    if (!renderer || wsEl.hidden) return;
    const w = Math.max(1, stageEl.clientWidth), h = Math.max(1, stageEl.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    T.request();
  };
  T.applyBg = function () {
    if (!T.scene) return;
    T.scene.scene.background = new THREE.Color(T.scene.bg);
    el.bg.value = T.scene.bg;
    T.request();
  };
  T.setShading = function (mode, silent) {
    T.shading = mode;
    const s = T.scene;
    if (!s) return;
    renderer.shadowMap.enabled = mode === 'render';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = mode === 'render' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    studio.castShadow = mode === 'render';
    if (studio.castShadow) { studio.shadow.mapSize.set(2048, 2048); const c = studio.shadow.camera; c.left = c.bottom = -8; c.right = c.top = 8; c.near = 0.5; c.far = 30; }
    s.scene.overrideMaterial = mode === 'wire' ? new THREE.MeshBasicMaterial({ color: 0x9ec5ff, wireframe: true }) : null;
    // 재질이 바뀌므로 셰이더 갱신
    s.root.traverse((o) => { if (o.material && o.material.needsUpdate !== undefined) o.material.needsUpdate = true; });
    s.scene.traverse((o) => { if (o.isLight && o.shadow) o.castShadow = mode === 'render'; });
    if (!silent) T.request();
  };
  T.setMode = function (m, silent) {
    T.mode = m;
    for (const [id, b] of Object.entries(el.toolBtns)) b.classList.toggle('active', id === m);
    if (m === 'select') tc.detach(); else { tc.setMode(m); if (T.sel) attachSel(); }
    if (!silent) T.request();
  };
  T.applySnap = function () {
    tc.setTranslationSnap(T.snap ? 0.5 : null);
    tc.setRotationSnap(T.snap ? 15 * DEG : null);
    tc.setScaleSnap(T.snap ? 0.25 : null);
  };
  T.view = function (v) {
    const t = orbit.target.clone();
    const d = Math.max(3, camera.position.distanceTo(t));
    const dirs = { front: [0, 0, 1], right: [1, 0, 0], top: [0, 1, 0.001], persp: [0.62, 0.5, 0.8] };
    const dir = new THREE.Vector3(...dirs[v]).normalize();
    camera.position.copy(t).addScaledVector(dir, d);
    orbit.update();
    T.request();
  };
  T.focus = function () {
    const it = T.scene && T.scene.byId(T.sel);
    if (!it) return;
    const box = new THREE.Box3().setFromObject(it.obj3d);
    const c = box.getCenter(new THREE.Vector3()), r = Math.max(0.5, box.getSize(new THREE.Vector3()).length());
    const off = camera.position.clone().sub(orbit.target).normalize().multiplyScalar(r * 2.2);
    orbit.target.copy(c);
    camera.position.copy(c).add(off);
    orbit.update();
    T.request();
  };

  // ---------- 선택 ----------
  function attachSel() {
    const it = T.scene && T.scene.byId(T.sel);
    if (it && T.mode !== 'select') { tc.attach(it.obj3d); T.applySnap(); } else tc.detach();
  }
  function updateBox() {
    const it = T.scene && T.scene.byId(T.sel);
    if (!it) { boxH.visible = false; return; }
    boxH.box.setFromObject(it.type === 'light' ? it.proxy : it.obj3d);
    boxH.visible = true;
  }
  T.select = function (id) {
    T.sel = id || null;
    attachSel();
    T.refreshAll();
    T.request();
  };

  function bindPointer() {
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: Date.now(), dragging: tc.dragging }; });
    canvas.addEventListener('pointerup', (e) => {
      if (!down || tc.dragging || down.dragging) { down = null; return; }
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 5 || e.button !== 0 || !T.scene) return;
      const r = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const targets = [];
      for (const it of T.scene.items) { if (!it.obj3d.visible) continue; targets.push(it.type === 'light' ? it.proxy : it.obj3d); }
      const hit = ray.intersectObjects(targets, false)[0];
      T.select(hit ? hit.object.userData.itemId : null);
    });
  }

  // ---------- 편집 동작 ----------
  T.commit = function (label) {
    if (!T.scene) return;
    T.scene.commit(label);
    PP.emit('tabs:update');
    refreshUndo();
  };
  function refreshUndo() { PP.emit('history'); }
  T.add = function (type, kind) {
    const s = T.scene;
    if (!s) return;
    const it = type === 'light' ? s.addLight(kind) : s.addMesh(kind, { pos: [0, kind === 'plane' ? 0 : 0.5, 0] });
    T.commit('추가: ' + it.name);
    T.select(it.id);
  };
  T.deleteSel = function () {
    const s = T.scene;
    if (!s || !T.sel) return;
    const it = s.byId(T.sel);
    tc.detach();
    s.remove(T.sel);
    T.sel = null;
    T.commit('삭제: ' + (it ? it.name : ''));
    T.refreshAll();
    T.request();
  };
  T.duplicate = function () {
    const s = T.scene;
    if (!s || !T.sel) return;
    const c = s.clone(T.sel);
    if (c) { T.commit('복제'); T.select(c.id); }
  };
  T.undo = function () { if (T.scene && T.scene.undo()) { afterHistory(); } };
  T.redo = function () { if (T.scene && T.scene.redo()) { afterHistory(); } };
  function afterHistory() {
    tc.detach();
    if (!T.scene.byId(T.sel)) T.sel = null;
    T.applyBg();
    T.setShading(T.shading, true);
    attachSel();
    T.refreshAll();
    T.request();
    PP.emit('tabs:update');
    refreshUndo();
  }

  // ---------- 패널 ----------
  T.refreshAll = function () { T.refreshOutliner(); T.refreshProps(); };
  T.refreshOutliner = function () {
    el.outliner.textContent = '';
    const s = T.scene;
    if (!s) return;
    for (const it of s.items.slice().reverse()) {
      const row = PP.el('div', { class: 'ol-row' + (it.id === T.sel ? ' active' : '') });
      const eye = PP.el('button', { class: 'ibtn' + (it.obj3d.visible ? ' on' : ''), html: it.obj3d.visible ? PP.ICON.eye : PP.ICON.eyeOff, title: '보이기/숨기기' });
      eye.addEventListener('click', (e) => { e.stopPropagation(); it.obj3d.visible = !it.obj3d.visible; T.commit('보이기'); T.refreshOutliner(); T.request(); });
      const nm = PP.el('span', { class: 'lname', text: (it.type === 'light' ? '☀ ' : '▣ ') + it.name, title: '더블클릭하여 이름 변경' });
      nm.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const input = PP.el('input', { class: 'lname-input', type: 'text', value: it.name });
        nm.replaceWith(input);
        input.focus(); input.select();
        let done = false;
        const fin = (ok) => { if (done) return; done = true; if (ok && input.value.trim()) { it.name = input.value.trim(); T.commit('이름 변경'); } T.refreshOutliner(); };
        input.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') fin(true); else if (ev.key === 'Escape') fin(false); });
        input.addEventListener('blur', () => fin(true));
      });
      row.append(eye, nm);
      row.addEventListener('click', () => T.select(it.id));
      el.outliner.append(row);
    }
  };

  const num = (v, step = 0.1) => PP.el('input', { type: 'number', step, value: +(+v).toFixed(3) });
  T.refreshTransformFields = function () {
    const it = T.scene && T.scene.byId(T.sel);
    if (!it || !el.tf) return;
    const o = it.obj3d;
    const vals = [...o.position.toArray(), o.rotation.x / DEG, o.rotation.y / DEG, o.rotation.z / DEG, ...o.scale.toArray()];
    el.tf.forEach((inp, i) => { if (document.activeElement !== inp) inp.value = +vals[i].toFixed(3); });
  };
  T.refreshProps = function () {
    const p = el.props;
    p.textContent = '';
    el.tf = null;
    const it = T.scene && T.scene.byId(T.sel);
    if (!it) { p.append(PP.el('div', { class: 'set-dim', text: '객체를 선택하세요 (뷰포트나 아웃라이너 클릭)' })); return; }
    const o = it.obj3d;
    const nameIn = PP.el('input', { type: 'text', value: it.name });
    nameIn.addEventListener('change', () => { it.name = nameIn.value || it.name; T.commit('이름 변경'); T.refreshOutliner(); });
    p.append(PP.el('div', { class: 'frow' }, PP.el('label', { text: '이름' }), nameIn));
    // 변환 (위치/회전/크기)
    const tf = [];
    const grid = PP.el('div', { class: 'tf-grid' });
    const rows = [['위치', 0, 0.1], ['회전°', 3, 5], ['크기', 6, 0.1]];
    for (const [label, off, step] of rows) {
      grid.append(PP.el('span', { class: 'set-dim', text: label }));
      for (let i = 0; i < 3; i++) {
        const inp = num(0, step);
        tf[off + i] = inp;
        inp.addEventListener('change', () => {
          const v = tf.map((x) => +x.value || 0);
          o.position.set(v[0], v[1], v[2]);
          o.rotation.set(v[3] * DEG, v[4] * DEG, v[5] * DEG);
          o.scale.set(v[6] || 0.001, v[7] || 0.001, v[8] || 0.001);
          T.commit('변환 수정');
          T.request();
        });
        grid.append(inp);
      }
    }
    p.append(grid);
    el.tf = tf;
    T.refreshTransformFields();
    // 재질 / 조명
    const slider = (label, min, max, step, value, onInput, onChange) => {
      const r = PP.el('input', { type: 'range', min, max, step, value });
      const v = PP.el('span', { class: 'rv', text: (+value).toFixed(2) });
      r.addEventListener('input', () => { v.textContent = (+r.value).toFixed(2); onInput(+r.value); T.request(); });
      r.addEventListener('change', onChange);
      return PP.el('div', { class: 'frow' }, PP.el('label', { text: label }), r, v);
    };
    if (it.type === 'mesh') {
      const m = o.material;
      const col = PP.el('input', { type: 'color', value: '#' + m.color.getHexString() });
      col.addEventListener('input', () => { m.color.set(col.value); T.request(); });
      col.addEventListener('change', () => T.commit('재질 색'));
      const wire = PP.el('input', { type: 'checkbox' });
      wire.checked = m.wireframe;
      wire.addEventListener('change', () => { m.wireframe = wire.checked; T.commit('와이어'); T.request(); });
      p.append(
        PP.el('div', { class: 'frow' }, PP.el('label', { text: '색' }), col),
        slider('거칠기', 0, 1, 0.01, m.roughness, (v) => { m.roughness = v; }, () => T.commit('거칠기')),
        slider('금속성', 0, 1, 0.01, m.metalness, (v) => { m.metalness = v; }, () => T.commit('금속성')),
        PP.el('div', { class: 'frow chk' }, PP.el('label', null, wire, '재질 와이어프레임')),
      );
    } else {
      const col = PP.el('input', { type: 'color', value: '#' + o.color.getHexString() });
      col.addEventListener('input', () => { o.color.set(col.value); T.request(); });
      col.addEventListener('change', () => T.commit('조명 색'));
      p.append(
        PP.el('div', { class: 'frow' }, PP.el('label', { text: '색' }), col),
        slider('세기', 0, it.kind === 'sun' ? 10 : 200, it.kind === 'sun' ? 0.1 : 1, o.intensity, (v) => { o.intensity = v; }, () => T.commit('조명 세기')),
      );
    }
  };

  // ---------- 키보드 (3D 작업실이 활성일 때 commands.js 가 먼저 호출) ----------
  T.keydown = function (e) {
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      if (k === 'z' && !e.shiftKey) { T.undo(); return true; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { T.redo(); return true; }
      return false;
    }
    if (e.shiftKey && k === 'd') { T.duplicate(); return true; }
    if (k === 'g') { T.setMode('translate'); return true; }
    if (k === 'r') { T.setMode('rotate'); return true; }
    if (k === 's') { T.setMode('scale'); return true; }
    if (k === 'q') { T.setMode('select'); return true; }
    if (k === 'f') { T.focus(); return true; }
    if (k === 'x' || e.key === 'Delete' || e.key === 'Backspace') { T.deleteSel(); return true; }
    if (k === '1') { T.view('front'); return true; }
    if (k === '3') { T.view('right'); return true; }
    if (k === '7') { T.view('top'); return true; }
    if (k === '5') { T.view('persp'); return true; }
    if (e.key === 'Escape') { T.select(null); return true; }
    return false;
  };

  // ---------- 가져오기 / 내보내기 ----------
  const stem = () => (T.scene ? T.scene.name.replace(/\.[^.]+$/, '') : 'model');
  function exportGroup() {
    const g = new THREE.Group();
    for (const it of T.scene.items) if (it.type === 'mesh' && it.obj3d.visible) g.add(it.obj3d.clone());
    g.updateMatrixWorld(true);
    return g;
  }
  T.exportGLB = () => new Promise((resolve, reject) => {
    new GLTFExporter().parse(exportGroup(), (buf) => resolve(new Uint8Array(buf)), reject, { binary: true, onlyVisible: true });
  });
  T.exportOBJ = () => new TextEncoder().encode(new OBJExporter().parse(exportGroup()));
  T.exportSTL = () => {
    const r = new STLExporter().parse(exportGroup(), { binary: true });
    return new Uint8Array(r.buffer, r.byteOffset, r.byteLength);
  };
  T.renderToCanvas = function (w, h) {
    const prev = renderer.getSize(new THREE.Vector2());
    const hide = boxH.visible, tcv = tc.getHelper().visible;
    boxH.visible = false; tc.getHelper().visible = false; gridH.visible = false; axesH.visible = false;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.render(T.scene.scene, camera);
    const out = PP.makeCanvas(w, h);
    out.getContext('2d').drawImage(canvas, 0, 0, w, h);
    boxH.visible = hide; tc.getHelper().visible = tcv; gridH.visible = T.grid; axesH.visible = true;
    renderer.setSize(prev.x, prev.y, false);
    camera.aspect = prev.x / prev.y; camera.updateProjectionMatrix();
    T.request();
    return out;
  };
  T.exportPNG = async function () {
    const c = T.renderToCanvas(1920, 1080);
    await PP.exportBytes(stem() + '.png', await PP.canvasToBytes(c, 'image/png'), 'image/png');
  };
  T.to2D = function () {
    const c = T.renderToCanvas(1280, 720);
    PP.tabs.new2dFromCanvas(c, stem());
  };
  T.thumbnail = function () {
    if (!T.scene) return null;
    const c = T.renderToCanvas(256, 160);
    return c.toDataURL('image/jpeg', 0.7);
  };

  /** 파일(.glb/.gltf/.obj/.stl)의 메쉬들을 현재 장면에 객체로 추가 */
  T.importModel = async function (name, bytes) {
    const s = T.scene;
    const ext = name.split('.').pop().toLowerCase();
    const meshes = [];
    if (ext === 'glb' || ext === 'gltf') {
      const gltf = await new Promise((res, rej) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', res, rej));
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    } else if (ext === 'obj') {
      const g = new OBJLoader().parse(new TextDecoder().decode(bytes));
      g.updateMatrixWorld(true);
      g.traverse((o) => { if (o.isMesh) meshes.push(o); });
    } else if (ext === 'stl') {
      const geo = new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      meshes.push(new THREE.Mesh(geo, new THREE.MeshStandardMaterial()));
    } else throw new Error('지원하지 않는 3D 형식: ' + ext);
    if (!meshes.length) throw new Error('메쉬를 찾지 못했습니다');
    // 전체 크기를 약 2 단위로 맞춘다
    const all = new THREE.Box3();
    meshes.forEach((m) => all.expandByObject(m));
    const size = all.getSize(new THREE.Vector3()), ctr = all.getCenter(new THREE.Vector3());
    const k = 2 / Math.max(size.x, size.y, size.z, 1e-6);
    let last = null;
    for (const m of meshes) {
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      g.translate(-ctr.x, -ctr.y, -ctr.z);
      g.scale(k, k, k);
      if (!g.attributes.normal) g.computeVertexNormals();
      const geomId = 'g' + s.nextId + '_' + Math.random().toString(36).slice(2, 6);
      s.assets.set(geomId, g);
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      const color = mat && mat.color ? '#' + mat.color.getHexString() : '#b8c0cc';
      last = s.addMesh('imported', { geomId, name: (m.name || name.replace(/\.[^.]+$/, '')), mat: { color, roughness: mat && mat.roughness != null ? mat.roughness : 0.6, metalness: (mat && mat.metalness) || 0 }, pos: [0, size.y * k / 2, 0] });
    }
    T.commit('가져오기: ' + name);
    T.select(last.id);
    T.focus();
  };

  PP.Workspace3D = T;
})(window.PP);
