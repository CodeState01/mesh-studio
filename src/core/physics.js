// Física: corpos rígidos (cannon-es) com simulação ao vivo e "assar" em keyframes;
// tecido (cloth) por Verlet com pinos, colisão com chão e esferas.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { state, bus } from './state.js';
import { content } from './objects.js';
import { frameHooks } from './viewport.js';
import { insertKey } from '../anim/timeline.js';
import { EditMesh } from './editmesh.js';
import { toast } from '../ui/toast.js';

export const physics = { running: false, gravity: -9.82, ground: true };
export const SHAPES = [['box', 'Caixa'], ['sphere', 'Esfera'], ['cylinder', 'Cilindro']];
export const getPhys = (o) => (o.userData.physics ||= { type: 'none', mass: 1, shape: 'box', friction: 0.4, restitution: 0.2 });

let world = null, links = [], saved = [];
function build() {
  world = new CANNON.World({ gravity: new CANNON.Vec3(0, physics.gravity, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world); world.allowSleep = true;
  if (physics.ground) { const g = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() }); g.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(g); }
  links = []; saved = [];
  for (const o of content.children) {
    const p = o.userData.physics; if (!p || p.type === 'none' || !o.isMesh && !o.isGroup) continue;
    const box = new THREE.Box3().setFromObject(o); const size = box.getSize(new THREE.Vector3()); const center = box.getCenter(new THREE.Vector3());
    let shape;
    if (p.shape === 'sphere') shape = new CANNON.Sphere(Math.max(size.x, size.y, size.z) / 2);
    else if (p.shape === 'cylinder') shape = new CANNON.Cylinder(Math.max(size.x, size.z) / 2, Math.max(size.x, size.z) / 2, size.y, 16);
    else shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
    const body = new CANNON.Body({ mass: p.type === 'static' ? 0 : p.mass, material: new CANNON.Material({ friction: p.friction, restitution: p.restitution }) });
    const offset = center.clone().sub(o.position); // centro da caixa vs. origem do objeto
    body.addShape(shape); body.position.set(center.x, center.y, center.z);
    body.quaternion.set(o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w);
    world.addBody(body); links.push({ o, body, offset }); saved.push([o, o.position.clone(), o.quaternion.clone()]);
  }
  // contato padrão com restituição do par
  world.defaultContactMaterial.restitution = 0.2;
}
function syncBack() { for (const { o, body, offset } of links) { o.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w); o.position.set(body.position.x, body.position.y, body.position.z).sub(offset); } }

export function startSim() {
  build(); if (!links.length) { toast('Nenhum objeto com física. Em Física, marque um objeto como Dinâmico.'); return; }
  physics.running = true; bus.emit('physics', physics);
}
export function stopSim(reset = true) {
  physics.running = false; if (reset) saved.forEach(([o, p, q]) => { o.position.copy(p); o.quaternion.copy(q); });
  bus.emit('physics', physics); bus.emit('object:transformed', state.selected);
}
frameHooks.add((dt) => { if (physics.running && world) { world.step(1 / 60, dt, 4); syncBack(); } });

// "Assar": simula offline e grava keyframes a cada 2 quadros — a animação passa a tocar sem física.
export function bake(seconds = state.duration, fps = state.fps) {
  build(); if (!links.length) { toast('Nenhum objeto com física'); return; }
  const every = 2; let frame = 0;
  for (let t = 0; t <= seconds + 1e-6; t += 1 / fps, frame++) {
    if (frame % every === 0) { syncBack(); for (const { o } of links) if (o.userData.physics.type === 'dynamic') insertKey(o, t, { position: o.position.toArray(), rotation: new THREE.Euler().setFromQuaternion(o.quaternion).toArray().slice(0, 3).map((r) => THREE.MathUtils.radToDeg(r)) }, 'linear', false); }
    world.step(1 / fps);
  }
  saved.forEach(([o, p, q]) => { o.position.copy(p); o.quaternion.copy(q); });
  if (seconds > state.duration) state.duration = Math.ceil(seconds);
  bus.emit('anim:changed'); toast(`Física assada em keyframes (${links.length} objetos, ${seconds}s)`);
}

