// Testes da EditMesh: cada operação deve manter a malha fechada (manifold) e orientada.
// Rodar: node tests/editmesh.test.mjs
import * as THREE from 'three';
import { EditMesh } from '../src/core/editmesh.js';

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; };
const ek = (a, b) => (a < b ? a + '_' + b : b + '_' + a);

function manifold(em) {
  const count = new Map(), dir = new Map();
  for (const f of em.faces) f.forEach((a, i) => { const b = f[(i + 1) % f.length]; const k = ek(a, b); count.set(k, (count.get(k) || 0) + 1); dir.set(a + '>' + b, (dir.get(a + '>' + b) || 0) + 1); });
  const holes = [...count.values()].filter((c) => c !== 2).length;
  const flipped = [...dir.values()].filter((c) => c > 1).length; // aresta orientada repetida = face invertida
  return { holes, flipped };
}
function volume(em) { // volume assinado (positivo = normais para fora)
  const g = em.toGeometry(); const p = g.attributes.position; let v = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2); v += a.dot(b.clone().cross(c)) / 6; }
  return v;
}
const cube = () => EditMesh.fromGeometry(new THREE.BoxGeometry(1, 1, 1));
const check = (em, name, vol) => {
  const m = manifold(em); const V = volume(em);
  ok(m.holes === 0, `${name}: sem buracos (${m.holes})`);
  ok(m.flipped === 0, `${name}: orientação consistente (${m.flipped})`);
  if (vol !== undefined) ok(Math.abs(V - vol) < 1e-3, `${name}: volume ${V.toFixed(4)} ≈ ${vol}`); else ok(V > 0, `${name}: volume positivo ${V.toFixed(4)}`);
};

// Conversão
let em = cube();
ok(em.verts.length === 8, `cubo: 8 vértices (${em.verts.length})`);
ok(em.faces.length === 6 && em.faces.every((f) => f.length === 4), `cubo: 6 quads (${em.faces.length})`);
check(em, 'cubo', 1);

// Extrudar a face de cima +0.5 → volume 1.5
em = cube(); const top = em.faces.findIndex((_, i) => em.faceNormal(i).y > 0.9);
em.extrudeFaces(new Set([top]), 0.5);
ok(em.faces.length === 10, `extrudar: 10 faces (${em.faces.length})`); check(em, 'extrudar', 1.5);

// Inset não muda o volume
em = cube(); em.insetFaces(new Set([0]), 0.3); ok(em.faces.length === 10, `inset: 10 faces (${em.faces.length})`); check(em, 'inset', 1);

// Loop cut no cubo: anel de 4 quads → 10 faces, volume igual
em = cube(); const [a, b] = em.faces[0].slice(0, 2); const n = em.loopCut(a, b);
ok(n === 4, `loop cut: 4 arestas cortadas (${n})`); ok(em.faces.length === 10, `loop cut: 10 faces (${em.faces.length})`); check(em, 'loop cut', 1);

// Loop cut em malha subdividida (2x2x2)
em = EditMesh.fromGeometry(new THREE.BoxGeometry(1, 1, 1, 2, 2, 2)); const f0 = em.faces[0];
em.loopCut(f0[0], f0[1]); check(em, 'loop cut 2x2x2', 1);

// Bevel de uma aresta: chanfro remove um prisma de volume w²/2 * 1
em = cube(); const ef = em.edgeFaces(); const key = [...ef.keys()][0];
em.bevelEdges([key], 0.2); check(em, 'bevel 1 aresta', 1 - 0.2 * 0.2 / 2);

// Subdividir face
em = cube(); em.subdivideFaces(new Set([0])); check(em, 'subdividir face', 1);

// Merge de 2 vértices de uma aresta (vira prisma de base triangular? apenas valida orientação/manifold)
em = cube(); const [v1, v2] = em.faces[0].slice(0, 2); em.mergeVerts(new Set([v1, v2])); check(em, 'merge');

// Conectar (divide face em 2)
em = cube(); const f = em.faces[0]; ok(em.connect(f[0], f[2]), 'conectar diagonal'); ok(em.faces.length === 7, `conectar: 7 faces (${em.faces.length})`); check(em, 'conectar', 1);

// Loop de arestas na malha subdividida percorre o anel
em = EditMesh.fromGeometry(new THREE.BoxGeometry(1, 1, 1, 2, 2, 2));
const e0 = em.edges().find(([p, q]) => Math.abs(em.verts[p].y) < 1e-6 && Math.abs(em.verts[q].y) < 1e-6);
const loop = em.edgeLoop(...e0); ok(loop.length === 8, `edge loop: 8 arestas no anel do meio (${loop.length})`);

// Esfera (n-gons nos polos + quads) continua fechada
em = EditMesh.fromGeometry(new THREE.SphereGeometry(1, 16, 12)); check(em, 'esfera');

console.log(fails ? `\n${fails} falha(s)` : '\nTodos os testes passaram'); process.exit(fails ? 1 : 0);
