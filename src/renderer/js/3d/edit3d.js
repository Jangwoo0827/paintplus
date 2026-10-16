'use strict';
/*
 * 3D 편집 모드: 점/선/면 선택, 기즈모 이동·회전·크기, 돌출·인셋·베벨·루프 컷·병합·삭제·세분화, 모디파이어 패널.
 * 데이터는 항목의 em(PP.EditMesh)과 mods 에 있고, 여기서는 화면 표시와 입력만 맡는다.
 */
(function (PP) {
  const { THREE } = window.T3;
  const T = PP.three;
  const EM = PP.EditMesh;
  const ek = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
  const ORANGE = [1, 0.62, 0.1], DARK = [0.08, 0.09, 0.1], WHITE = [0.85, 0.88, 0.92];

  const E = (T.edit = {
    on: false,
    mode: 'vert', // vert | edge | face
    sel: new Set(), // vert: 정점 번호, edge: 'a,b' 키, face: 면 번호
    p: { extrude: 0.3, inset: 0.25, bevel: 0.1, cuts: 1 }, // 연산 매개변수
  });
  let ov, lines, points, faceMesh, pivot, cage, item = null, prevShading = null, ui = {};
  let drag = null;
  const hook = T.hook;

  // ---------- 선택 파생 ----------
  /** 현재 모드의 선택을 {V,E,F} 집합으로 풀어 낸다 */
  function derive() {
    const em = item.em, V = new Set(), Ed = new Set(), F = new Set();
    if (E.mode === 'vert') {
      for (const i of E.sel) V.add(i);
      for (const k of em.edgeFaces().keys()) { const [a, b] = k.split(',').map(Number); if (V.has(a) && V.has(b)) Ed.add(k); }
      em.f.forEach((q, fi) => { if (q.every((i) => V.has(i))) F.add(fi); });
    } else if (E.mode === 'edge') {
      for (const k of E.sel) { Ed.add(k); const [a, b] = k.split(',').map(Number); V.add(a); V.add(b); }
      em.f.forEach((q, fi) => { if (q.every((v, i) => Ed.has(ek(v, q[(i + 1) % q.length])))) F.add(fi); });
    } else {
      for (const fi of E.sel) { F.add(fi); const q = em.f[fi]; q.forEach((v, i) => { V.add(v); Ed.add(ek(v, q[(i + 1) % q.length])); }); }
    }
    return { V, E: Ed, F };
  }
  E.derive = derive;
  const mode2 = (m) => { E.mode = m; E.sel = new Set(); };

  E.setMode = function (m) {
    if (!E.on || m === E.mode) return;
    const d = derive();
    E.mode = m;
    E.sel = m === 'vert' ? new Set(d.V) : m === 'edge' ? new Set(d.E) : new Set(d.F);
    // 면 모드로 바꿀 때 모서리/점만 선택돼 있으면 완전히 포함된 면만 남는다
    refresh();
  };

  // ---------- 진입 / 종료 ----------
  E.enter = function () {
    const s = T.scene;
    const it = s && s.byId(T.sel);
    if (!it || it.type !== 'mesh') { PP.toast('편집할 메쉬를 먼저 선택하세요'); return; }
    if (!it.em) {
      if (it.obj3d.geometry.attributes.position.count > 120000) { PP.toast('면이 너무 많아 편집할 수 없습니다'); return; }
      s.convertToEM(it);
      T.commit('편집 가능한 메쉬로 변환');
    }
    item = it;
    E.on = hook.on = true;
    hook.item = it.id;
    E.mode = 'vert';
    E.sel = new Set();
    prevShading = null;
    if (T.shading === 'wire') { prevShading = 'wire'; T.setShading('solid', true); }
    build();
    ui.panel.hidden = false;
    ui.bar.hidden = false;
    T.gl.tc.detach();
    hook.attach();
    T.applySnap();
    sync();
    T.refreshProps();
    T.request();
  };
  E.exit = function (silent) {
    if (!E.on) return;
    E.on = hook.on = false;
    if (ov) { ov.parent && ov.parent.remove(ov); ov.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); ov = null; }
    if (item && item.obj3d.material) { item.obj3d.material.polygonOffset = false; }
    item = null;
    T.gl.tc.detach();
    ui.panel.hidden = true;
    ui.bar.hidden = true;
    if (prevShading && !silent) T.setShading(prevShading, true);
    prevShading = null;
    T.applySnap();
    if (!silent) { hook.attachObj(); T.refreshProps(); T.request(); }
  };
  E.toggle = function () { if (E.on) E.exit(); else E.enter(); };

  // ---------- 오버레이 ----------
  function build() {
    if (ov) { ov.parent && ov.parent.remove(ov); }
    ov = new THREE.Group();
    ov.renderOrder = 10;
    lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
    points = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ vertexColors: true, size: 8, sizeAttenuation: false }));
    faceMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xff9e1a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    for (const o of [lines, points, faceMesh]) { o.frustumCulled = false; o.renderOrder = 10; }
    pivot = new THREE.Object3D();
    cage = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    ov.add(lines, points, faceMesh, pivot);
    item.obj3d.add(ov);
    item.obj3d.material.polygonOffset = true;
    item.obj3d.material.polygonOffsetFactor = 1;
    item.obj3d.material.polygonOffsetUnits = 1;
    refresh();
  }
  function refresh() {
    if (!E.on) return;
    const em = item.em, d = derive();
    // 선
    const lp = [], lc = [];
    for (const k of em.edgeFaces().keys()) {
      const [a, b] = k.split(',').map(Number);
      const on = d.E.has(k) || (E.mode === 'vert' && d.V.has(a) && d.V.has(b));
      lp.push(...em.v[a], ...em.v[b]);
      const c = on ? ORANGE : DARK;
      lc.push(...c, ...c);
    }
    lines.geometry.dispose();
    lines.geometry = new THREE.BufferGeometry();
    lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    lines.geometry.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
    // 점
    points.visible = E.mode === 'vert';
    const pp = [], pc = [];
    em.v.forEach((p, i) => { pp.push(...p); pc.push(...(d.V.has(i) ? ORANGE : WHITE)); });
    points.geometry.dispose();
    points.geometry = new THREE.BufferGeometry();
    points.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    points.geometry.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3));
    // 선택된 면
    const fp = [];
    for (const fi of d.F) { const q = em.f[fi]; for (let i = 1; i < q.length - 1; i++) fp.push(...em.v[q[0]], ...em.v[q[i]], ...em.v[q[i + 1]]); }
    faceMesh.geometry.dispose();
    faceMesh.geometry = new THREE.BufferGeometry();
    faceMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    // 피킹용 케이지 + 피벗 위치
    cage.geometry.dispose();
    cage.geometry = em.toGeometry(false);
    placePivot(d);
    sync();
    T.request();
  }
  function placePivot(d) {
    d = d || derive();
    const em = item.em;
    const c = new THREE.Vector3();
    d.V.forEach((i) => c.add(new THREE.Vector3(...em.v[i])));
    if (d.V.size) c.multiplyScalar(1 / d.V.size);
    pivot.position.copy(c);
    pivot.quaternion.identity();
    pivot.scale.set(1, 1, 1);
    pivot.visible = d.V.size > 0;
    if (d.V.size && T.mode !== 'select') { if (T.gl.tc.object !== pivot) T.gl.tc.attach(pivot); } else T.gl.tc.detach();
  }
  /** 모양 변경(연산 결과) 후: 렌더용 지오메트리, 오버레이 갱신 */
  function changed() {
    T.scene.rebuild(item);
    refresh();
  }

  // ---------- 기즈모 ----------
  hook.attach = function () { if (E.on && ov) placePivot(); };
  hook.attachObj = function () {
    const it = T.scene && T.scene.byId(T.sel);
    if (it && T.mode !== 'select') { T.gl.tc.attach(it.obj3d); T.applySnap(); }
  };
  hook.drag = function (start) {
    if (start) {
      const d = derive();
      drag = { c0: pivot.position.clone(), v0: new Map([...d.V].map((i) => [i, item.em.v[i].slice()])) };
    } else if (drag) {
      drag = null;
      T.commit('메쉬 편집');
      placePivot();
    }
  };
  hook.change = function () {
    if (!drag) return;
    const mesh = item.obj3d;
    if (T.mode === 'translate' && T.snap) {
      const w = mesh.localToWorld(pivot.position.clone());
      const g = T.gridSize;
      w.set(Math.round(w.x / g) * g, Math.round(w.y / g) * g, Math.round(w.z / g) * g);
      pivot.position.copy(mesh.worldToLocal(w));
    }
    const q = pivot.quaternion, sc = pivot.scale, c0 = drag.c0, dl = pivot.position.clone().sub(c0);
    const tmp = new THREE.Vector3();
    for (const [i, p] of drag.v0) {
      tmp.set(p[0] - c0.x, p[1] - c0.y, p[2] - c0.z).multiply(sc).applyQuaternion(q).add(c0).add(dl);
      item.em.v[i] = [tmp.x, tmp.y, tmp.z];
    }
    changed();
  };

  // ---------- 선택하기 ----------
  const _v = new THREE.Vector3();
  function screenOf(p) {
    const cv = T.gl.canvas.getBoundingClientRect();
    _v.set(p[0], p[1], p[2]).applyMatrix4(item.obj3d.matrixWorld).project(T.gl.camera);
    return [(_v.x * 0.5 + 0.5) * cv.width, (-_v.y * 0.5 + 0.5) * cv.height, _v.z];
  }
  function occluded(pLocal) {
    const cam = T.gl.camera, w = _v.set(pLocal[0], pLocal[1], pLocal[2]).applyMatrix4(item.obj3d.matrixWorld).clone();
    const dir = w.clone().sub(cam.position), dist = dir.length();
    dir.normalize();
    cage.matrixWorld.copy(item.obj3d.matrixWorld);
    const ray = new THREE.Raycaster(cam.position.clone(), dir, 0, dist);
    const hit = ray.intersectObject(cage, false)[0];
    return !!hit && hit.distance < dist - Math.max(0.003, dist * 0.004);
  }
  /** 클릭 위치(px, 캔버스 기준)에서 가장 가까운 요소 -> 선택 키(vert: 번호, edge: 키, face: 번호) 또는 null */
  E.pickAt = function (px, py) {
    const em = item.em;
    item.obj3d.updateMatrixWorld(true);
    if (E.mode === 'vert') {
      let best = null, bd = 14;
      em.v.forEach((p, i) => { const s = screenOf(p); if (s[2] > 1) return; const d = Math.hypot(s[0] - px, s[1] - py); if (d < bd) { bd = d; best = i; } });
      if (best != null && !occluded(em.v[best])) return best;
      // 가려진 점이 가장 가까웠다면 다음 후보도 확인
      const cands = em.v.map((p, i) => [i, screenOf(p)]).filter(([, s]) => s[2] <= 1 && Math.hypot(s[0] - px, s[1] - py) < 14).sort((a, b) => Math.hypot(a[1][0] - px, a[1][1] - py) - Math.hypot(b[1][0] - px, b[1][1] - py));
      for (const [i] of cands) if (!occluded(em.v[i])) return i;
      return null;
    }
    if (E.mode === 'edge') {
      let best = null, bd = 10;
      for (const k of em.edgeFaces().keys()) {
        const [a, b] = k.split(',').map(Number);
        const A = screenOf(em.v[a]), B = screenOf(em.v[b]);
        if (A[2] > 1 || B[2] > 1) continue;
        const dx = B[0] - A[0], dy = B[1] - A[1], L = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((px - A[0]) * dx + (py - A[1]) * dy) / L));
        const d = Math.hypot(A[0] + dx * t - px, A[1] + dy * t - py);
        if (d < bd) {
          const mid = [(em.v[a][0] + em.v[b][0]) / 2, (em.v[a][1] + em.v[b][1]) / 2, (em.v[a][2] + em.v[b][2]) / 2];
          if (!occluded(mid)) { bd = d; best = k; }
        }
      }
      return best;
    }
    // 면: 광선
    const r = T.gl.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2((px / r.width) * 2 - 1, -(py / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, T.gl.camera);
    cage.matrixWorld.copy(item.obj3d.matrixWorld);
    const hit = ray.intersectObject(cage, false)[0];
    return hit ? cage.geometry.userData.triFace[hit.faceIndex] : null;
  };
  hook.pick = function (e) {
    const r = T.gl.canvas.getBoundingClientRect();
    const k = E.pickAt(e.clientX - r.left, e.clientY - r.top);
    if (k == null) { if (!e.shiftKey) E.sel = new Set(); }
    else if (e.shiftKey) { if (E.sel.has(k)) E.sel.delete(k); else E.sel.add(k); }
    else E.sel = new Set([k]);
    refresh();
  };
  E.selectAll = function () {
    const em = item.em;
    E.sel = E.mode === 'vert' ? new Set(em.v.map((_, i) => i)) : E.mode === 'edge' ? new Set(em.edgeFaces().keys()) : new Set(em.f.map((_, i) => i));
    refresh();
  };
  E.selectNone = function () { E.sel = new Set(); refresh(); };
  E.invert = function () {
    const em = item.em, all = E.mode === 'vert' ? em.v.map((_, i) => i) : E.mode === 'edge' ? [...em.edgeFaces().keys()] : em.f.map((_, i) => i);
    E.sel = new Set(all.filter((x) => !E.sel.has(x)));
    refresh();
  };

  // ---------- 연산 ----------
  const need = (cond, msg) => { if (!cond) PP.toast(msg); return cond; };
  function run(label, fn) {
    const d = derive();
    const keep = item.em.clone();
    let ok;
    try { ok = fn(item.em, d); } catch (err) { console.error(err); ok = false; }
    if (ok === false) { item.em = keep; return; }
    changed();
    T.commit(label);
  }
  E.extrude = function () {
    const d = derive();
    if (d.F.size) {
      run('돌출', (em, dd) => { em.extrudeFaces(dd.F, E.p.extrude); mode2('face'); E.sel = new Set(dd.F); });
    } else if (E.mode !== 'face' && d.E.size) {
      run('모서리 돌출', (em, dd) => {
        const ef = em.edgeFaces(), nv = new Map(), made = [];
        for (const k of dd.E) {
          const fs = ef.get(k);
          if (fs.length !== 1) continue; // 열린(경계) 모서리만
          const [a, b] = k.split(',').map(Number);
          const q = em.f[fs[0]], n = em.faceNormal(fs[0]);
          const idx = q.findIndex((v, j) => (v === a && q[(j + 1) % q.length] === b) || (v === b && q[(j + 1) % q.length] === a));
          const x = q[idx], y = q[(idx + 1) % q.length];
          for (const v of [x, y]) if (!nv.has(v)) { em.v.push(em.v[v].map((c, i) => c + n[i] * E.p.extrude)); nv.set(v, em.v.length - 1); }
          em.f.push([y, x, nv.get(x), nv.get(y)]);
          made.push(ek(nv.get(x), nv.get(y)));
        }
        if (!made.length) { PP.toast('열린 모서리(면이 하나뿐인 모서리)만 돌출할 수 있습니다'); return false; }
        mode2('edge');
        E.sel = new Set(made);
      });
    } else PP.toast('돌출할 면이나 모서리를 선택하세요');
  };
  E.inset = function () {
    if (!need(derive().F.size, '인셋할 면을 선택하세요 (면 모드)')) return;
    run('인셋', (em, d) => { em.insetFaces(d.F, E.p.inset); mode2('face'); E.sel = new Set(d.F); });
  };
  E.bevel = function () {
    const d = derive();
    if (!need(d.E.size, '베벨할 모서리를 선택하세요 (선 모드)')) return;
    run('베벨', (em, dd) => {
      let n = 0;
      for (const k of dd.E) { const [a, b] = k.split(',').map(Number); if (em.bevelEdge(a, b, E.p.bevel)) n++; }
      if (!n) { PP.toast('이 모서리는 베벨할 수 없습니다 (양 끝에 면이 3개씩 모이는 모서리만 가능)'); return false; }
      em.compact();
      mode2('vert');
    });
  };
  E.loopCut = function () {
    const d = derive();
    if (!need(d.E.size, '루프 컷의 기준이 될 모서리를 선택하세요 (선 모드)')) return;
    run('루프 컷', (em, dd) => {
      const [a, b] = [...dd.E][0].split(',').map(Number);
      const verts = em.loopCut(a, b, Math.max(1, Math.min(16, Math.round(E.p.cuts))));
      mode2('vert');
      E.sel = verts;
    });
  };
  E.merge = function () {
    const d = derive();
    if (!need(d.V.size >= 2, '병합할 점을 2개 이상 선택하세요')) return;
    run('병합', (em, dd) => { const idx = em.mergeVerts(dd.V); mode2('vert'); E.sel = new Set([idx]); });
  };
  E.del = function () {
    const d = derive();
    if (!need(d.V.size, '삭제할 요소를 선택하세요')) return;
    run('삭제', (em, dd) => {
      if (E.mode === 'face') em.deleteFaces(dd.F); else if (E.mode === 'edge') { const ef = em.edgeFaces(); const fs = new Set(); for (const k of dd.E) for (const f of ef.get(k) || []) fs.add(f); em.deleteFaces(fs); } else em.deleteVerts(dd.V);
      E.sel = new Set();
      if (!em.f.length) { PP.toast('면이 모두 사라졌습니다 (Ctrl+Z 로 복구)'); }
    });
  };
  E.subdivide = function () {
    run('세분화', (em, d) => { em.subdivide(d.F.size ? d.F : null); E.sel = new Set(); });
  };
  E.flip = function () {
    const d = derive();
    run('면 뒤집기', (em, dd) => { em.flipFaces(dd.F.size ? dd.F : new Set(em.f.map((_, i) => i))); });
  };

  // ---------- 키보드 ----------
  hook.keydown = function (e) {
    const k = e.key.toLowerCase();
    if (e.key === 'Tab') { E.toggle(); return true; }
    if (!E.on) return false;
    if (e.ctrlKey || e.metaKey) {
      if (k === 'i') { E.invert(); return true; }
      return false;
    }
    if (k === '1') { E.setMode('vert'); return true; }
    if (k === '2') { E.setMode('edge'); return true; }
    if (k === '3') { E.setMode('face'); return true; }
    if (k === 'a') { if (e.altKey) E.selectNone(); else E.selectAll(); return true; }
    if (k === 'e') { E.extrude(); return true; }
    if (k === 'i') { E.inset(); return true; }
    if (k === 'b') { E.bevel(); return true; }
    if (k === 'l') { E.loopCut(); return true; }
    if (k === 'm') { E.merge(); return true; }
    if (k === 'w') { E.subdivide(); return true; }
    if (k === 'x' || e.key === 'Delete' || e.key === 'Backspace') { E.del(); return true; }
    if (e.key === 'Escape') { E.exit(); return true; }
    if (k === 'f' || k === 'd') return true; // 편집 중에는 초점/복제 무시
    return false;
  };
  hook.del = function () { E.del(); };
  hook.exit = function (silent) { E.exit(silent); };
  hook.history = function () {
    const it = T.scene.byId(T.sel);
    if (!it || !it.em) { E.exit(); return; }
    item = it;
    E.sel = new Set();
    build();
    T.gl.tc.detach();
    hook.attach();
  };

  // ---------- 모디파이어 패널 ----------
  const MODS = {
    mirror: ['미러', () => ({ type: 'mirror', axis: 'x', enabled: true })],
    subsurf: ['서브디비전', () => ({ type: 'subsurf', levels: 1, enabled: true })],
    array: ['배열', () => ({ type: 'array', count: 3, dx: 1.2, dy: 0, dz: 0, enabled: true })],
    solidify: ['솔리드화', () => ({ type: 'solidify', thickness: 0.1, enabled: true })],
  };
  function modRebuild(it) {
    T.scene.rebuild(it);
    T.request();
  }
  hook.props = function (p, it) {
    if (it.type !== 'mesh') return;
    const box = PP.el('div', { class: 'mods3d' });
    box.append(PP.el('div', { class: 'hub-h', text: '모디파이어' }));
    const live = (md, key, val, input) => { md[key] = val; modRebuild(it); if (!input) { T.commit('모디파이어 수정'); } };
    (it.mods || []).forEach((md, idx) => {
      const row = PP.el('div', { class: 'mod-row' });
      const head = PP.el('div', { class: 'mod-head' });
      const en = PP.el('input', { type: 'checkbox' });
      en.checked = md.enabled !== false;
      en.addEventListener('change', () => { md.enabled = en.checked; modRebuild(it); T.commit('모디파이어 켜기/끄기'); });
      const mv = (d) => () => { const j = idx + d; if (j < 0 || j >= it.mods.length) return; [it.mods[idx], it.mods[j]] = [it.mods[j], it.mods[idx]]; modRebuild(it); T.commit('모디파이어 순서'); T.refreshProps(); };
      head.append(en, PP.el('span', { class: 'mod-name', text: MODS[md.type][0] }),
        PP.el('button', { class: 'ibtn', text: '▲', title: '위로', onclick: mv(-1) }), PP.el('button', { class: 'ibtn', text: '▼', title: '아래로', onclick: mv(1) }),
        PP.el('button', { class: 'ibtn', text: '✕', title: '제거', onclick: () => { it.mods.splice(idx, 1); modRebuild(it); if (E.on) refresh(); T.commit('모디파이어 제거'); T.refreshProps(); } }));
      row.append(head);
      const numIn = (label, key, step, min, max) => {
        const i = PP.el('input', { type: 'number', step, min, max, value: md[key] });
        i.addEventListener('input', () => { if (i.value !== '') live(md, key, +i.value, true); });
        i.addEventListener('change', () => { live(md, key, +i.value || 0, false); });
        return PP.el('label', { class: 'mod-f' }, label, i);
      };
      if (md.type === 'mirror') {
        const sel = PP.el('select');
        for (const a of ['x', 'y', 'z']) sel.append(PP.el('option', { value: a, text: a.toUpperCase() + ' 축' }));
        sel.value = md.axis;
        sel.addEventListener('change', () => live(md, 'axis', sel.value, false));
        row.append(PP.el('label', { class: 'mod-f' }, '기준', sel));
      } else if (md.type === 'subsurf') row.append(numIn('단계', 'levels', 1, 1, 3));
      else if (md.type === 'array') row.append(numIn('개수', 'count', 1, 1, 50), numIn('X 간격', 'dx', 0.1), numIn('Y 간격', 'dy', 0.1), numIn('Z 간격', 'dz', 0.1));
      else if (md.type === 'solidify') row.append(numIn('두께', 'thickness', 0.02));
      box.append(row);
    });
    const add = PP.el('div', { class: 'add3d' });
    for (const [k, [name, make]] of Object.entries(MODS)) {
      add.append(PP.el('button', { text: '+ ' + name, onclick: () => {
        if (E.on) { /* 편집 중에도 추가 가능 */ }
        T.scene.convertToEM(it);
        it.mods.push(make());
        modRebuild(it);
        if (E.on) refresh();
        T.commit('모디파이어 추가: ' + name);
        T.refreshProps();
      } }));
    }
    box.append(add);
    if (it.em) {
      const sm = PP.el('input', { type: 'checkbox' });
      sm.checked = !!it.smooth;
      sm.addEventListener('change', () => { it.smooth = sm.checked; modRebuild(it); T.commit('부드러운 셰이딩'); });
      box.append(PP.el('div', { class: 'frow chk' }, PP.el('label', null, sm, '부드러운 셰이딩')));
    }
    p.append(box);
  };

  // ---------- UI ----------
  function sync() {
    if (!ui.panel) return;
    const m = E.mode;
    for (const [id, b] of Object.entries(ui.modeBtns)) b.classList.toggle('on', id === m);
    for (const [id, b] of Object.entries(ui.barBtns)) b.classList.toggle('on', id === m);
    if (E.on && item) {
      const d = derive();
      ui.info.textContent = `정점 ${item.em.v.length} · 면 ${item.em.f.length} — 선택: 점 ${d.V.size} / 선 ${d.E.size} / 면 ${d.F.size}`;
    }
    if (ui.editBtn) ui.editBtn.classList.toggle('active', E.on);
  }
  PP.on('three:init', () => {
    const MODE_NAMES = { vert: '점', edge: '선', face: '면' };
    // 왼쪽 도구: 편집 버튼
    ui.editBtn = PP.el('button', { class: 'tool-btn', text: '✎', title: '편집 모드 (Tab)', onclick: () => E.toggle() });
    PP.$('#tb3d').insertBefore(ui.editBtn, PP.$('#tb3d .tool-sep'));
    // 옵션바: 점/선/면
    ui.bar = PP.el('span', { class: 'edit-modes' });
    ui.bar.hidden = true;
    ui.barBtns = {};
    for (const [id, name] of Object.entries(MODE_NAMES)) ui.barBtns[id] = PP.el('button', { class: 'tgl', text: name, title: name + ' 선택 (' + (['vert', 'edge', 'face'].indexOf(id) + 1) + ')', onclick: () => E.setMode(id) });
    ui.bar.append(PP.el('span', { class: 'set-dim', text: '편집' }), ...Object.values(ui.barBtns));
    PP.$('#bar3d').insertBefore(ui.bar, PP.$('#bar3d select'));
    // 오른쪽 패널
    const panel = PP.el('section', { class: 'panel' });
    panel.hidden = true;
    const body = PP.el('div', { class: 'body edit3d' });
    ui.modeBtns = {};
    const modeRow = PP.el('div', { class: 'edit-row' });
    for (const [id, name] of Object.entries(MODE_NAMES)) ui.modeBtns[id] = PP.el('button', { class: 'tgl', text: name + ' (' + (['vert', 'edge', 'face'].indexOf(id) + 1) + ')', onclick: () => E.setMode(id) });
    modeRow.append(...Object.values(ui.modeBtns));
    const selRow = PP.el('div', { class: 'edit-row' });
    selRow.append(PP.el('button', { class: 'tgl', text: '전체 (A)', onclick: () => E.selectAll() }), PP.el('button', { class: 'tgl', text: '해제', onclick: () => E.selectNone() }), PP.el('button', { class: 'tgl', text: '반전', onclick: () => E.invert() }));
    const par = (label, key, step, min) => {
      const i = PP.el('input', { type: 'number', step, min, value: E.p[key] });
      i.addEventListener('input', () => { if (i.value !== '') E.p[key] = +i.value; });
      return PP.el('label', { class: 'mod-f' }, label, i);
    };
    const params = PP.el('div', { class: 'edit-params' }, par('돌출 거리', 'extrude', 0.05), par('인셋 비율', 'inset', 0.05, 0.05), par('베벨 폭', 'bevel', 0.02, 0.01), par('루프 컷 수', 'cuts', 1, 1));
    const ops = PP.el('div', { class: 'add3d' });
    for (const [t, tip, fn] of [
      ['돌출 (E)', '선택한 면/열린 모서리를 거리만큼 돌출', () => E.extrude()],
      ['인셋 (I)', '선택한 면을 안쪽으로 줄인 새 면 만들기', () => E.inset()],
      ['베벨 (B)', '선택한 모서리를 비스듬히 깎기', () => E.bevel()],
      ['루프 컷 (L)', '선택한 모서리를 지나는 고리를 따라 자르기', () => E.loopCut()],
      ['병합 (M)', '선택한 점들을 중심 한 점으로 합치기', () => E.merge()],
      ['삭제 (X)', '선택한 요소 삭제', () => E.del()],
      ['세분화 (W)', '선택한 면(없으면 전체)을 잘게 나누기', () => E.subdivide()],
      ['면 뒤집기', '선택한 면(없으면 전체)의 방향 뒤집기', () => E.flip()],
    ]) ops.append(PP.el('button', { text: t, title: tip, onclick: fn }));
    ui.info = PP.el('div', { class: 'set-dim', text: '' });
    body.append(modeRow, selRow, params, ops, ui.info, PP.el('button', { class: 'tgl', text: '편집 종료 (Tab)', onclick: () => E.exit() }));
    panel.append(PP.el('header', { text: '편집 모드' }), body);
    T.el.side.insertBefore(panel, T.el.side.children[1] || null);
    ui.panel = panel;
    sync();
  });
})(window.PP);
