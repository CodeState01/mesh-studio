// Animação e rigging extra (como no Blender):
//   • Restrições (constraints): Olhar para (Track To), Copiar posição/rotação, Seguir caminho (curva),
//     Manter distância, Chão (não atravessa y=0) — avaliadas a cada quadro, sem keyframes.
//   • IK (cinemática inversa) por CCD: arraste o alvo e a cadeia de ossos acompanha.
//   • Shape keys (morph targets): capture formas esculpidas e misture com controles deslizantes.
import * as THREE from 'three';
import { state, bus, nextId, select } from '../core/state.js';
import { content, findTarget } from '../core/objects.js';
import { frameHooks, gizmo } from '../core/viewport.js';
import { history } from '../core/history.js';
import { splineOf, curveOf } from './curves.js';
import { toast } from '../ui/toast.js';

export const CONSTRAINTS = {
  track: { label: 'Olhar para', icon: 'Eye', params: { target: '', up: 'y' } },
  copyloc: { label: 'Copiar posição', icon: 'Move', params: { target: '', offsetX: 0, offsetY: 0, offsetZ: 0, influence: 1 } },
  copyrot: { label: 'Copiar rotação', icon: 'RotateCw', params: { target: '', influence: 1 } },
  follow: { label: 'Seguir caminho', icon: 'Spline', params: { target: '', speed: 1, offset: 0, align: 1 } },
  limitdist: { label: 'Manter distância', icon: 'Ruler', params: { target: '', distance: 2 } },
  floor: { label: 'Chão (não atravessa)', icon: 'Minus', params: { height: 0 } },
};

export function addConstraint(obj = state.selected, type = 'track', params = {}) {
  if (!obj) { toast('Selecione um objeto'); return null; }
  const c = { type, enabled: true, params: { ...CONSTRAINTS[type].params, ...params } };
  const list = (obj.userData.constraints ||= []); list.push(c); bus.emit('constraints', obj);
  history.push({ label: 'Restrição', undo: () => { list.splice(list.indexOf(c), 1); bus.emit('constraints', obj); }, redo: () => { list.push(c); bus.emit('constraints', obj); } });
  return { target: obj.name, constraint: type };
}
export function removeConstraint(obj, i) { const list = obj.userData.constraints; const [c] = list.splice(i, 1); bus.emit('constraints', obj); history.push({ label: 'Remover restrição', undo: () => { list.splice(i, 0, c); bus.emit('constraints', obj); }, redo: () => { list.splice(i, 1); bus.emit('constraints', obj); } }); }

const tmp = new THREE.Vector3(), tq = new THREE.Quaternion(), tm = new THREE.Matrix4();
function evaluateConstraints() {
  if (gizmo.dragging) return;
  content.traverse((o) => {
    const list = o.userData.constraints; if (!list?.length) return;
    for (const c of list) {
      if (c.enabled === false) continue; const p = c.params; const t = p.target ? findTarget(p.target) : null; if (t === o) continue;
      switch (c.type) {
        case 'track': if (t) { t.getWorldPosition(tmp); if (o.parent) o.parent.updateMatrixWorld(); const wp = o.getWorldPosition(new THREE.Vector3()); tm.lookAt(o.isCamera || o.isLight ? wp : tmp, o.isCamera || o.isLight ? tmp : wp, new THREE.Vector3(0, 1, 0)); o.quaternion.setFromRotationMatrix(tm); if (o.parent && o.parent !== content) o.quaternion.premultiply(o.parent.getWorldQuaternion(tq).invert()); } break;
        case 'copyloc': if (t) { t.getWorldPosition(tmp).add(new THREE.Vector3(p.offsetX, p.offsetY, p.offsetZ)); o.parent?.worldToLocal(tmp); o.position.lerp(tmp, p.influence); } break;
        case 'copyrot': if (t) { t.getWorldQuaternion(tq); o.quaternion.slerp(tq, p.influence); } break;
        case 'follow': if (t && curveOf(t)) { const sp = splineOf(t); t.updateMatrixWorld(); const u = ((((state.time / (state.duration || 1)) * p.speed + p.offset) % 1) + 1) % 1; const pt = sp.getPointAt(u).applyMatrix4(t.matrixWorld); o.parent?.worldToLocal(pt); o.position.copy(pt); if (p.align) { const tan = sp.getTangentAt(u).transformDirection(t.matrixWorld); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan); } } break;
        case 'limitdist': if (t) { const tp = t.getWorldPosition(new THREE.Vector3()); const wp = o.getWorldPosition(new THREE.Vector3()); const d = wp.sub(tp); if (d.length() > 1e-6) { const np = tp.add(d.setLength(p.distance)); o.parent?.worldToLocal(np); o.position.copy(np); } } break;
        case 'floor': { const box = new THREE.Box3().setFromObject(o); if (box.min.y < p.height) o.position.y += p.height - box.min.y; break; }
      }
    }
  });
}

