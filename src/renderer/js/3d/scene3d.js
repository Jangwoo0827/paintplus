'use strict';
/*
 * 3D 장면 모델: 객체 목록(도형/조명/가져온 메쉬), JSON 직렬화(.pp3d), 스냅샷 기반 실행 취소.
 * three.js 객체(obj3d)는 모델의 '표현'이고, 저장/실행 취소는 항상 toJSON() 상태를 기준으로 한다.
 */
(function (PP) {
  const { THREE } = window.T3;

  const PRIMS = {
    cube: ['큐브', () => new THREE.BoxGeometry(1, 1, 1)],
    sphere: ['구', () => new THREE.SphereGeometry(0.5, 32, 16)],
    ico: ['아이코 구', () => new THREE.IcosahedronGeometry(0.5, 2)],
    cylinder: ['원기둥', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32)],
    cone: ['원뿔', () => new THREE.CylinderGeometry(0, 0.5, 1, 32)],
    torus: ['토러스', () => new THREE.TorusGeometry(0.5, 0.18, 16, 48)],
    plane: ['평면', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)],
  };
  PP.PRIMS3D = PRIMS;

  // ---------- Float32/Uint32 배열 <-> base64 ----------
  const toB64 = (arr) => {
    const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const fromB64 = (b64, Type) => {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Type(u8.buffer);
  };
  function encodeGeometry(g) {
    const o = { pos: toB64(g.attributes.position.array) };
    if (g.attributes.normal) o.nor = toB64(g.attributes.normal.array);
    if (g.attributes.uv) o.uv = toB64(g.attributes.uv.array);
    if (g.index) { o.idx = toB64(new Uint32Array(g.index.array)); }
    return o;
  }
  function decodeGeometry(o) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(fromB64(o.pos, Float32Array), 3));
    if (o.nor) g.setAttribute('normal', new THREE.BufferAttribute(fromB64(o.nor, Float32Array), 3));
    if (o.uv) g.setAttribute('uv', new THREE.BufferAttribute(fromB64(o.uv, Float32Array), 2));
    if (o.idx) g.setIndex(new THREE.BufferAttribute(fromB64(o.idx, Uint32Array), 1));
    if (!o.nor) g.computeVertexNormals();
    return g;
  }

  const DEG = Math.PI / 180;

  class Scene3D {
    constructor() {
      this.id = ++PP.uid;
      this.name = '제목 없는 3D';
      this.path = null;
      this.scene = new THREE.Scene();
      this.root = new THREE.Group(); // 사용자 객체만 담는 그룹 (내보내기 대상)
      this.scene.add(this.root);
      this.items = []; // {id,name,type,kind,obj3d,geomId}
      this.assets = new Map(); // geomId -> BufferGeometry (가져온 메쉬)
      this.nextId = 1;
      this.bg = '#2a2d33';
      this.camera = { pos: [4, 3.2, 5], target: [0, 0.4, 0] };
      this.stack = [];
      this.index = 0;
      this.savedIndex = 0;
    }

    byId(id) { return this.items.find((i) => i.id === id) || null; }

    // ---------- 만들기 ----------
    makeMaterial(m = {}) {
      return new THREE.MeshStandardMaterial({
        color: m.color || '#b8c0cc', roughness: m.roughness == null ? 0.55 : m.roughness, metalness: m.metalness || 0,
        emissive: m.emissive || '#000000', wireframe: !!m.wireframe, side: THREE.DoubleSide,
      });
    }
    addMesh(kind, data = {}) {
      let geom;
      if (data.geomId && this.assets.has(data.geomId)) geom = this.assets.get(data.geomId);
      else geom = PRIMS[kind] ? PRIMS[kind][1]() : new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.Mesh(geom, this.makeMaterial(data.mat));
      mesh.castShadow = mesh.receiveShadow = true;
      const id = data.id || this.nextId++;
      if (id >= this.nextId) this.nextId = id + 1;
      this.applyTransform(mesh, data);
      mesh.visible = data.visible !== false;
      this.root.add(mesh);
      const it = { id, name: data.name || (PRIMS[kind] ? PRIMS[kind][0] : '메쉬'), type: 'mesh', kind, obj3d: mesh, geomId: data.geomId || null };
      mesh.userData.itemId = id;
      this.items.push(it);
      return it;
    }
    addLight(kind, data = {}) {
      const color = data.light ? data.light.color : '#ffffff';
      const intensity = data.light ? data.light.intensity : kind === 'sun' ? 2.5 : 30;
      const l = kind === 'sun' ? new THREE.DirectionalLight(color, intensity) : new THREE.PointLight(color, intensity, 0, 2);
      l.castShadow = true;
      const id = data.id || this.nextId++;
      if (id >= this.nextId) this.nextId = id + 1;
      this.applyTransform(l, data, kind === 'sun' ? [3, 5, 2] : [2, 3, 2]);
      // 조명은 눈에 보이는 작은 구(선택용 프록시)를 가진다
      const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: kind === 'sun' ? 0xffd166 : 0xffffff, wireframe: true }));
      proxy.userData.itemId = id;
      proxy.userData.proxy = true;
      l.add(proxy);
      this.root.add(l);
      const it = { id, name: data.name || (kind === 'sun' ? '태양광' : '점광원'), type: 'light', kind, obj3d: l, geomId: null, proxy };
      l.userData.itemId = id;
      this.items.push(it);
      return it;
    }
    applyTransform(o, d, defPos) {
      const p = d.pos || defPos || [0, 0, 0];
      o.position.set(p[0], p[1], p[2]);
      const r = d.rot || [0, 0, 0];
      o.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG);
      const s = d.scale || [1, 1, 1];
      o.scale.set(s[0], s[1], s[2]);
    }
    remove(id) {
      const it = this.byId(id);
      if (!it) return;
      this.root.remove(it.obj3d);
      if (it.type === 'mesh') { if (!it.geomId) it.obj3d.geometry.dispose(); it.obj3d.material.dispose(); }
      this.items = this.items.filter((i) => i !== it);
    }
    clone(id) {
      const it = this.byId(id);
      if (!it) return null;
      const d = this.itemJSON(it);
      delete d.id;
      d.name = it.name + ' 복사';
      d.pos = [d.pos[0] + 0.5, d.pos[1], d.pos[2] + 0.5];
      return it.type === 'light' ? this.addLight(it.kind, d) : this.addMesh(it.kind, d);
    }

    // ---------- 직렬화 ----------
    itemJSON(it) {
      const o = it.obj3d;
      const d = {
        id: it.id, name: it.name, type: it.type, kind: it.kind, visible: o.visible,
        pos: o.position.toArray().map((v) => +v.toFixed(5)),
        rot: [o.rotation.x / DEG, o.rotation.y / DEG, o.rotation.z / DEG].map((v) => +v.toFixed(4)),
        scale: o.scale.toArray().map((v) => +v.toFixed(5)),
      };
      if (it.type === 'mesh') {
        const m = o.material;
        d.mat = { color: '#' + m.color.getHexString(), roughness: m.roughness, metalness: m.metalness, emissive: '#' + m.emissive.getHexString(), wireframe: m.wireframe };
        if (it.geomId) d.geomId = it.geomId;
      } else d.light = { color: '#' + o.color.getHexString(), intensity: o.intensity };
      return d;
    }
    toJSON() {
      return { items: this.items.map((i) => this.itemJSON(i)), bg: this.bg, nextId: this.nextId };
    }
    /** 상태(JSON)로 장면을 다시 만든다. selId 를 유지하려면 호출 측에서 id 로 다시 선택 */
    build(state) {
      for (const it of this.items.slice()) this.remove(it.id);
      this.nextId = state.nextId || 1;
      this.bg = state.bg || this.bg;
      for (const d of state.items) {
        if (d.type === 'light') this.addLight(d.kind, d); else this.addMesh(d.kind, d);
      }
    }

    // ---------- 실행 취소 ----------
    snapshot() { return JSON.stringify(this.toJSON()); }
    commit(label) {
      this.stack.length = this.index;
      this.stack.push({ label, state: this.snapshot() });
      if (this.stack.length > 150) { this.stack.shift(); this.savedIndex--; }
      this.index = this.stack.length;
    }
    resetHistory() { this.stack = [{ label: '시작', state: this.snapshot() }]; this.index = 1; this.savedIndex = 1; }
    isDirty() { return this.index !== this.savedIndex; }
    canUndo() { return this.index > 1; }
    canRedo() { return this.index < this.stack.length; }
    undo() { if (!this.canUndo()) return false; this.index--; this.build(JSON.parse(this.stack[this.index - 1].state)); return true; }
    redo() { if (!this.canRedo()) return false; this.index++; this.build(JSON.parse(this.stack[this.index - 1].state)); return true; }

    // ---------- 파일(.pp3d) ----------
    serialize() {
      const assets = {};
      for (const it of this.items) if (it.geomId && !assets[it.geomId]) assets[it.geomId] = encodeGeometry(this.assets.get(it.geomId));
      return new TextEncoder().encode(JSON.stringify({ app: 'paintplus-3d', version: 1, name: this.name, scene: this.toJSON(), camera: this.camera, assets }));
    }
    static fromBytes(bytes, name) {
      const j = JSON.parse(new TextDecoder().decode(bytes));
      if (!j || j.app !== 'paintplus-3d') throw new Error('그림판+ 3D 파일이 아닙니다');
      const s = new Scene3D();
      s.name = name || j.name || s.name;
      for (const [id, g] of Object.entries(j.assets || {})) s.assets.set(id, decodeGeometry(g));
      s.camera = j.camera || s.camera;
      s.build(j.scene);
      s.resetHistory();
      return s;
    }
    static starter() {
      const s = new Scene3D();
      s.addMesh('cube', { name: '큐브', pos: [0, 0.5, 0] });
      s.addLight('sun', { name: '태양광' });
      s.resetHistory();
      return s;
    }
  }

  PP.Scene3D = Scene3D;
})(window.PP);
