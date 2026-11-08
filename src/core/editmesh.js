// EditMesh: malha poligonal (quads/n-gons) editável, convertida de/para BufferGeometry.
// Base das operações de modelagem: extrudar, inset, bevel, loop cut, merge, conectar, preencher.
import * as THREE from 'three';

const ek = (a, b) => (a < b ? a + '_' + b : b + '_' + a);

export class EditMesh {
  constructor() { this.verts = []; this.faces = []; this.uvs = []; this.smooth = false; }

  // ---------- Conversão a partir de geometria triangulada ----------
  static fromGeometry(geo) {
    const em = new EditMesh();
    const pos = geo.attributes.position, uv = geo.attributes.uv, idx = geo.index;
    const map = new Map(); const vid = [];
    for (let i = 0; i < pos.count; i++) {
      // Inteiros arredondados: evita que -0.00000 e 0.00000 virem chaves diferentes
      const q = (x) => Math.round(x * 1e5) || 0;
      const k = `${q(pos.getX(i))},${q(pos.getY(i))},${q(pos.getZ(i))}`;
      if (!map.has(k)) { map.set(k, em.verts.length); em.verts.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))); }
      vid.push(map.get(k));
    }
    const triCount = idx ? idx.count / 3 : pos.count / 3; const tris = [];
    for (let t = 0; t < triCount; t++) {
      const c = [0, 1, 2].map((k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k));
      const v = c.map((i) => vid[i]);
      if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue; // degenerado
      tris.push({ v, uv: c.map((i) => (uv ? [uv.getX(i), uv.getY(i)] : [0, 0])) });
    }
    // Junta pares de triângulos coplanares que formam um quad convexo
    const n = tris.map((t) => em._normal(t.v)); const edgeTri = new Map(); const used = new Uint8Array(tris.length);
    tris.forEach((t, i) => { for (let k = 0; k < 3; k++) { const e = ek(t.v[k], t.v[(k + 1) % 3]); (edgeTri.get(e) || edgeTri.set(e, []).get(e)).push(i); } });
    for (let i = 0; i < tris.length; i++) {
      if (used[i]) continue; const t = tris[i]; let merged = false;
      for (let k = 0; k < 3 && !merged; k++) {
        const a = t.v[k], b = t.v[(k + 1) % 3]; const others = edgeTri.get(ek(a, b)).filter((j) => j !== i && !used[j]);
        for (const j of others) {
          if (n[i].dot(n[j]) < 0.9999) continue;
          const u = tris[j]; const kb = u.v.indexOf(b); if (u.v[(kb + 1) % 3] !== a) continue;
          const opp = u.v[(kb + 2) % 3], oppUV = u.uv[(kb + 2) % 3];
          const quad = [a, opp, b, t.v[(k + 2) % 3]]; // a → (opp) → b → c
          const quv = [t.uv[k], oppUV, t.uv[(k + 1) % 3], t.uv[(k + 2) % 3]];
          if (!em._convex(quad)) continue;
          em.faces.push(quad); em.uvs.push(quv); used[i] = used[j] = 1; merged = true; break;
        }
      }
      if (!merged) { em.faces.push(t.v.slice()); em.uvs.push(t.uv.map((x) => x.slice())); used[i] = 1; }
    }
    return em;
  }

  _normal(f) {
    const n = new THREE.Vector3(); const V = this.verts;
    for (let i = 0; i < f.length; i++) { const a = V[f[i]], b = V[f[(i + 1) % f.length]]; n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y); }
    return n.normalize();
  }
  faceNormal(fi) { return this._normal(this.faces[fi]); }
  faceCenter(fi) { const c = new THREE.Vector3(); const f = this.faces[fi]; f.forEach((v) => c.add(this.verts[v])); return c.divideScalar(f.length); }
  _convex(f) {
    const n = this._normal(f); let sign = 0;
    for (let i = 0; i < f.length; i++) {
      const a = this.verts[f[i]], b = this.verts[f[(i + 1) % f.length]], c = this.verts[f[(i + 2) % f.length]];
      const s = Math.sign(new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, b)).dot(n));
      if (s === 0) continue; if (sign === 0) sign = s; else if (s !== sign) return false;
    }
    return true;
  }

  // ---------- Topologia ----------
  edgeFaces() { const m = new Map(); this.faces.forEach((f, fi) => f.forEach((v, i) => { const e = ek(v, f[(i + 1) % f.length]); (m.get(e) || m.set(e, []).get(e)).push(fi); })); return m; }
  edges() { return [...this.edgeFaces().keys()].map((k) => k.split('_').map(Number)); }
  vertFaces() { const m = this.verts.map(() => []); this.faces.forEach((f, fi) => f.forEach((v) => m[v].push(fi))); return m; }

  // ---------- Geometria final ----------
  toGeometry(smoothAngle = 35) {
    const P = [], U = [], N = []; this.triToFace = []; this.cornerVert = [];
    const fn = this.faces.map((_, i) => this.faceNormal(i)); const vf = this.vertFaces(); const cosA = Math.cos(THREE.MathUtils.degToRad(smoothAngle));
    const cornerNormal = (fi, v) => {
      if (!this.smooth) return fn[fi];
      const n = new THREE.Vector3(); for (const g of vf[v]) if (fn[g].dot(fn[fi]) >= cosA) n.add(fn[g]); return n.normalize();
    };
    this.faces.forEach((f, fi) => {
      const tris = this._triangulate(f, fn[fi]);
      for (const t of tris) {
        for (const k of t) { const v = f[k]; this.cornerVert.push(v); P.push(this.verts[v].x, this.verts[v].y, this.verts[v].z); const uv = this.uvs[fi]?.[k] || [0, 0]; U.push(uv[0], uv[1]); const cn = cornerNormal(fi, v); N.push(cn.x, cn.y, cn.z); }
        this.triToFace.push(fi);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  _triangulate(f, n) {
    if (f.length === 3) return [[0, 1, 2]];
    if (f.length === 4 && this._convex(f)) return [[0, 1, 2], [0, 2, 3]];
    // n-gon (pode ser côncavo): projeta no plano e usa ear-clipping do three
    const ax = Math.abs(n.x) > Math.abs(n.y) && Math.abs(n.x) > Math.abs(n.z) ? 'x' : Math.abs(n.y) > Math.abs(n.z) ? 'y' : 'z';
    const pts = f.map((v) => { const p = this.verts[v]; return ax === 'x' ? new THREE.Vector2(p.y, p.z) : ax === 'y' ? new THREE.Vector2(p.x, p.z) : new THREE.Vector2(p.x, p.y); });
    const flip = (ax === 'x' ? n.x : ax === 'y' ? -n.y : n.z) < 0;
    const tris = THREE.ShapeUtils.triangulateShape(flip ? pts.slice().reverse() : pts, []);
    return tris.map((t) => (flip ? t.map((i) => f.length - 1 - i).reverse() : t));
  }

  clone() { const e = new EditMesh(); e.verts = this.verts.map((v) => v.clone()); e.faces = this.faces.map((f) => f.slice()); e.uvs = this.uvs.map((f) => f.map((u) => u.slice())); e.smooth = this.smooth; return e; }

  // Remove vértices não usados e reindexa
  compact() {
    const used = new Map(); const nv = [];
    this.faces.forEach((f) => f.forEach((v) => { if (!used.has(v)) { used.set(v, nv.length); nv.push(this.verts[v]); } }));
    this.faces = this.faces.map((f) => f.map((v) => used.get(v))); this.verts = nv; return used;
  }
  addVert(p) { this.verts.push(p.clone()); return this.verts.length - 1; }
  addFace(f, uv) { this.faces.push(f); this.uvs.push(uv || f.map((_, i) => [[0, 0], [1, 0], [1, 1], [0, 1]][i % 4])); return this.faces.length - 1; }

  // ---------- Operações ----------
  extrudeFaces(sel, dist = 0.3) {
    const fs = [...sel]; const ef = this.edgeFaces(); const map = new Map();
    const n = new THREE.Vector3(); fs.forEach((fi) => n.add(this.faceNormal(fi))); n.normalize().multiplyScalar(dist);
    const boundary = [];
    for (const fi of fs) { const f = this.faces[fi]; f.forEach((a, i) => { const b = f[(i + 1) % f.length]; if (ef.get(ek(a, b)).filter((x) => sel.has(x)).length === 1) boundary.push([a, b]); }); }
    const nv = (v) => { if (!map.has(v)) map.set(v, this.addVert(this.verts[v].clone().add(n))); return map.get(v); };
    for (const fi of fs) this.faces[fi] = this.faces[fi].map(nv);
    for (const [a, b] of boundary) this.addFace([a, b, nv(b), nv(a)]);
    return map;
  }

  insetFaces(sel, t = 0.25) {
    for (const fi of [...sel]) {
      const f = this.faces[fi]; const c = this.faceCenter(fi);
      const inner = f.map((v) => this.addVert(this.verts[v].clone().lerp(c, t)));
      f.forEach((a, i) => { const j = (i + 1) % f.length; this.addFace([a, f[j], inner[j], inner[i]]); });
      this.faces[fi] = inner;
    }
  }

  // Loop cut: percorre o "anel" de quads a partir de uma aresta e divide cada um ao meio.
  loopCut(a, b, t = 0.5) {
    const ef = this.edgeFaces();
    const ring = new Map(); // face → índice i da aresta de entrada (corta i e i+2)
    const startKey = ek(a, b);
    for (const first of ef.get(startKey) || []) {
      let fi = first, ea = a, eb = b;
      for (let guard = 0; guard < 100000; guard++) {
        const f = this.faces[fi]; if (f.length !== 4 || ring.has(fi)) break;
        let i = 0; while (ek(f[i], f[(i + 1) % 4]) !== ek(ea, eb)) i++;
        ring.set(fi, i);
        ea = f[(i + 2) % 4]; eb = f[(i + 3) % 4];
        if (ek(ea, eb) === startKey) break;
        const next = (ef.get(ek(ea, eb)) || []).find((x) => x !== fi);
        if (next === undefined) break; fi = next;
      }
    }
    if (!ring.size) return 0;
    const cut = new Map();
    // Ponto do corte na aresta sempre medido a partir do vértice de menor índice (consistente nos dois lados)
    const mid = (p, q) => { const k = ek(p, q); if (!cut.has(k)) { const lo = Math.min(p, q), hi = Math.max(p, q); cut.set(k, this.addVert(this.verts[lo].clone().lerp(this.verts[hi], t))); } return cut.get(k); };
    const lerpUV = (u, v, p, q) => { const s = p < q ? t : 1 - t; return [u[0] + (v[0] - u[0]) * s, u[1] + (v[1] - u[1]) * s]; };
    for (const [fi, i] of ring) {
      const f = this.faces[fi], uv = this.uvs[fi] || f.map(() => [0, 0]);
      const I = (k) => (i + k) % 4;
      const m1 = mid(f[I(0)], f[I(1)]), m2 = mid(f[I(2)], f[I(3)]);
      const u1 = lerpUV(uv[I(0)], uv[I(1)], f[I(0)], f[I(1)]), u2 = lerpUV(uv[I(2)], uv[I(3)], f[I(2)], f[I(3)]);
      this.faces[fi] = [f[I(0)], m1, m2, f[I(3)]]; this.uvs[fi] = [uv[I(0)], u1, u2, uv[I(3)]];
      this.addFace([m1, f[I(1)], f[I(2)], m2], [u1, uv[I(1)], uv[I(2)], u2]);
    }
    // Faces fora do anel que tocam arestas cortadas recebem o vértice novo (sem buracos)
    this.faces.forEach((f, fi) => {
      for (let k = 0; k < f.length; k++) {
        const key = ek(f[k], f[(k + 1) % f.length]); const m = cut.get(key);
        if (m !== undefined && !f.includes(m)) { f.splice(k + 1, 0, m); this.uvs[fi]?.splice(k + 1, 0, [0, 0]); k++; }
      }
    });
    return cut.size;
  }

  // Bevel de arestas (1 segmento): cada aresta vira uma faixa chanfrada.
  bevelEdges(edgeKeys, w = 0.1) {
    let done = 0;
    for (const key of edgeKeys) {
      const [a, b] = key.split('_').map(Number); const ef = this.edgeFaces(); const fs = ef.get(ek(a, b)); if (!fs || fs.length !== 2) continue;
      let [F1, F2] = fs; if (this.faces[F1][(this.faces[F1].indexOf(a) + 1) % this.faces[F1].length] !== b) [F1, F2] = [F2, F1];
      const slide = (fi, v, other) => { // vizinho de v em fi que não é "other"
        const f = this.faces[fi]; const i = f.indexOf(v); const p = f[(i - 1 + f.length) % f.length], n = f[(i + 1) % f.length]; const q = p === other ? n : p;
        return this.verts[v].clone().add(this.verts[q].clone().sub(this.verts[v]).setLength(Math.min(w, this.verts[q].distanceTo(this.verts[v]) * 0.49)));
      };
      // 1º: lê TODA a vizinhança na malha original (antes de qualquer substituição)
      const side = (fi, v, o) => { const f = this.faces[fi]; const i = f.indexOf(v); const p = f[(i - 1 + f.length) % f.length]; return p === o ? f[(i + 1) % f.length] : p; };
      const info = {};
      for (const [v, o] of [[a, b], [b, a]]) {
        const s1 = side(F1, v, o), s2 = side(F2, v, o);
        info[v] = { s1, s2, G: (ef.get(ek(v, s1)) || []).find((x) => x !== F1), H: (ef.get(ek(v, s2)) || []).find((x) => x !== F2), p1: slide(F1, v, o), p2: slide(F2, v, o) };
      }
      const ends = {};
      for (const v of [a, b]) ends[v] = [this.addVert(info[v].p1), this.addVert(info[v].p2)];
      const rep = (fi, v, nv) => { const f = this.faces[fi]; f[f.indexOf(v)] = nv; };
      // 2º: aplica as mudanças
      for (const v of [a, b]) {
        const [v1, v2] = ends[v]; const { s1, s2, G, H } = info[v];
        rep(F1, v, v1); rep(F2, v, v2);
        const insertAfter = (fi, x, y, nv) => { if (fi === undefined) return; const f = this.faces[fi]; for (let i = 0; i < f.length; i++) { const j = (i + 1) % f.length; if ((f[i] === x && f[j] === y) || (f[i] === y && f[j] === x)) { f.splice(i + 1, 0, nv); return; } } };
        if (G !== undefined && G === H) {
          const f = this.faces[G]; const i = f.indexOf(v); const prev = f[(i - 1 + f.length) % f.length];
          f.splice(i, 1, ...(prev === s1 ? [v1, v2] : [v2, v1]));
        } else {
          insertAfter(G, v, s1, v1); insertAfter(H, v, s2, v2);
          const cap = [v, v1, v2]; const cn = this._normal(cap); const ref = this.faceNormal(F1).add(this.faceNormal(F2));
          this.addFace(cn.dot(ref) < 0 ? cap.reverse() : cap);
        }
      }
      this.addFace([ends[b][0], ends[a][0], ends[a][1], ends[b][1]]);
      done++;
    }
    this.compact();
    return done;
  }

  mergeVerts(sel) {
    const vs = [...sel]; if (vs.length < 2) return;
    const c = new THREE.Vector3(); vs.forEach((v) => c.add(this.verts[v])); c.divideScalar(vs.length);
    const keep = vs[0]; this.verts[keep].copy(c); const set = new Set(vs);
    this.faces = this.faces.map((f, fi) => {
      const out = []; const ou = [];
      f.forEach((v, i) => { const nv = set.has(v) ? keep : v; if (out[out.length - 1] !== nv) { out.push(nv); ou.push(this.uvs[fi]?.[i] || [0, 0]); } });
      if (out.length > 1 && out[0] === out[out.length - 1]) { out.pop(); ou.pop(); }
      this.uvs[fi] = ou; return out;
    });
    this._dropDegenerate(); this.compact();
  }

  // Conectar (J): divide uma face entre dois vértices selecionados dela.
  connect(v1, v2) {
    const fi = this.faces.findIndex((f) => f.includes(v1) && f.includes(v2)); if (fi < 0) return false;
    const f = this.faces[fi]; const i = f.indexOf(v1), j = f.indexOf(v2);
    if (Math.abs(i - j) === 1 || Math.abs(i - j) === f.length - 1) return false; // já são vizinhos
    const [lo, hi] = i < j ? [i, j] : [j, i];
    this.faces[fi] = f.slice(lo, hi + 1); this.addFace([...f.slice(hi), ...f.slice(0, lo + 1)]);
    return true;
  }

  fill(sel) {
    const vs = [...sel]; if (vs.length < 3) return;
    const c = new THREE.Vector3(); vs.forEach((v) => c.add(this.verts[v])); c.divideScalar(vs.length);
    // plano médio pelos 3 primeiros + ordena pelo ângulo
    const n = new THREE.Vector3().subVectors(this.verts[vs[1]], this.verts[vs[0]]).cross(new THREE.Vector3().subVectors(this.verts[vs[2]], this.verts[vs[0]])).normalize();
    const u = new THREE.Vector3().subVectors(this.verts[vs[0]], c).normalize(); const w = n.clone().cross(u);
    vs.sort((p, q) => { const a = this.verts[p].clone().sub(c), b = this.verts[q].clone().sub(c); return Math.atan2(a.dot(w), a.dot(u)) - Math.atan2(b.dot(w), b.dot(u)); });
    this.addFace(vs);
  }

  deleteFaces(sel) { this.faces = this.faces.filter((_, i) => !sel.has(i)); this.uvs = this.uvs.filter((_, i) => !sel.has(i)); this.compact(); }
  deleteVerts(sel) { const keep = this.faces.map((f) => !f.some((v) => sel.has(v))); this.faces = this.faces.filter((_, i) => keep[i]); this.uvs = this.uvs.filter((_, i) => keep[i]); this.compact(); }
  flipFaces(sel) { for (const fi of sel) { this.faces[fi].reverse(); this.uvs[fi]?.reverse(); } }
  subdivideFaces(sel) { // quad → 4 quads (corte em cruz)
    const mids = new Map(); const mid = (a, b) => { const k = ek(a, b); if (!mids.has(k)) mids.set(k, this.addVert(this.verts[a].clone().lerp(this.verts[b], 0.5))); return mids.get(k); };
    for (const fi of [...sel]) {
      const f = this.faces[fi]; const c = this.addVert(this.faceCenter(fi)); const m = f.map((v, i) => mid(v, f[(i + 1) % f.length]));
      this.faces[fi] = [f[0], m[0], c, m[f.length - 1]];
      for (let i = 1; i < f.length; i++) this.addFace([f[i], m[i], c, m[i - 1]]);
    }
    // Vizinhos recebem os pontos médios nas arestas (sem buracos)
    this.faces.forEach((f) => { for (let i = 0; i < f.length; i++) { const k = ek(f[i], f[(i + 1) % f.length]); if (mids.has(k) && !f.includes(mids.get(k))) { f.splice(i + 1, 0, mids.get(k)); i++; } } });
  }
  _dropDegenerate() { const keep = this.faces.map((f) => new Set(f).size >= 3); this.faces = this.faces.filter((_, i) => keep[i]); this.uvs = this.uvs.filter((_, i) => keep[i]); }

  // Loop de arestas: segue em frente por vértices de valência 4.
  edgeLoop(a, b) {
    const loop = [ek(a, b)]; const vf = this.vertFaces(); const ef = this.edgeFaces();
    const step = (from, to) => {
      for (let g = 0; g < 5000; g++) {
        if (vf[to].length !== 4) return;
        const facesOfEdge = new Set(ef.get(ek(from, to)));
        // próximo: aresta de "to" que não compartilha face com a atual
        const cand = new Set(); vf[to].forEach((fi) => { const f = this.faces[fi]; const i = f.indexOf(to); cand.add(f[(i + 1) % f.length]); cand.add(f[(i - 1 + f.length) % f.length]); });
        const next = [...cand].find((n) => n !== from && !(ef.get(ek(to, n)) || []).some((fi) => facesOfEdge.has(fi)));
        if (next === undefined || loop.includes(ek(to, next))) return;
        loop.push(ek(to, next)); from = to; to = next;
      }
    };
    step(a, b); step(b, a);
    return loop;
  }
}