// ---------- IK por CCD (Cyclic Coordinate Descent) ----------
// O alvo é um objeto comum (uma esfera pequena); a cadeia vai da raiz ao osso da ponta.
export function addIK(sk = state.selected) {
  const mesh = sk?.isSkinnedMesh ? sk : sk?.isBone ? (() => { let p = sk; while (p && !p.isSkinnedMesh) p = p.parent; return p; })() : null;
  if (!mesh) { toast('Selecione uma malha com esqueleto (Rig › Auto-rig)'); return null; }
  const bones = mesh.skeleton.bones; const tip = bones[bones.length - 1]; mesh.updateMatrixWorld(true);
  const tipEnd = new THREE.Vector3(0, tip.userData.length || 0.3, 0); const child = tip.children.find((c) => c.isBone); if (child) tipEnd.copy(child.position);
  const target = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffcc33', depthTest: false })); target.renderOrder = 998;
  target.name = 'Alvo IK'; target.userData = { id: nextId('ik'), kind: 'empty' }; target.position.copy(tip.localToWorld(tipEnd.clone()));
  content.add(target); mesh.userData.ik = { target: target.userData.id, iterations: 10 }; bus.emit('scene:changed'); select(target);
  history.push({ label: 'IK', undo: () => { content.remove(target); delete mesh.userData.ik; bus.emit('scene:changed'); }, redo: () => { content.add(target); mesh.userData.ik = { target: target.userData.id, iterations: 10 }; bus.emit('scene:changed'); } });
  toast('IK criado — mova o alvo amarelo (G) e a cadeia acompanha');
  return { target: target.name, chain: bones.length };
}
function solveIK() {
  content.traverse((m) => {
    if (!m.isSkinnedMesh || !m.userData.ik) return; const tgt = findTarget(m.userData.ik.target); if (!tgt) return;
    const bones = m.skeleton.bones; const tip = bones[bones.length - 1]; const goal = tgt.getWorldPosition(new THREE.Vector3());
    const endLocal = new THREE.Vector3(0, tip.userData.length || 0.3, 0);
    for (let it = 0; it < (m.userData.ik.iterations || 10); it++) {
      for (let i = bones.length - 1; i >= 0; i--) {
        const b = bones[i]; b.updateMatrixWorld(true);
        const end = tip.localToWorld(endLocal.clone()); const bp = b.getWorldPosition(new THREE.Vector3());
        const toEnd = end.sub(bp).normalize(), toGoal = goal.clone().sub(bp).normalize(); const ang = Math.acos(Math.min(1, Math.max(-1, toEnd.dot(toGoal)))); if (ang < 1e-4) continue;
        const axisW = toEnd.clone().cross(toGoal).normalize(); const wq = b.getWorldQuaternion(new THREE.Quaternion());
        const axisL = axisW.applyQuaternion(wq.clone().invert()); b.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axisL, Math.min(ang, 0.5)));
      }
      if (tip.localToWorld(endLocal.clone()).distanceTo(goal) < 1e-3) break;
    }
  });
}

// ---------- Shape keys ----------
// 1ª captura define a "Base"; depois esculpa/deforme e capture de novo: a diferença vira uma shape key.
export function captureShapeKey(mesh = state.selected, name) {
  if (!mesh?.isMesh) { toast('Selecione uma malha'); return null; }
  const geo = mesh.geometry; const pos = geo.attributes.position;
  if (!mesh.userData.shapeBasis) { mesh.userData.shapeBasis = Array.from(pos.array); mesh.userData.shapeKeys = []; toast('Base salva. Agora esculpa ou deforme a malha e capture de novo.'); bus.emit('shapekeys', mesh); return { basis: true }; }
  const basis = mesh.userData.shapeBasis; if (basis.length !== pos.array.length) { toast('A malha mudou de topologia — remova as shape keys e recomece', { kind: 'error' }); return null; }
  const delta = Array.from(pos.array, (v, i) => +(v - basis[i]).toFixed(5));
  mesh.userData.shapeKeys.push({ name: name || `Forma ${mesh.userData.shapeKeys.length + 1}`, delta, value: 0 });
  pos.array.set(basis); pos.needsUpdate = true; applyShapeKeys(mesh); bus.emit('shapekeys', mesh);
  return { keys: mesh.userData.shapeKeys.length };
}
export function applyShapeKeys(mesh) {
  const keys = mesh.userData.shapeKeys || []; const geo = mesh.geometry;
  geo.morphAttributes.position = keys.map((k) => new THREE.Float32BufferAttribute(k.delta, 3)); geo.morphTargetsRelative = true;
  mesh.updateMorphTargets(); keys.forEach((k, i) => (mesh.morphTargetInfluences[i] = k.value)); geo.computeVertexNormals();
}
export function setShapeKey(mesh, i, v) { mesh.userData.shapeKeys[i].value = v; if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[i] = v; }
export function clearShapeKeys(mesh) { delete mesh.userData.shapeBasis; delete mesh.userData.shapeKeys; mesh.geometry.morphAttributes = {}; mesh.updateMorphTargets(); bus.emit('shapekeys', mesh); }
export function rehydrateAnimX(root = content) { root.traverse((o) => { if (o.isMesh && o.userData.shapeKeys?.length) applyShapeKeys(o); }); }

export function initAnimX() { frameHooks.add(() => { evaluateConstraints(); solveIK(); }); }
