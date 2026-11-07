// Modo de Edição (Tab): seleciona e move vértices da malha.
// Vértices coincidentes (mesma posição, UVs/normais diferentes) são agrupados
// para que a malha não "rasgue" ao mover.
import * as THREE from 'three';
import { state, bus, select } from './state.js';
import { gizmo, pickAt } from './viewport.js';
import { history } from './history.js';

let mesh = null, points = null, groups = [], selected = new Set(), handle = null, before = null;

export function toggleEditMode() {
  if (state.mode === 'edit') exitEdit();
  else if (state.selected?.isMesh && !state.selected.userData.vfx) enterEdit(state.selected);
}

function enterEdit(m) {
  mesh = m; state.mode = 'edit';
  const pos = m.geometry.attributes.position; const key = new Map(); groups = [];
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    if (!key.has(k)) { key.set(k, groups.length); groups.push([]); }
    groups[key.get(k)].push(i);
  }
  const g = new THREE.BufferGeometry();
  const arr = new Float32Array(groups.length * 3), col = new Float32Array(groups.length * 3);
  groups.forEach((gr, i) => { arr.set([pos.getX(gr[0]), pos.getY(gr[0]), pos.getZ(gr[0])], i * 3); col.set([0.1, 0.1, 0.12], i * 3); });
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  points = new THREE.Points(g, new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true, depthTest: false }));
  points.renderOrder = 999; points.userData.editHelper = true;
  m.add(points);
  handle = new THREE.Object3D(); m.add(handle);
  gizmo.detach(); selected.clear();
  bus.emit('mode', 'edit');
}

export function exitEdit() {
  if (!mesh) return;
  mesh.remove(points); mesh.remove(handle); points.geometry.dispose();
  mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere(); mesh.geometry.computeBoundingBox();
  const m = mesh; mesh = null; points = null; state.mode = 'object';
  gizmo.detach(); select(m);
  bus.emit('mode', 'object');
}

function refreshColors() {
  const c = points.geometry.attributes.color;
  for (let i = 0; i < groups.length; i++) {
    const s = selected.has(i); c.setXYZ(i, s ? 1 : 0.1, s ? 0.48 : 0.1, s ? 0.27 : 0.12);
  }
  c.needsUpdate = true;
}

function placeHandle() {
  if (!selected.size) { gizmo.detach(); return; }
  const p = points.geometry.attributes.position; const c = new THREE.Vector3();
  selected.forEach((i) => c.add(new THREE.Vector3().fromBufferAttribute(p, i)));
  handle.position.copy(c.divideScalar(selected.size));
  gizmo.setMode('translate'); gizmo.attach(handle);
}

bus.on('edit:click', (e) => {
  if (!points) return;
  const hit = pickAt(e.clientX, e.clientY, [points])[0];
  if (!e.shiftKey) selected.clear();
  if (hit) { const i = hit.index; if (selected.has(i) && e.shiftKey) selected.delete(i); else selected.add(i); }
  refreshColors(); placeHandle();
});

export function selectAllVerts() { if (!points) return; if (selected.size === groups.length) selected.clear(); else groups.forEach((_, i) => selected.add(i)); refreshColors(); placeHandle(); }

let last = null;
// O gizmo é criado em initViewport(); por isso os ganchos são ligados depois.
export function bindEditGizmo() {
  gizmo.addEventListener('dragging-changed', (e) => {
    if (state.mode !== 'edit' || !mesh) return;
    if (e.value) { before = mesh.geometry.attributes.position.array.slice(); last = handle.position.clone(); }
    else if (before) {
      const geo = mesh.geometry, b = before, a = geo.attributes.position.array.slice(); before = null;
      const apply = (src) => { geo.attributes.position.array.set(src); geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); };
      history.push({ label: 'Mover vértices', undo: () => apply(b), redo: () => apply(a) });
    }
  });
  gizmo.addEventListener('objectChange', () => {
    if (state.mode !== 'edit' || !mesh || !last) return;
    const d = handle.position.clone().sub(last); last.copy(handle.position);
    const pos = mesh.geometry.attributes.position, pp = points.geometry.attributes.position;
    selected.forEach((gi) => {
      pp.setXYZ(gi, pp.getX(gi) + d.x, pp.getY(gi) + d.y, pp.getZ(gi) + d.z);
      for (const vi of groups[gi]) pos.setXYZ(vi, pos.getX(vi) + d.x, pos.getY(vi) + d.y, pos.getZ(vi) + d.z);
    });
    pos.needsUpdate = true; pp.needsUpdate = true; mesh.geometry.computeVertexNormals();
  });
}
