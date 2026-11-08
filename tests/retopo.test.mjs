// Testes dos modificadores de retopologia/deformação: remesh fecha a malha em quads, decimate reduz, etc.
import * as THREE from 'three';
import { EditMesh } from '../src/core/editmesh.js';
import { remesh, smooth, decimate, weld, triangulate, cast, bend, taper, shrinkwrap, MODIFIERS } from '../src/core/modstack.js';
let fails = 0; const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const ek = (a, b) => (a < b ? a + '_' + b : b + '_' + a);
const volume = (em) => { const p = em.toGeometry().attributes.position; let V = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); for (let i = 0; i < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2); V += a.dot(b.clone().cross(c)) / 6; } return V; };
const sphere = () => EditMesh.fromGeometry(new THREE.SphereGeometry(1, 24, 16));

const r = remesh(sphere(), 0.1);
ok(r.faces.length > 100 && r.faces.every((f) => f.length === 4), `remesh: só quads (${r.faces.length} faces)`);
const cnt = new Map(); r.faces.forEach((f) => f.forEach((a, i) => { const k = ek(a, f[(i + 1) % 4]); cnt.set(k, (cnt.get(k) || 0) + 1); }));
ok([...cnt.values()].every((x) => x === 2), 'remesh: malha fechada (toda aresta tem 2 faces)');
const V = volume(r); ok(V > 3.6 && V < 4.6, `remesh: volume ≈ esfera 4.19, com normais para fora (${V.toFixed(3)})`);

const d = decimate(sphere(), 0.3); ok(d.faces.length < sphere().faces.length * 0.6, `decimate 30%: ${d.faces.length} faces de ${sphere().faces.length}`);
const s = smooth(sphere(), 0.5, 5); ok(volume(s) < volume(sphere()), 'smooth encolhe (Laplaciano)');
ok(triangulate(sphere()).faces.every((f) => f.length === 3), 'triangulate: só triângulos');
const dup = EditMesh.fromGeometry(new THREE.BoxGeometry(1, 1, 1)); const before = dup.verts.length; dup.verts.push(dup.verts[0].clone()); dup.faces[0] = dup.faces[0].map((v) => (v === 0 ? before : v));
ok(weld(dup).verts.length === before, `weld junta vértices duplicados (${weld(dup).verts.length}/${before})`);
const box = EditMesh.fromGeometry(new THREE.BoxGeometry(1, 1, 1, 4, 4, 4)); const c = cast(box, 1); const rs = c.verts.map((v) => v.length());
ok(Math.max(...rs) - Math.min(...rs) < 1e-6, 'cast 100%: todos os vértices na mesma distância do centro');
const tall = EditMesh.fromGeometry(new THREE.BoxGeometry(0.2, 2, 0.2, 1, 10, 1)); const bb = new THREE.Box3(); bend(tall, 90).verts.forEach((v) => bb.expandByPoint(v));
ok(bb.max.x - bb.min.x > 0.8, `bend 90° curva a barra (largura X ${(bb.max.x - bb.min.x).toFixed(2)})`);
const tp = taper(tall, 1); const top = tp.verts.filter((v) => v.y > 0.99); ok(top.every((v) => Math.abs(v.x) < 1e-6), 'taper 100%: topo vira ponta');
const sw = shrinkwrap(EditMesh.fromGeometry(new THREE.BoxGeometry(3, 3, 3, 3, 3, 3)), new THREE.SphereGeometry(1, 48, 32), new THREE.Matrix4());
ok(sw.verts.every((v) => Math.abs(v.length() - 1) < 0.01), 'shrinkwrap: cubo grande cola na esfera de raio 1');
ok(Object.keys(MODIFIERS).length >= 15, `${Object.keys(MODIFIERS).length} modificadores no catálogo`);
console.log(fails ? `\n${fails} falha(s)` : '\nTodos os testes passaram'); process.exit(fails ? 1 : 0);
