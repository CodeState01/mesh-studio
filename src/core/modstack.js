// Pilha de modificadores NÃO destrutiva (como no Blender): a malha base (EditMesh) nunca é alterada;
// cada modificador gera uma nova EditMesh a partir da anterior, e o resultado final vira a geometria exibida.
import * as THREE from 'three';
import { EditMesh } from './editmesh.js';
import { MeshBVH } from 'three-mesh-bvh';

// Contexto injetado pelo app (o núcleo não conhece a cena): resolve o alvo do Shrinkwrap.
export const modContext = { findMesh: (_name) => null };

const ek = (a, b) => (a < b ? a + '_' + b : b + '_' + a);

// ---------- Subdivision Surface (Catmull-Clark) ----------
export function catmullClark(src) {
  const em = new EditMesh(); em.smooth = true;
  const V = src.verts, F = src.faces;
  const facePt = F.map((f) => { const c = new THREE.Vector3(); f.forEach((v) => c.add(V[v])); return c.divideScalar(f.length); });
  const faceUV = F.map((f, fi) => { const u = [0, 0]; (src.uvs[fi] || []).forEach((x) => { u[0] += x[0]; u[1] += x[1]; }); return [u[0] / f.length, u[1] / f.length]; });
  const ef = src.edgeFaces();
  // Pontos de aresta
  const edgePt = new Map();
  for (const [k, fs] of ef) {
    const [a, b] = k.split('_').map(Number);
    const p = V[a].clone().add(V[b]);
    if (fs.length === 2) p.add(facePt[fs[0]]).add(facePt[fs[1]]).multiplyScalar(0.25); else p.multiplyScalar(0.5);
    edgePt.set(k, p);
  }
  // Novas posições dos vértices originais
  const vf = src.vertFaces(); const vEdges = V.map(() => []); const boundaryNb = V.map(() => []);
  for (const [k, fs] of ef) { const [a, b] = k.split('_').map(Number); vEdges[a].push(k); vEdges[b].push(k); if (fs.length === 1) { boundaryNb[a].push(b); boundaryNb[b].push(a); } }
  const newV = V.map((P, i) => {
    if (boundaryNb[i].length >= 2) return P.clone().multiplyScalar(6).add(V[boundaryNb[i][0]]).add(V[boundaryNb[i][1]]).multiplyScalar(1 / 8);
    const n = vf[i].length; if (!n) return P.clone();
    const Q = new THREE.Vector3(); vf[i].forEach((fi) => Q.add(facePt[fi])); Q.divideScalar(n);
    const Rm = new THREE.Vector3(); vEdges[i].forEach((k) => { const [a, b] = k.split('_').map(Number); Rm.add(V[a].clone().add(V[b]).multiplyScalar(0.5)); }); Rm.divideScalar(vEdges[i].length || 1);
    return Q.add(Rm.multiplyScalar(2)).add(P.clone().multiplyScalar(n - 3)).divideScalar(n);
  });
  // Monta a malha nova: vértices originais, depois pontos de aresta, depois pontos de face
  em.verts = newV;
  const eIdx = new Map(); for (const [k, p] of edgePt) { eIdx.set(k, em.verts.length); em.verts.push(p); }
  const fIdx = facePt.map((p) => { em.verts.push(p); return em.verts.length - 1; });
  F.forEach((f, fi) => {
    const uv = src.uvs[fi] || f.map(() => [0, 0]); const n = f.length;
    for (let i = 0; i < n; i++) {
      const prev = (i - 1 + n) % n, next = (i + 1) % n;
      const ePrev = ek(f[prev], f[i]), eNext = ek(f[i], f[next]);
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      em.faces.push([f[i], eIdx.get(eNext), fIdx[fi], eIdx.get(ePrev)]);
      em.uvs.push([uv[i], mid(uv[i], uv[next]), faceUV[fi], mid(uv[prev], uv[i])]);
    }
  });
  return em;
}

// ---------- Espelhar (com solda no plano) ----------
export function mirror(src, axis = 'x', merge = 0.001) {
  const k = 'xyz'.indexOf(axis); const em = src.clone(); const n = src.verts.length; const map = [];
  src.verts.forEach((v, i) => {
    if (Math.abs(v.getComponent(k)) <= merge) { map[i] = i; return; } // vértice no plano: reaproveita (solda)
    const m = v.clone(); m.setComponent(k, -m.getComponent(k)); map[i] = em.verts.length; em.verts.push(m);
  });
  src.faces.forEach((f, fi) => {
    const nf = f.map((v) => map[v]).reverse(); // espelhar inverte a orientação
    em.faces.push(nf); em.uvs.push((src.uvs[fi] || f.map(() => [0, 0])).slice().reverse());
  });
  void n; return em;
}