// ---------- Tecido ----------
const cloths = new Set();
export function makeCloth(mesh = state.selected, opts = {}) {
  if (!mesh?.isMesh) { toast('Selecione uma malha (ex.: um Plano subdividido)'); return; }
  let em = mesh.__em || EditMesh.fromGeometry(mesh.geometry);
  if (em.verts.length < 50) { toast('Malha com poucos vértices: use Modificadores › Subdividir ou um Plano'); }
  em.toGeometry(); mesh.updateMatrixWorld(true);
  const P = em.verts.map((v) => v.clone().applyMatrix4(mesh.matrixWorld));
  const prev = P.map((p) => p.clone());
  const cons = []; const seen = new Set();
  const link = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (seen.has(k)) return; seen.add(k); cons.push([a, b, P[a].distanceTo(P[b])]); };
  em.faces.forEach((f) => { f.forEach((v, i) => link(v, f[(i + 1) % f.length])); if (f.length === 4) { link(f[0], f[2]); link(f[1], f[3]); } });
  const maxY = Math.max(...P.map((p) => p.y));
  const pins = new Set(opts.pins || P.map((p, i) => (Math.abs(p.y - maxY) < 1e-3 ? i : -1)).filter((i) => i >= 0));
  const geo = mesh.geometry; const corner = em.cornerVert || [];
  const inv = mesh.matrixWorld.clone().invert(); const local = new THREE.Vector3();
  const c = { mesh, em, P, prev, cons, pins, corner, inv, rest: P.map((p) => p.clone()) };
  mesh.userData.cloth = true; cloths.add(c);
  toast(`Tecido criado (${P.length} pontos, ${pins.size} presos). Dê Play para simular.`);
  void geo; void local; return c;
}
export function resetCloth() { for (const c of cloths) { c.P.forEach((p, i) => { p.copy(c.rest[i]); c.prev[i].copy(c.rest[i]); }); writeCloth(c); } }
export function removeCloth(mesh) { for (const c of cloths) if (c.mesh === mesh) { cloths.delete(c); mesh.userData.cloth = false; } }

function writeCloth(c) {
  const pos = c.mesh.geometry.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < c.corner.length; i++) { v.copy(c.P[c.corner[i]]).applyMatrix4(c.inv); pos.setXYZ(i, v.x, v.y, v.z); }
  pos.needsUpdate = true; c.mesh.geometry.computeVertexNormals(); c.mesh.geometry.computeBoundingSphere();
}
frameHooks.add((dt) => {
  if (!cloths.size || !(state.playing || physics.running)) return;
  const h = Math.min(dt, 1 / 30); const g = physics.gravity * h * h;
  const colliders = content.children.filter((o) => o.isMesh && !o.userData.cloth && o.visible && !o.userData.proxy)
    .map((o) => { o.geometry.computeBoundingSphere?.(); const s = o.geometry.boundingSphere?.clone().applyMatrix4(o.matrixWorld); return s; }).filter(Boolean);
  for (const c of cloths) {
    if (!c.mesh.parent) { cloths.delete(c); continue; }
    c.P.forEach((p, i) => { if (c.pins.has(i)) return; const v = p.clone().sub(c.prev[i]).multiplyScalar(0.99); c.prev[i].copy(p); p.add(v); p.y += g; });
    for (let it = 0; it < 10; it++) {
      for (const [a, b, rest] of c.cons) {
        const pa = c.P[a], pb = c.P[b]; const d = pb.clone().sub(pa); const len = d.length() || 1e-6; const diff = (len - rest) / len;
        const ia = c.pins.has(a) ? 0 : 0.5, ib = c.pins.has(b) ? 0 : 0.5; const s = ia + ib; if (!s) continue;
        // Corrige o comprimento dividindo o erro entre as pontas livres (ponta presa não se move)
        pa.addScaledVector(d, (diff * ia) / s); pb.addScaledVector(d, -(diff * ib) / s);
      }
      for (const p of c.P) {
        if (physics.ground && p.y < 0.005) p.y = 0.005;
        for (const s of colliders) { const d = p.clone().sub(s.center); const r = s.radius + 0.02; if (d.lengthSq() < r * r) p.copy(s.center).addScaledVector(d.normalize(), r); }
      }
    }
    writeCloth(c);
  }
});
