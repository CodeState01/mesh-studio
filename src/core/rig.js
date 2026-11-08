// Rigging: esqueleto (cadeia de ossos), pesos automáticos e modo Pose.
import * as THREE from 'three';
import { state, bus, select, nextId } from './state.js';
import { content } from './objects.js';
import { gizmo, setTool, pickAt } from './viewport.js';
import { history } from './history.js';
import { toast } from '../ui/toast.js';

// Cria uma cadeia de N ossos ao longo do maior eixo da malha e "pele" (skin) com pesos automáticos.
export function autoRig(mesh = state.selected, count = 4) {
  if (!mesh?.isMesh || mesh.isSkinnedMesh) { toast('Selecione uma malha (ainda sem esqueleto)'); return; }
  const g = mesh.geometry.clone(); g.computeBoundingBox(); const bb = g.boundingBox; const size = bb.getSize(new THREE.Vector3());
  const ax = size.x > size.y && size.x > size.z ? 'x' : size.y > size.z ? 'y' : 'z';
  const start = bb.getCenter(new THREE.Vector3()); start[ax] = bb.min[ax];
  const len = size[ax] / count;

  const bones = []; let parent = null;
  for (let i = 0; i < count; i++) {
    const b = new THREE.Bone(); b.name = `Osso.${String(i + 1).padStart(2, '0')}`;
    b.userData = { id: nextId('bone'), kind: 'bone', length: len };
    if (parent) { b.position[ax] = len; parent.add(b); } else b.position.copy(start);
    bones.push(b); parent = b;
  }
  // Pesos: cada vértice recebe os 2 ossos mais próximos (distância ao segmento, inverso do quadrado)
  const pos = g.attributes.position; const skinIndex = [], skinWeight = [];
  const root = bones[0]; root.updateMatrixWorld(true);
  const segs = bones.map((b) => { const a = b.getWorldPosition(new THREE.Vector3()); const e = a.clone(); e[ax] += len; return new THREE.Line3(a, e); });
  const v = new THREE.Vector3(), cp = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = segs.map((s, k) => [k, s.closestPointToPoint(v, true, cp).distanceTo(v)]).sort((p, q) => p[1] - q[1]);
    const w0 = 1 / Math.max(1e-4, d[0][1]) ** 2, w1 = d[1] ? 1 / Math.max(1e-4, d[1][1]) ** 2 : 0, s = w0 + w1;
    skinIndex.push(d[0][0], d[1]?.[0] ?? 0, 0, 0); skinWeight.push(w0 / s, w1 / s, 0, 0);
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));

  const sk = new THREE.SkinnedMesh(g, mesh.material);
  sk.name = mesh.name; sk.userData = { ...mesh.userData, kind: 'rigged' }; sk.castShadow = sk.receiveShadow = true;
  sk.position.copy(mesh.position); sk.quaternion.copy(mesh.quaternion); sk.scale.copy(mesh.scale);
  sk.add(root); sk.bind(new THREE.Skeleton(bones));
  bones.forEach((b) => b.add(boneProxy(len)));
  const parentObj = mesh.parent; parentObj.remove(mesh); parentObj.add(sk);
  history.push({ label: 'Auto-rig', undo: () => { parentObj.remove(sk); parentObj.add(mesh); select(mesh); bus.emit('scene:changed'); }, redo: () => { parentObj.remove(mesh); parentObj.add(sk); select(sk); bus.emit('scene:changed'); } });
  bus.emit('scene:changed'); select(sk);
  toast(`Esqueleto com ${count} ossos criado — entre no modo Pose para animar`);
  return sk;
}

// Osso visível (octaedro alongado) só no modo Pose
function boneProxy(len) {
  const geo = new THREE.OctahedronGeometry(len * 0.12, 0); geo.scale(1, 4, 1); geo.translate(0, len * 0.5, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#9fb4ff', wireframe: true, depthTest: false, transparent: true }));
  m.userData.boneProxy = true; m.userData.proxy = true; m.renderOrder = 997; m.visible = false; return m;
}
// Alinha o proxy ao eixo do osso (os ossos usam o eixo de maior dimensão)
function alignProxies(sk) {
  sk.skeleton?.bones.forEach((b) => {
    const p = b.children.find((c) => c.userData.boneProxy); const child = b.children.find((c) => c.isBone);
    if (!p || !child) return; p.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), child.position.clone().normalize());
  });
}

let rigged = null;
export function togglePose() {
  if (state.mode === 'pose') return exitPose();
  const sk = state.selected?.isSkinnedMesh ? state.selected : state.selected?.isBone ? findSkinned(state.selected) : null;
  if (!sk) { toast('Selecione um objeto com esqueleto (Rig › Auto-rig)'); return; }
  rigged = sk; state.mode = 'pose'; alignProxies(sk);
  sk.traverse((o) => { if (o.userData.boneProxy) o.visible = true; });
  setTool('rotate'); select(sk.skeleton.bones[0]); gizmo.attach(sk.skeleton.bones[0]);
  bus.emit('mode', 'pose');
}
function exitPose() {
  rigged?.traverse((o) => { if (o.userData.boneProxy) o.visible = false; });
  state.mode = 'object'; const sk = rigged; rigged = null; select(sk); bus.emit('mode', 'object');
}
function findSkinned(o) { while (o && !o.isSkinnedMesh) o = o.parent; return o; }

bus.on('pose:click', (e) => {
  if (!rigged) return;
  const hit = pickAt(e.clientX, e.clientY, [rigged]).find((h) => h.object.userData.boneProxy);
  if (hit) { const bone = hit.object.parent; select(bone); gizmo.attach(bone); }
});

export function resetPose() {
  if (!rigged) return; rigged.skeleton.pose(); bus.emit('object:transformed', state.selected);
}
