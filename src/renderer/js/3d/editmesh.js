'use strict';
/*
 * EditMesh: 편집 가능한 다각형 메쉬 (정점 배열 v, 면 배열 f — 면은 시계 반대 방향 정점 인덱스, n각형 허용)
 * 연산(돌출/인셋/베벨/루프 컷/병합/삭제/세분화/뒤집기)과 모디파이어(미러/서브디비전/배열/솔리드화)를 제공한다.
 * three.js 에 의존하는 부분은 toGeometry / fromGeometry 뿐이다.
 */
(function (PP) {
  const { THREE } = window.T3;
  const ek = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  class EM {
    constructor(v, f) { this.v = v || []; this.f = f || []; }
    clone() { return new EM(this.v.map((p) => p.slice()), this.f.map((q) => q.slice())); }
    toJSON() { return { v: this.v.map((p) => p.map((x) => +x.toFixed(5))), f: this.f }; }
    static fromJSON(o) { return new EM(o.v.map((p) => p.slice()), o.f.map((q) => q.slice())); }

    // ---------- 조회 ----------
    /** key -> 이 모서리를 가진 면 인덱스 배열 */
    edgeFaces() {
      const m = new Map();
      this.f.forEach((q, fi) => {
        for (let i = 0; i < q.length; i++) {
          const k = ek(q[i], q[(i + 1) % q.length]);
          if (!m.has(k)) m.set(k, []);
          m.get(k).push(fi);
        }
      });
      return m;
    }
    edges() { return [...this.edgeFaces().keys()].map((k) => k.split(',').map(Number)); }
    faceNormal(fi) {
      const q = this.f[fi];
      let n = [0, 0, 0];
      for (let i = 0; i < q.length; i++) {
        const a = this.v[q[i]], b = this.v[q[(i + 1) % q.length]];
        n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]);
      }
      return norm(n);
    }
    centroid(fi) {
      const q = this.f[fi];
      let c = [0, 0, 0];
      for (const i of q) c = add(c, this.v[i]);
      return mul(c, 1 / q.length);
    }
    /** 모든 모서리가 정확히 두 면에 공유되면 닫힌 다양체 */
    isClosedManifold() {
      for (const fs of this.edgeFaces().values()) if (fs.length !== 2) return false;
      return true;
    }
    /** 쓰이지 않는 정점 제거, 퇴화 면 제거, 인덱스 재정렬 */
    compact() {
      this.f = this.f.map((q) => { const o = []; for (const i of q) if (!o.length || o[o.length - 1] !== i) o.push(i); if (o.length > 1 && o[0] === o[o.length - 1]) o.pop(); return o; }).filter((q) => q.length >= 3 && new Set(q).size === q.length);
      const used = new Map();
      const nv = [];
      this.f.forEach((q, fi) => { this.f[fi] = q.map((i) => { if (!used.has(i)) { used.set(i, nv.length); nv.push(this.v[i]); } return used.get(i); }); });
      this.v = nv;
      return used; // old -> new
    }

    // ---------- 연산 ----------
    /** 선택한 면 돌출. dist: 평균 법선 방향 이동량. 반환: 새로 만들어진(선택될) 정점 집합 */
    extrudeFaces(selF, dist) {
      const sel = [...selF];
      if (!sel.length) return null;
      const useCount = new Map(), dir = new Map();
      for (const fi of sel) {
        const q = this.f[fi];
        for (let i = 0; i < q.length; i++) {
          const a = q[i], b = q[(i + 1) % q.length], k = ek(a, b);
          useCount.set(k, (useCount.get(k) || 0) + 1);
          dir.set(k, [a, b]);
        }
      }
      const map = new Map();
      let nrm = [0, 0, 0];
      for (const fi of sel) { nrm = add(nrm, this.faceNormal(fi)); for (const i of this.f[fi]) if (!map.has(i)) map.set(i, null); }
      nrm = norm(nrm);
      for (const i of map.keys()) { map.set(i, this.v.length); this.v.push(add(this.v[i], mul(nrm, dist))); }
      const sides = [];
      for (const [k, c] of useCount) if (c === 1) { const [a, b] = dir.get(k); sides.push([a, b, map.get(b), map.get(a)]); }
      for (const fi of sel) this.f[fi] = this.f[fi].map((i) => map.get(i));
      this.f.push(...sides);
      this.compact();
      return null;
    }
    /** 면마다 안쪽으로 인셋 (t: 0~0.9, 중심 방향 비율) */
    insetFaces(selF, t) {
      for (const fi of [...selF]) {
        const q = this.f[fi], c = this.centroid(fi);
        const inner = q.map((i) => { this.v.push(add(this.v[i], mul(sub(c, this.v[i]), t))); return this.v.length - 1; });
        for (let i = 0; i < q.length; i++) this.f.push([q[i], q[(i + 1) % q.length], inner[(i + 1) % q.length], inner[i]]);
        this.f[fi] = inner;
      }
    }
    /** 모서리 하나 베벨 (양 끝 정점의 차수가 3 일 때만). 성공하면 true */
    bevelEdge(a, b, d) {
      const ef = this.edgeFaces();
      const fs = ef.get(ek(a, b));
      if (!fs || fs.length !== 2) return false;
      let F1 = -1, F2 = -1;
      for (const fi of fs) {
        const q = this.f[fi];
        for (let i = 0; i < q.length; i++) if (q[i] === a && q[(i + 1) % q.length] === b) F1 = fi; else if (q[i] === b && q[(i + 1) % q.length] === a) F2 = fi;
      }
      if (F1 < 0 || F2 < 0) return false;
      const facesAt = (v) => this.f.map((q, i) => (q.includes(v) ? i : -1)).filter((i) => i >= 0);
      if (facesAt(a).length !== 3 || facesAt(b).length !== 3) return false;
      const q1 = this.f[F1], q2 = this.f[F2];
      const at = (q, v) => q.indexOf(v);
      const prev = (q, v) => q[(at(q, v) + q.length - 1) % q.length];
      const next = (q, v) => q[(at(q, v) + 1) % q.length];
      const toward = (v, w) => { const dv = sub(this.v[w], this.v[v]); const l = len(dv); return add(this.v[v], mul(dv, Math.min(0.45, d / (l || 1)))); };
      const pa = prev(q1, a), nb = next(q1, b); // F1: ..pa a b nb..
      const pb = prev(q2, b), na = next(q2, a); // F2: ..pb b a na..
      const mk = (p) => { this.v.push(p); return this.v.length - 1; };
      const a1 = mk(toward(a, pa)), b1 = mk(toward(b, nb)), b2 = mk(toward(b, pb)), a2 = mk(toward(a, na));
      const rep = (q, oldV, newVs) => { const i = q.indexOf(oldV); q.splice(i, 1, ...newVs); };
      rep(q1, a, [a1]); rep(q1, b, [b1]);
      rep(q2, b, [b2]); rep(q2, a, [a2]);
      for (const gi of facesAt(a)) if (gi !== F1 && gi !== F2) rep(this.f[gi], a, [a2, a1]);
      for (const gi of facesAt(b)) if (gi !== F1 && gi !== F2) rep(this.f[gi], b, [b1, b2]);
      this.f.push([b1, a1, a2, b2]);
      return true;
    }
    /** 루프 컷: key 모서리를 지나는 쿼드 고리를 n 번 자른다. 반환: 자른 새 정점 집합 */
    loopCut(a, b, n) {
      const ef = this.edgeFaces();
      const ring = new Set([ek(a, b)]);
      const quadFaces = new Set();
      const walk = (startFace, edge) => {
        let f = startFace, e = edge;
        for (let guard = 0; guard < 10000; guard++) {
          const q = this.f[f];
          if (q.length !== 4 || quadFaces.has(f)) return;
          quadFaces.add(f);
          const i = q.findIndex((v, j) => ek(v, q[(j + 1) % 4]) === e);
          const oe = ek(q[(i + 2) % 4], q[(i + 3) % 4]);
          ring.add(oe);
          const next = (ef.get(oe) || []).find((x) => x !== f);
          if (next === undefined) return;
          f = next; e = oe;
        }
      };
      for (const f of ef.get(ek(a, b)) || []) walk(f, ek(a, b));
      // 새 정점: 모서리(작은 번호→큰 번호) 위에 n 개
      const cuts = new Map();
      for (const k of ring) {
        const [x, y] = k.split(',').map(Number);
        const ids = [];
        for (let i = 1; i <= n; i++) { this.v.push(add(this.v[x], mul(sub(this.v[y], this.v[x]), i / (n + 1)))); ids.push(this.v.length - 1); }
        cuts.set(k, ids);
      }
      const along = (p, q) => { const ids = cuts.get(ek(p, q)); return p < q ? ids : ids.slice().reverse(); };
      const out = [];
      this.f.forEach((q, fi) => {
        if (quadFaces.has(fi)) {
          const i = q.findIndex((v, j) => ring.has(ek(v, q[(j + 1) % 4])) && ring.has(ek(q[(j + 2) % 4], q[(j + 3) % 4])));
          const q0 = q[i], q1 = q[(i + 1) % 4], q2 = q[(i + 2) % 4], q3 = q[(i + 3) % 4];
          const P = [q0, ...along(q0, q1), q1], Q = [q3, ...along(q3, q2), q2];
          for (let j = 0; j <= n; j++) out.push([P[j], P[j + 1], Q[j + 1], Q[j]]);
        } else {
          // 고리에 닿은 다른 면(삼각형/n각형)은 모서리에 정점만 끼워 넣어 균열을 막는다
          const nq = [];
          for (let j = 0; j < q.length; j++) {
            const p = q[j], r = q[(j + 1) % q.length];
            nq.push(p);
            if (ring.has(ek(p, r))) nq.push(...along(p, r));
          }
          out.push(nq);
        }
      });
      this.f = out;
      return new Set([].concat(...[...cuts.values()]));
    }
    /** 선택 정점을 중심점으로 병합. 반환: 병합된 정점의 (compact 후) 인덱스 */
    mergeVerts(selV) {
      const s = [...selV];
      if (s.length < 2) return null;
      let c = [0, 0, 0];
      for (const i of s) c = add(c, this.v[i]);
      c = mul(c, 1 / s.length);
      const t = Math.min(...s);
      this.v[t] = c;
      const m = new Set(s);
      this.f = this.f.map((q) => q.map((i) => (m.has(i) ? t : i)));
      const map = this.compact();
      return map.get(t);
    }
    deleteVerts(selV) {
      this.f = this.f.filter((q) => !q.some((i) => selV.has(i)));
      this.compact();
    }
    deleteFaces(selF) {
      this.f = this.f.filter((_, i) => !selF.has(i));
      this.compact();
    }
    flipFaces(selF) { for (const fi of selF) this.f[fi] = this.f[fi].slice().reverse(); }
    /** 선택한 면(없으면 전체)을 세분화: 각 면 → 변마다 사각형. 인접 면에는 중점을 끼워 균열을 막는다 */
    subdivide(selF) {
      const sel = selF && selF.size ? selF : new Set(this.f.map((_, i) => i));
      const mid = new Map();
      const midOf = (a, b) => {
        const k = ek(a, b);
        if (!mid.has(k)) { this.v.push(mul(add(this.v[a], this.v[b]), 0.5)); mid.set(k, this.v.length - 1); }
        return mid.get(k);
      };
      for (const fi of sel) { const q = this.f[fi]; for (let i = 0; i < q.length; i++) midOf(q[i], q[(i + 1) % q.length]); }
      const out = [];
      this.f.forEach((q, fi) => {
        if (sel.has(fi)) {
          const c = this.centroid(fi);
          this.v.push(c);
          const ci = this.v.length - 1;
          const m = q.map((v, i) => midOf(v, q[(i + 1) % q.length]));
          for (let i = 0; i < q.length; i++) out.push([q[i], m[i], ci, m[(i + q.length - 1) % q.length]]);
        } else {
          const nq = [];
          for (let i = 0; i < q.length; i++) { nq.push(q[i]); const k = ek(q[i], q[(i + 1) % q.length]); if (mid.has(k)) nq.push(mid.get(k)); }
          out.push(nq);
        }
      });
      this.f = out;
    }
    /** 점 이동 (집합) */
    translate(set, d) { for (const i of set) this.v[i] = add(this.v[i], d); }

    // ---------- 모디파이어 (새 EM 반환) ----------
    mirror(axis, merge = 0.0001) {
      const ax = 'xyz'.indexOf(axis);
      const n = this.v.length;
      const v = this.v.map((p) => p.slice());
      const map = [];
      for (let i = 0; i < n; i++) {
        if (Math.abs(this.v[i][ax]) <= merge) map.push(i);
        else { const p = this.v[i].slice(); p[ax] = -p[ax]; v.push(p); map.push(v.length - 1); }
      }
      const f = this.f.map((q) => q.slice());
      for (const q of this.f) f.push(q.map((i) => map[i]).reverse());
      const r = new EM(v, f);
      r.compact();
      return r;
    }
    array(count, off) {
      const v = [], f = [];
      for (let c = 0; c < count; c++) {
        const base = v.length;
        for (const p of this.v) v.push([p[0] + off[0] * c, p[1] + off[1] * c, p[2] + off[2] * c]);
        for (const q of this.f) f.push(q.map((i) => i + base));
      }
      return new EM(v, f);
    }
    solidify(th) {
      const n = this.v.length, vn = this.v.map(() => [0, 0, 0]);
      this.f.forEach((q, fi) => { const fn = this.faceNormal(fi); for (const i of q) vn[i] = add(vn[i], fn); });
      const v = this.v.map((p) => p.slice());
      for (let i = 0; i < n; i++) v.push(sub(this.v[i], mul(norm(vn[i]), th)));
      const f = this.f.map((q) => q.slice());
      for (const q of this.f) f.push(q.map((i) => i + n).reverse());
      for (const [k, fs] of this.edgeFaces()) {
        if (fs.length !== 1) continue;
        const q = this.f[fs[0]];
        const [x, y] = k.split(',').map(Number);
        const i = q.findIndex((vv, j) => (vv === x && q[(j + 1) % q.length] === y) || (vv === y && q[(j + 1) % q.length] === x));
        const a = q[i], b = q[(i + 1) % q.length];
        f.push([b, a, a + n, b + n]);
      }
      return new EM(v, f);
    }
    /** Catmull-Clark 서브디비전 (levels 회) */
    subsurf(levels) {
      let m = this;
      for (let l = 0; l < levels && m.f.length * 4 <= 150000; l++) m = m._cc();
      return m;
    }
    _cc() {
      const nv = this.v.length;
      const ef = this.edgeFaces();
      const fp = this.f.map((_, i) => this.centroid(i));
      const v = this.v.map((p) => p.slice());
      const fIdx = fp.map((p) => { v.push(p); return v.length - 1; });
      const eIdx = new Map();
      for (const [k, fs] of ef) {
        const [a, b] = k.split(',').map(Number);
        let p = mul(add(this.v[a], this.v[b]), 0.5);
        if (fs.length === 2) p = mul(add(add(this.v[a], this.v[b]), add(fp[fs[0]], fp[fs[1]])), 0.25);
        v.push(p);
        eIdx.set(k, v.length - 1);
      }
      // 정점 갱신
      const vf = Array.from({ length: nv }, () => []), ve = Array.from({ length: nv }, () => []);
      this.f.forEach((q, fi) => q.forEach((i) => vf[i].push(fi)));
      for (const [k, fs] of ef) { const [a, b] = k.split(',').map(Number); ve[a].push([k, fs.length]); ve[b].push([k, fs.length]); }
      for (let i = 0; i < nv; i++) {
        const n = vf[i].length;
        if (!n) continue;
        const bnd = ve[i].filter((e) => e[1] === 1);
        if (bnd.length) {
          let s = [0, 0, 0];
          for (const [k] of bnd) { const [a, b] = k.split(',').map(Number); s = add(s, this.v[a === i ? b : a]); }
          v[i] = mul(add(mul(this.v[i], 6), s), 1 / 8);
        } else {
          let F = [0, 0, 0], R = [0, 0, 0];
          for (const fi of vf[i]) F = add(F, fp[fi]);
          for (const [k] of ve[i]) { const [a, b] = k.split(',').map(Number); R = add(R, mul(add(this.v[a], this.v[b]), 0.5)); }
          F = mul(F, 1 / n); R = mul(R, 1 / ve[i].length);
          v[i] = mul(add(add(F, mul(R, 2)), mul(this.v[i], n - 3)), 1 / n);
        }
      }
      const f = [];
      this.f.forEach((q, fi) => {
        for (let i = 0; i < q.length; i++) {
          const prev = q[(i + q.length - 1) % q.length], nxt = q[(i + 1) % q.length];
          f.push([q[i], eIdx.get(ek(q[i], nxt)), fIdx[fi], eIdx.get(ek(prev, q[i]))]);
        }
      });
      return new EM(v, f);
    }

    // ---------- three.js 변환 ----------
    /** 삼각화한 지오메트리와 삼각형→면 매핑. smooth: 정점 법선 평균 */
    toGeometry(smooth) {
      const pos = [], nor = [], triFace = [];
      let vn = null;
      if (smooth) {
        vn = this.v.map(() => [0, 0, 0]);
        this.f.forEach((q, fi) => { const fnv = this.faceNormal(fi); for (const i of q) vn[i] = add(vn[i], fnv); });
        vn = vn.map(norm);
      }
      this.f.forEach((q, fi) => {
        const fnv = smooth ? null : this.faceNormal(fi);
        for (let i = 1; i < q.length - 1; i++) {
          for (const idx of [q[0], q[i], q[i + 1]]) {
            pos.push(...this.v[idx]);
            nor.push(...(smooth ? vn[idx] : fnv));
          }
          triFace.push(fi);
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.userData.triFace = triFace;
      return g;
    }
    static fromGeometry(geo, eps = 1e-5) {
      const p = geo.attributes.position;
      const idx = geo.index ? Array.from(geo.index.array) : Array.from({ length: p.count }, (_, i) => i);
      const key = (i) => [p.getX(i), p.getY(i), p.getZ(i)].map((x) => Math.round(x / eps)).join(',');
      const map = new Map(), v = [], remap = [];
      for (let i = 0; i < p.count; i++) {
        const k = key(i);
        if (!map.has(k)) { map.set(k, v.length); v.push([p.getX(i), p.getY(i), p.getZ(i)]); }
        remap[i] = map.get(k);
      }
      const f = [];
      for (let i = 0; i + 2 < idx.length; i += 3) { const t = [remap[idx[i]], remap[idx[i + 1]], remap[idx[i + 2]]]; if (new Set(t).size === 3) f.push(t); }
      return new EM(v, f);
    }
  }

  // ---------- 기본 도형 생성기 ----------
  const quadGrid = (rows, cols, pt, wrapU, wrapV) => {
    const v = [], f = [];
    const R = wrapV ? rows : rows + 1, C = wrapU ? cols : cols + 1;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) v.push(pt(r / rows, c / cols));
    const id = (r, c) => (r % R) * C + (c % C);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) f.push([id(r, c), id(r, c + 1), id(r + 1, c + 1), id(r + 1, c)]);
    return new EM(v, f);
  };
  EM.make = function (kind) {
    switch (kind) {
      case 'cube': {
        const v = [];
        for (const z of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const x of [-0.5, 0.5]) v.push([x, y, z]);
        // 인덱스: x + 2y + 4z
        const f = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
        return new EM(v, f);
      }
      case 'plane': {
        return quadGrid(4, 4, (r, c) => [c - 0.5, 0, 0.5 - r], false, false);
      }
      case 'cylinder': {
        const n = 24, v = [], f = [];
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; v.push([Math.cos(a) * 0.5, -0.5, Math.sin(a) * 0.5]); }
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; v.push([Math.cos(a) * 0.5, 0.5, Math.sin(a) * 0.5]); }
        for (let i = 0; i < n; i++) f.push([i, n + i, n + ((i + 1) % n), (i + 1) % n]);
        f.push(Array.from({ length: n }, (_, i) => n + i));
        f.push(Array.from({ length: n }, (_, i) => i));
        const m = new EM(v, f);
        return fixOutward(m);
      }
      case 'cone': {
        const n = 24, v = [[0, 0.5, 0]], f = [];
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; v.push([Math.cos(a) * 0.5, -0.5, Math.sin(a) * 0.5]); }
        for (let i = 0; i < n; i++) f.push([0, 1 + i, 1 + ((i + 1) % n)]);
        f.push(Array.from({ length: n }, (_, i) => 1 + i));
        return fixOutward(new EM(v, f));
      }
      case 'sphere': {
        const seg = 24, rings = 12, v = [[0, 0.5, 0]], f = [];
        for (let r = 1; r < rings; r++) for (let s = 0; s < seg; s++) {
          const th = (r / rings) * Math.PI, ph = (s / seg) * Math.PI * 2;
          v.push([0.5 * Math.sin(th) * Math.cos(ph), 0.5 * Math.cos(th), 0.5 * Math.sin(th) * Math.sin(ph)]);
        }
        v.push([0, -0.5, 0]);
        const id = (r, s) => 1 + (r - 1) * seg + (s % seg);
        for (let s = 0; s < seg; s++) f.push([0, id(1, s), id(1, s + 1)]);
        for (let r = 1; r < rings - 1; r++) for (let s = 0; s < seg; s++) f.push([id(r, s), id(r + 1, s), id(r + 1, s + 1), id(r, s + 1)]);
        const last = v.length - 1;
        for (let s = 0; s < seg; s++) f.push([id(rings - 1, s + 1), id(rings - 1, s), last]);
        return fixOutward(new EM(v, f));
      }
      case 'torus': {
        const m = quadGrid(16, 32, (r, c) => {
          const u = c * Math.PI * 2, w = r * Math.PI * 2, R = 0.5, rr = 0.18;
          return [(R + rr * Math.cos(w)) * Math.cos(u), rr * Math.sin(w), (R + rr * Math.cos(w)) * Math.sin(u)];
        }, true, true);
        return fixVolume(m);
      }
      case 'ico': default: {
        const geo = new THREE.IcosahedronGeometry(0.5, 2);
        geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
        return fixOutward(EM.fromGeometry(geo, 1e-4));
      }
    }
  };
  /** 면 방향이 바깥쪽(중심에서 멀어지는 쪽)을 향하도록 정렬 */
  function fixOutward(m) {
    let c = [0, 0, 0];
    for (const p of m.v) c = add(c, p);
    c = mul(c, 1 / m.v.length);
    m.f.forEach((q, fi) => { if (m.faceNormal(fi)[0] * (m.centroid(fi)[0] - c[0]) + m.faceNormal(fi)[1] * (m.centroid(fi)[1] - c[1]) + m.faceNormal(fi)[2] * (m.centroid(fi)[2] - c[2]) < 0) m.f[fi] = q.slice().reverse(); });
    return m;
  }

  /** 부호 있는 부피가 음수면 모든 면을 뒤집는다 (오목한 닫힌 메쉬용) */
  function fixVolume(m) {
    let vol = 0;
    for (const q of m.f) for (let i = 1; i < q.length - 1; i++) { const a = m.v[q[0]], b = m.v[q[i]], c = m.v[q[i + 1]]; const x = cross(b, c); vol += a[0] * x[0] + a[1] * x[1] + a[2] * x[2]; }
    if (vol < 0) m.f = m.f.map((q) => q.slice().reverse());
    return m;
  }

  /** 모디파이어 스택 적용: [{type,enabled,...params}] */
  EM.applyMods = function (em, mods) {
    let m = em;
    for (const md of mods || []) {
      if (md.enabled === false) continue;
      if (md.type === 'mirror') m = m.mirror(md.axis || 'x');
      else if (md.type === 'subsurf') m = m.subsurf(Math.max(1, Math.min(3, md.levels || 1)));
      else if (md.type === 'array') m = m.array(Math.max(1, Math.min(50, md.count || 2)), [md.dx == null ? 1.2 : md.dx, md.dy || 0, md.dz || 0]);
      else if (md.type === 'solidify') m = m.solidify(md.thickness == null ? 0.1 : md.thickness);
    }
    return m;
  };

  PP.EditMesh = EM;
})(window.PP);