// ---------- Array ----------
export function array(src, count = 3, offset = [1.2, 0, 0]) {
  const em = new EditMesh(); em.smooth = src.smooth; const off = new THREE.Vector3(...offset);
  for (let c = 0; c < Math.max(1, count); c++) {
    const base = em.verts.length;
    src.verts.forEach((v) => em.verts.push(v.clone().addScaledVector(off, c)));
    src.faces.forEach((f, fi) => { em.faces.push(f.map((v) => v + base)); em.uvs.push((src.uvs[fi] || []).map((u) => u.slice())); });
  }
  return em;
}

// ---------- Solidificar (dá espessura) ----------
export function solidify(src, thickness = 0.05) {
  const em = src.clone(); const n = src.verts.length;
  // normal de cada vértice = média das normais das faces
  const vn = src.verts.map(() => new THREE.Vector3()); src.faces.forEach((f, fi) => { const fn = src.faceNormal(fi); f.forEach((v) => vn[v].add(fn)); });
  src.verts.forEach((v, i) => em.verts.push(v.clone().addScaledVector(vn[i].normalize(), -thickness)));
  src.faces.forEach((f, fi) => { em.faces.push(f.map((v) => v + n).reverse()); em.uvs.push((src.uvs[fi] || f.map(() => [0, 0])).slice().reverse()); });
  // bordas abertas ganham uma parede ligando a casca de fora com a de dentro
  for (const [k, fs] of src.edgeFaces()) {
    if (fs.length !== 1) continue; const f = src.faces[fs[0]]; const [p, q] = k.split('_').map(Number);
    const i = f.indexOf(p); const [a, b] = f[(i + 1) % f.length] === q ? [p, q] : [q, p];
    em.faces.push([b, a, a + n, b + n]); em.uvs.push([[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  return em;
}

// ---------- Deformadores (só mexem nas posições) ----------
function bounds(em) { const b = new THREE.Box3(); em.verts.forEach((v) => b.expandByPoint(v)); return b; }
export function twist(src, angle = 90, axis = 'y') {
  const em = src.clone(); const b = bounds(em); const k = 'xyz'.indexOf(axis); const [u, w] = [0, 1, 2].filter((i) => i !== k);
  const lo = b.min.getComponent(k), h = (b.max.getComponent(k) - lo) || 1;
  em.verts.forEach((v) => { const t = ((v.getComponent(k) - lo) / h) * THREE.MathUtils.degToRad(angle); const c = Math.cos(t), s = Math.sin(t); const x = v.getComponent(u), z = v.getComponent(w); v.setComponent(u, x * c - z * s); v.setComponent(w, x * s + z * c); });
  return em;
}
export function displace(src, strength = 0.1, scale = 2, seed = 1) {
  const em = src.clone(); const vn = em.verts.map(() => new THREE.Vector3()); em.faces.forEach((f, fi) => { const fn = em.faceNormal(fi); f.forEach((v) => vn[v].add(fn)); });
  const hash = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.1) * 43758.5453; return s - Math.floor(s); };
  const noise = (p) => { const q = p.clone().multiplyScalar(scale); const i = q.clone().floor(), f = q.clone().sub(i); let r = 0; for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) { const wgt = (dx ? f.x : 1 - f.x) * (dy ? f.y : 1 - f.y) * (dz ? f.z : 1 - f.z); r += wgt * hash(i.x + dx, i.y + dy, i.z + dz); } return r * 2 - 1; };
  em.verts.forEach((v, i) => v.addScaledVector(vn[i].normalize(), noise(v) * strength));
  return em;
}

// ---------- Retopologia e deformação extra ----------
function neighbors(em) { const nb = em.verts.map(() => new Set()); em.faces.forEach((f) => f.forEach((v, i) => { nb[v].add(f[(i + 1) % f.length]); nb[v].add(f[(i - 1 + f.length) % f.length]); })); return nb.map((x) => [...x]); }
export function smooth(src, factor = 0.5, iterations = 2) { // Laplaciano (como o "Smooth" do Blender)
  const em = src.clone(); const nb = neighbors(em);
  for (let it = 0; it < iterations; it++) { em.verts = em.verts.map((v, i) => { if (!nb[i].length) return v.clone(); const c = new THREE.Vector3(); nb[i].forEach((j) => c.add(em.verts[j])); return v.clone().lerp(c.divideScalar(nb[i].length), factor); }); }
  return em;
}
export function cast(src, factor = 0.5) { // aproxima a forma de uma esfera
  const em = src.clone(); const c = bounds(em).getCenter(new THREE.Vector3()); let r = 0; em.verts.forEach((v) => (r += v.distanceTo(c))); r /= em.verts.length || 1;
  em.verts.forEach((v) => { const d = v.clone().sub(c); const L = d.length(); if (L > 1e-9) v.lerp(c.clone().addScaledVector(d, r / L), factor); }); return em;
}
export function bend(src, angle = 45, axis = 'y') {
  const em = src.clone(); const b = bounds(em); const k = 'xyz'.indexOf(axis); const u = k === 0 ? 1 : 0; const a = THREE.MathUtils.degToRad(angle); if (Math.abs(a) < 1e-5) return em;
  const lo = b.min.getComponent(k), h = (b.max.getComponent(k) - lo) || 1; const R = h / a;
  em.verts.forEach((v) => { const t = ((v.getComponent(k) - lo) / h) * a; const x = v.getComponent(u); v.setComponent(u, R - (R - x) * Math.cos(t)); v.setComponent(k, lo + (R - x) * Math.sin(t)); }); return em;
}
export function taper(src, factor = 0.5, axis = 'y') {
  const em = src.clone(); const b = bounds(em); const k = 'xyz'.indexOf(axis); const lo = b.min.getComponent(k), h = (b.max.getComponent(k) - lo) || 1; const c = b.getCenter(new THREE.Vector3());
  em.verts.forEach((v) => { const s = 1 - factor * ((v.getComponent(k) - lo) / h); [0, 1, 2].filter((i) => i !== k).forEach((i) => v.setComponent(i, c.getComponent(i) + (v.getComponent(i) - c.getComponent(i)) * s)); }); return em;
}
export function triangulate(src) { const em = new EditMesh(); em.smooth = src.smooth; em.verts = src.verts.map((v) => v.clone()); src.faces.forEach((f, fi) => { const uv = src.uvs[fi] || f.map(() => [0, 0]); for (let i = 1; i < f.length - 1; i++) { em.faces.push([f[0], f[i], f[i + 1]]); em.uvs.push([uv[0], uv[i], uv[i + 1]]); } }); return em; }
export function weld(src, distance = 0.001) {
  const em = new EditMesh(); em.smooth = src.smooth; const map = []; const q = (x) => Math.round(x / distance); const seen = new Map();
  src.verts.forEach((v, i) => { const key = q(v.x) + ',' + q(v.y) + ',' + q(v.z); if (!seen.has(key)) { seen.set(key, em.verts.length); em.verts.push(v.clone()); } map[i] = seen.get(key); });
  src.faces.forEach((f, fi) => { const nf = [], nu = []; f.forEach((v, k) => { const m = map[v]; if (nf[nf.length - 1] !== m && nf[0] !== m) { nf.push(m); nu.push((src.uvs[fi] || [])[k] || [0, 0]); } }); if (nf.length >= 3) { em.faces.push(nf); em.uvs.push(nu); } });
  return em;
}
// Decimação síncrona por agrupamento de vértices: a superfície é dividida em células do tamanho
// necessário para sobrar ~ratio dos vértices; cada célula vira 1 vértice (média) e faces degeneradas somem.
export function decimate(src, ratio = 0.5) {
  ratio = Math.min(1, Math.max(0.02, ratio)); if (ratio >= 0.999) return src.clone();
  const tri = triangulate(src); let area = 0; const a = new THREE.Vector3(), b = new THREE.Vector3();
  tri.faces.forEach(([i, j, k]) => { area += a.subVectors(tri.verts[j], tri.verts[i]).cross(b.subVectors(tri.verts[k], tri.verts[i])).length() / 2; });
  const target = Math.max(8, src.verts.length * ratio); let cell = Math.sqrt(area / target) * 0.9;
  let out = null;
  for (let attempt = 0; attempt < 6; attempt++) { // ajusta a célula até chegar perto da meta
    const em = new EditMesh(); em.smooth = src.smooth; const cellOf = new Map(); const sum = []; const map = [];
    tri.verts.forEach((v, i) => { const key = Math.floor(v.x / cell) + ',' + Math.floor(v.y / cell) + ',' + Math.floor(v.z / cell); if (!cellOf.has(key)) { cellOf.set(key, sum.length); sum.push([new THREE.Vector3(), 0]); } const c = cellOf.get(key); sum[c][0].add(v); sum[c][1]++; map[i] = c; });
    em.verts = sum.map(([s, n]) => s.divideScalar(n));
    const seen = new Set();
    tri.faces.forEach((f, fi) => { const nf = f.map((v) => map[v]); if (nf[0] === nf[1] || nf[1] === nf[2] || nf[0] === nf[2]) return; const key = [...nf].sort((x, y) => x - y).join(','); if (seen.has(key)) return; seen.add(key); em.faces.push(nf); em.uvs.push(tri.uvs[fi]); });
    out = em; const r = em.verts.length / target; if (r > 0.8 && r < 1.25) break; cell *= Math.sqrt(r);
  }
  return out;
}
// Remesh por voxels → malha só de QUADS (Surface Nets): distância com sinal amostrada numa grade
// via BVH; cada célula cruzada pela superfície vira um vértice e cada aresta cruzada, um quad.
export function remesh(src, voxel = 0.05) {
  const g = triangulate(src).toGeometry(); const bvh = new MeshBVH(g); const b = bounds(src);
  const size = b.getSize(new THREE.Vector3()); const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const h = Math.max(voxel, maxDim / 96); // limite: ~96 voxels no maior eixo
  const o = b.min.clone().subScalar(h * 1.5); const n = [0, 1, 2].map((k) => Math.ceil(size.getComponent(k) / h) + 4);
  const at = (i, j, k) => i + n[0] * (j + n[1] * k);
  const sdf = new Float32Array(n[0] * n[1] * n[2]); const p = new THREE.Vector3(); const hit = {}; const tri = new THREE.Triangle(); const fn = new THREE.Vector3();
  const pos = g.attributes.position; const idx = g.index;
  for (let k = 0; k < n[2]; k++) for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
    p.set(o.x + i * h, o.y + j * h, o.z + k * h); bvh.closestPointToPoint(p, hit);
    const f = hit.faceIndex; const ia = idx ? idx.getX(f * 3) : f * 3, ib = idx ? idx.getX(f * 3 + 1) : f * 3 + 1, ic = idx ? idx.getX(f * 3 + 2) : f * 3 + 2;
    tri.setFromAttributeAndIndices(pos, ia, ib, ic).getNormal(fn);
    sdf[at(i, j, k)] = hit.distance * (p.clone().sub(hit.point).dot(fn) < 0 ? -1 : 1);
  }
  const em = new EditMesh(); em.smooth = true; const vid = new Int32Array(sdf.length).fill(-1);
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < n[2] - 1; k++) for (let j = 0; j < n[1] - 1; j++) for (let i = 0; i < n[0] - 1; i++) {
    const d = C.map(([a, bb, c]) => sdf[at(i + a, j + bb, k + c)]); let neg = 0; d.forEach((x) => x < 0 && neg++); if (neg === 0 || neg === 8) continue;
    const c = new THREE.Vector3(); let cnt = 0;
    E.forEach(([e0, e1]) => { if ((d[e0] < 0) === (d[e1] < 0)) return; const t = d[e0] / (d[e0] - d[e1]); const A = C[e0], B = C[e1]; c.x += A[0] + (B[0] - A[0]) * t; c.y += A[1] + (B[1] - A[1]) * t; c.z += A[2] + (B[2] - A[2]) * t; cnt++; });
    c.divideScalar(cnt).add(new THREE.Vector3(i, j, k)).multiplyScalar(h).add(o); vid[at(i, j, k)] = em.verts.length; em.verts.push(c);
  }
  // Cada aresta da grade cruzada pela superfície liga as 4 células ao redor num quad
  const quad = (a, b2, c, d, flip) => { if (a < 0 || b2 < 0 || c < 0 || d < 0) return; em.faces.push(flip ? [a, b2, c, d] : [a, d, c, b2]); em.uvs.push([[0, 0], [1, 0], [1, 1], [0, 1]]); };
  for (let k = 1; k < n[2] - 1; k++) for (let j = 1; j < n[1] - 1; j++) for (let i = 1; i < n[0] - 1; i++) {
    const s0 = sdf[at(i, j, k)] < 0;
    if (s0 !== (sdf[at(i + 1, j, k)] < 0)) quad(vid[at(i, j - 1, k - 1)], vid[at(i, j, k - 1)], vid[at(i, j, k)], vid[at(i, j - 1, k)], s0);
    if (s0 !== (sdf[at(i, j + 1, k)] < 0)) quad(vid[at(i - 1, j, k - 1)], vid[at(i - 1, j, k)], vid[at(i, j, k)], vid[at(i, j, k - 1)], s0);
    if (s0 !== (sdf[at(i, j, k + 1)] < 0)) quad(vid[at(i - 1, j - 1, k)], vid[at(i, j - 1, k)], vid[at(i, j, k)], vid[at(i - 1, j, k)], s0);
  }
  return em;
}
// Shrinkwrap: projeta cada vértice no ponto mais próximo da superfície de outro objeto
export function shrinkwrap(src, targetGeo, targetToLocal, offset = 0) {
  if (!targetGeo) return src; const em = src.clone(); const bvh = new MeshBVH(targetGeo.clone()); const hit = {};
  const inv = targetToLocal.clone().invert(); const p = new THREE.Vector3();
  em.verts.forEach((v, i) => { p.copy(v).applyMatrix4(inv); bvh.closestPointToPoint(p, hit); const q = hit.point.clone().applyMatrix4(targetToLocal); const dir = v.clone().sub(q); const L = dir.length(); em.verts[i] = L > 1e-9 && offset ? q.addScaledVector(dir, offset / L) : q; });
  return em;
}

