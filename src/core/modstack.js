// Pilha de modificadores NÃO destrutiva (como no Blender): a malha base (EditMesh) nunca é alterada;
// cada modificador gera uma nova EditMesh a partir da anterior, e o resultado final vira a geometria exibida.
import * as THREE from 'three';
import { EditMesh } from './editmesh.js';

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

// ---------- Catálogo + avaliação da pilha ----------
export const MODIFIERS = {
  subsurf: { label: 'Subdivisão (suave)', icon: 'Grid3x3', params: { levels: [1, 1, 4, 1] }, run: (em, p) => { let r = em; for (let i = 0; i < p.levels; i++) r = catmullClark(r); return r; } },
  mirror: { label: 'Espelhar', icon: 'FlipHorizontal2', params: { axis: ['x', ['x', 'y', 'z']] }, run: (em, p) => mirror(em, p.axis) },
  array: { label: 'Array', icon: 'Copy', params: { count: [3, 1, 100, 1], offsetX: [1.2, -50, 50, 0.01], offsetY: [0, -50, 50, 0.01], offsetZ: [0, -50, 50, 0.01] }, run: (em, p) => array(em, p.count, [p.offsetX, p.offsetY, p.offsetZ]) },
  solidify: { label: 'Solidificar', icon: 'Layers', params: { thickness: [0.05, -2, 2, 0.005] }, run: (em, p) => solidify(em, p.thickness) },
  twist: { label: 'Torcer', icon: 'RotateCw', params: { angle: [90, -720, 720, 1], axis: ['y', ['x', 'y', 'z']] }, run: (em, p) => twist(em, p.angle, p.axis) },
  displace: { label: 'Deslocar (ruído)', icon: 'Mountain', params: { strength: [0.1, -2, 2, 0.01], scale: [2, 0.1, 20, 0.1], seed: [1, 0, 999, 1] }, run: (em, p) => displace(em, p.strength, p.scale, p.seed) },
};
export const defaultParams = (type) => Object.fromEntries(Object.entries(MODIFIERS[type].params).map(([k, v]) => [k, v[0]]));

export function evaluate(base, stack = []) {
  let em = base;
  for (const m of stack) if (m.enabled !== false && MODIFIERS[m.type]) em = MODIFIERS[m.type].run(em, m.params);
  return em;
}
