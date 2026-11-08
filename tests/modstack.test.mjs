// Testes da pilha de modificadores: resultado fechado, orientado e com volume esperado.
import * as THREE from 'three';
import { EditMesh } from '../src/core/editmesh.js';
import { catmullClark, mirror, array, solidify, twist, evaluate } from '../src/core/modstack.js';
let fails = 0; const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const ek = (a, b) => (a < b ? a + '_' + b : b + '_' + a);
function check(em, name) {
  const cnt = new Map(), dir = new Map();
  em.faces.forEach((f) => f.forEach((a, i) => { const b = f[(i + 1) % f.length]; cnt.set(ek(a, b), (cnt.get(ek(a, b)) || 0) + 1); dir.set(a + '>' + b, (dir.get(a + '>' + b) || 0) + 1); }));
  const holes = [...cnt.values()].filter((c) => c !== 2).length, flipped = [...dir.values()].filter((c) => c > 1).length;
  const g = em.toGeometry(); const p = g.attributes.position; let V = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2); V += a.dot(b.clone().cross(c)) / 6; }
  ok(holes === 0 && flipped === 0, `${name}: fechado e orientado (buracos ${holes}, invertidas ${flipped})`);
  return V;
}
const cube = () => EditMesh.fromGeometry(new THREE.BoxGeometry(1, 1, 1));
let em = catmullClark(cube()); ok(em.faces.length === 24, `subsurf 1: 24 quads (${em.faces.length})`);
let V = check(em, 'subsurf 1'); ok(V < 0.6 && V > 0.3, `subsurf encolhe o cubo (vol ${V.toFixed(3)})`);
// Valor analítico: canto de cubo (n=3) vai para (Q + 2R)/3 = 5/18 em cada eixo
const corner = em.verts.slice(0, 8).find((v) => v.x > 0 && v.y > 0 && v.z > 0); ok(corner && Math.abs(corner.x - 5 / 18) < 1e-9 && Math.abs(corner.y - 5 / 18) < 1e-9, `canto em 5/18 = 0.2778 (${corner?.x.toFixed(4)})`);
em = catmullClark(catmullClark(cube())); ok(em.faces.length === 96, `subsurf 2: 96 quads (${em.faces.length})`); check(em, 'subsurf 2');
// metade de cubo aberta em x=0 + espelho = cubo fechado
const half = EditMesh.fromGeometry(new THREE.BoxGeometry(0.5, 1, 1).translate(0.25, 0, 0));
half.deleteFaces(new Set([half.faces.findIndex((_, i) => half.faceNormal(i).x < -0.9)]));
em = mirror(half, 'x'); V = check(em, 'espelhar (soldado)'); ok(Math.abs(V - 1) < 1e-3, `espelhar: volume 1 (${V.toFixed(3)})`);
em = array(cube(), 3, [2, 0, 0]); V = check(em, 'array'); ok(Math.abs(V - 3) < 1e-3, `array: volume 3 (${V.toFixed(3)})`);
const plane = EditMesh.fromGeometry(new THREE.PlaneGeometry(1, 1, 2, 2));
em = solidify(plane, 0.1); V = check(em, 'solidificar plano'); ok(Math.abs(Math.abs(V) - 0.1) < 1e-3, `solidificar: volume 0.1 (${V.toFixed(3)})`);
em = twist(cube(), 45); check(em, 'torcer');
em = evaluate(cube(), [{ type: 'subsurf', params: { levels: 1 } }, { type: 'array', params: { count: 2, offsetX: 2, offsetY: 0, offsetZ: 0 } }]); check(em, 'pilha subsurf+array');
console.log(fails ? `\n${fails} falha(s)` : '\nTodos os testes passaram'); process.exit(fails ? 1 : 0);