// ---------- Catálogo + avaliação da pilha ----------
export const MODIFIERS = {
  subsurf: { label: 'Subdivisão (suave)', icon: 'Grid3x3', params: { levels: [1, 1, 4, 1] }, run: (em, p) => { let r = em; for (let i = 0; i < p.levels; i++) r = catmullClark(r); return r; } },
  mirror: { label: 'Espelhar', icon: 'FlipHorizontal2', params: { axis: ['x', ['x', 'y', 'z']] }, run: (em, p) => mirror(em, p.axis) },
  array: { label: 'Array', icon: 'Copy', params: { count: [3, 1, 100, 1], offsetX: [1.2, -50, 50, 0.01], offsetY: [0, -50, 50, 0.01], offsetZ: [0, -50, 50, 0.01] }, run: (em, p) => array(em, p.count, [p.offsetX, p.offsetY, p.offsetZ]) },
  solidify: { label: 'Solidificar', icon: 'Layers', params: { thickness: [0.05, -2, 2, 0.005] }, run: (em, p) => solidify(em, p.thickness) },
  twist: { label: 'Torcer', icon: 'RotateCw', params: { angle: [90, -720, 720, 1], axis: ['y', ['x', 'y', 'z']] }, run: (em, p) => twist(em, p.angle, p.axis) },
  smooth: { label: 'Suavizar', icon: 'Waves', params: { factor: [0.5, 0, 1, 0.01], iterations: [2, 1, 50, 1] }, run: (em, p) => smooth(em, p.factor, p.iterations) },
  cast: { label: 'Moldar em esfera', icon: 'Globe2', params: { factor: [0.5, -1, 1, 0.01] }, run: (em, p) => cast(em, p.factor) },
  bend: { label: 'Dobrar', icon: 'Spline', params: { angle: [45, -360, 360, 1], axis: ['y', ['x', 'y', 'z']] }, run: (em, p) => bend(em, p.angle, p.axis) },
  taper: { label: 'Afunilar', icon: 'Triangle', params: { factor: [0.5, -2, 1, 0.01], axis: ['y', ['x', 'y', 'z']] }, run: (em, p) => taper(em, p.factor, p.axis) },
  decimate: { label: 'Decimar (reduzir)', icon: 'Minimize2', params: { ratio: [0.5, 0.02, 1, 0.01] }, run: (em, p) => decimate(em, p.ratio) },
  remesh: { label: 'Remesh voxel (quads)', icon: 'Box', params: { voxel: [0.05, 0.005, 1, 0.005] }, run: (em, p) => remesh(em, p.voxel) },
  shrinkwrap: { label: 'Shrinkwrap (encolher sobre)', icon: 'Magnet', params: { target: ['', 'object'], offset: [0, -1, 1, 0.001] }, run: (em, p) => { const t = modContext.findMesh(p.target); return t ? shrinkwrap(em, t.geometry, t.toLocal, p.offset) : em; } },
  triangulate: { label: 'Triangular', icon: 'Triangle', params: {}, run: (em) => triangulate(em) },
  weld: { label: 'Soldar vértices', icon: 'Merge', params: { distance: [0.001, 0.00001, 1, 0.0005] }, run: (em, p) => weld(em, p.distance) },
  displace: { label: 'Deslocar (ruído)', icon: 'Mountain', params: { strength: [0.1, -2, 2, 0.01], scale: [2, 0.1, 20, 0.1], seed: [1, 0, 999, 1] }, run: (em, p) => displace(em, p.strength, p.scale, p.seed) },
};
export const defaultParams = (type) => Object.fromEntries(Object.entries(MODIFIERS[type].params).map(([k, v]) => [k, v[0]]));

export function evaluate(base, stack = []) {
  let em = base;
  for (const m of stack) if (m.enabled !== false && MODIFIERS[m.type]) em = MODIFIERS[m.type].run(em, m.params);
  return em;
}
