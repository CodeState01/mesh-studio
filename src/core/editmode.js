// Modo de Edição (Tab): seleção de VÉRTICES ou FACES, mover, EXTRUDAR (E) e excluir faces.
// A malha é trabalhada como "não indexada" (cada triângulo com seus 3 vértices);
// vértices na mesma posição formam um "grupo" e se movem juntos — a malha não rasga.
import * as THREE from 'three';
import { state, bus, select } from './state.js';
import { gizmo, pickAt } from './viewport.js';
import { history } from './history.js';
import { toast } from '../ui/toast.js';

let mesh = null, points = null, overlay = null, handle = null;
let groups = [], vToGroup = null;             // grupo = vértices coincidentes
const selected = new Set();                    // ids de grupos selecionados
const faces = new Set();                       // índices de triângulos selecionados (modo face)
let before = null, last = null;
export const edit = { select: 'vertex' };      // 'vertex' | 'face'

const key = (p, i) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;

export function toggleEditMode() {
  if (state.mode === 'edit') exitEdit();
  else if (state.selected?.isMesh && !state.selected.userData.vfx) enterEdit(state.selected);
  else toast('Selecione uma malha para editar');
}

function enterEdit(m) {
  mesh = m; state.mode = 'edit';
  if (m.geometry.index) { // trabalha em não-indexado (sem mudança visual)
    const old = m.geometry, g = old.toNonIndexed(); m.geometry = g;
    history.push({ label: 'Preparar edição', undo: () => (m.geometry = old), redo: () => (m.geometry = g) });
  }
  handle = new THREE.Object3D(); m.add(handle);
  rebuild(); gizmo.detach(); selected.clear(); faces.clear();
  bus.emit('mode', 'edit');
}

export function exitEdit() {
  if (!mesh) return;
  [points, overlay, handle].forEach((o) => o && mesh.remove(o));
  points?.geometry.dispose(); overlay?.geometry.dispose();
  const g = mesh.geometry; g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
  const m = mesh; mesh = null; points = overlay = null; state.mode = 'object';
  gizmo.detach(); select(m); bus.emit('mode', 'object');
}

// Reconstrói grupos de vértices + nuvem de pontos (após qualquer mudança topológica).
function rebuild() {
  const pos = mesh.geometry.attributes.position; const map = new Map(); groups = []; vToGroup = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = key(pos, i); if (!map.has(k)) { map.set(k, groups.length); groups.push([]); }
    const gi = map.get(k); groups[gi].push(i); vToGroup[i] = gi;
  }
  if (points) { mesh.remove(points); points.geometry.dispose(); }
  const g = new THREE.BufferGeometry();
  const arr = new Float32Array(groups.length * 3), col = new Float32Array(groups.length * 3);
  groups.forEach((gr, i) => arr.set([pos.getX(gr[0]), pos.getY(gr[0]), pos.getZ(gr[0])], i * 3));
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  points = new THREE.Points(g, new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true, depthTest: false }));
  points.renderOrder = 999; points.userData.editHelper = true; points.visible = edit.select === 'vertex';
  mesh.add(points); refresh();
}

function refresh() {
  if (!points) return;
  const c = points.geometry.attributes.color;
  for (let i = 0; i < groups.length; i++) { const s = selected.has(i); c.setXYZ(i, s ? 1 : 0.1, s ? 0.48 : 0.1, s ? 0.27 : 0.12); }
  c.needsUpdate = true; points.visible = edit.select === 'vertex';
  drawOverlay(); placeHandle();
}

function drawOverlay() {
  if (overlay) { mesh.remove(overlay); overlay.geometry.dispose(); overlay = null; }
  if (edit.select !== 'face' || !faces.size) return;
  const pos = mesh.geometry.attributes.position; const arr = [];
  faces.forEach((t) => { for (let k = 0; k < 3; k++) arr.push(pos.getX(t * 3 + k), pos.getY(t * 3 + k), pos.getZ(t * 3 + k)); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  overlay = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#e2703f', transparent: true, opacity: 0.45, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));
  overlay.userData.editHelper = true; overlay.raycast = () => {}; mesh.add(overlay);
}

function placeHandle() {
  if (!selected.size) { gizmo.detach(); return; }
  const p = points.geometry.attributes.position; const c = new THREE.Vector3();
  selected.forEach((i) => c.add(new THREE.Vector3().fromBufferAttribute(p, i)));
  handle.position.copy(c.divideScalar(selected.size));
  gizmo.setMode('translate'); gizmo.attach(handle);
}

function syncSelectionFromFaces() {
  selected.clear(); faces.forEach((t) => { for (let k = 0; k < 3; k++) selected.add(vToGroup[t * 3 + k]); });
}

// Seleção de face: o triângulo clicado + vizinhos coplanares (ex.: o lado inteiro de um cubo).
function triNormal(pos, t, out = new THREE.Vector3()) {
  const a = new THREE.Vector3().fromBufferAttribute(pos, t * 3), b = new THREE.Vector3().fromBufferAttribute(pos, t * 3 + 1), c = new THREE.Vector3().fromBufferAttribute(pos, t * 3 + 2);
  return out.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
}
function coplanarRegion(t0) {
  const pos = mesh.geometry.attributes.position; const tris = pos.count / 3;
  const n0 = triNormal(pos, t0); const p0 = new THREE.Vector3().fromBufferAttribute(pos, t0 * 3);
  const edgeMap = new Map(); // aresta (grupos ordenados) -> triângulos
  for (let t = 0; t < tris; t++) for (let k = 0; k < 3; k++) {
    const a = vToGroup[t * 3 + k], b = vToGroup[t * 3 + ((k + 1) % 3)]; const e = a < b ? a + '_' + b : b + '_' + a;
    (edgeMap.get(e) || edgeMap.set(e, []).get(e)).push(t);
  }
  const region = new Set([t0]); const queue = [t0]; const n = new THREE.Vector3(), v = new THREE.Vector3();
  while (queue.length) {
    const t = queue.pop();
    for (let k = 0; k < 3; k++) {
      const a = vToGroup[t * 3 + k], b = vToGroup[t * 3 + ((k + 1) % 3)]; const e = a < b ? a + '_' + b : b + '_' + a;
      for (const u of edgeMap.get(e)) {
        if (region.has(u)) continue;
        if (triNormal(pos, u, n).dot(n0) < 0.999) continue;
        if (Math.abs(v.fromBufferAttribute(pos, u * 3).sub(p0).dot(n0)) > 1e-4) continue;
        region.add(u); queue.push(u);
      }
    }
  }
  return region;
}

bus.on('edit:click', (e) => {
  if (!mesh) return;
  if (edit.select === 'vertex') {
    const hit = pickAt(e.clientX, e.clientY, [points])[0];
    if (!e.shiftKey) selected.clear();
    if (hit) { const i = hit.index; if (selected.has(i) && e.shiftKey) selected.delete(i); else selected.add(i); }
  } else {
    const hit = pickAt(e.clientX, e.clientY, [mesh]).find((h) => h.object === mesh);
    if (!e.shiftKey) faces.clear();
    if (hit) { const reg = coplanarRegion(hit.faceIndex); const all = [...reg].every((t) => faces.has(t)); reg.forEach((t) => (all && e.shiftKey ? faces.delete(t) : faces.add(t))); }
    syncSelectionFromFaces();
  }
  refresh();
});

export function setSelectMode(m) { edit.select = m; selected.clear(); faces.clear(); refresh(); bus.emit('edit:select-mode', m); }

export function selectAllVerts() {
  if (!points) return;
  if (edit.select === 'face') { const n = mesh.geometry.attributes.position.count / 3; if (faces.size === n) faces.clear(); else for (let t = 0; t < n; t++) faces.add(t); syncSelectionFromFaces(); }
  else if (selected.size === groups.length) selected.clear(); else groups.forEach((_, i) => selected.add(i));
  refresh();
}

// ---------- Extrudar ----------
export function extrude(distance = 0.3) {
  if (!mesh || edit.select !== 'face' || !faces.size) { toast('Modo Face: selecione faces para extrudar (E)'); return; }
  const old = mesh.geometry; const pos = old.attributes.position, uv = old.attributes.uv;
  // Arestas de contorno = arestas usadas por apenas 1 face selecionada
  const count = new Map(), dir = new Map();
  faces.forEach((t) => { for (let k = 0; k < 3; k++) {
    const ia = t * 3 + k, ib = t * 3 + ((k + 1) % 3); const a = vToGroup[ia], b = vToGroup[ib];
    const e = a < b ? a + '_' + b : b + '_' + a; count.set(e, (count.get(e) || 0) + 1); dir.set(e, [ia, ib]);
  } });
  const n = new THREE.Vector3(); faces.forEach((t) => n.add(triNormal(pos, t))); n.normalize();
  const d = n.multiplyScalar(distance);
  const P = Array.from(pos.array), U = uv ? Array.from(uv.array) : null;
  const pa = new THREE.Vector3(), pb = new THREE.Vector3();
  for (const [e, c] of count) {
    if (c !== 1) continue; const [ia, ib] = dir.get(e);
    pa.fromBufferAttribute(pos, ia); pb.fromBufferAttribute(pos, ib);
    const pa2 = pa.clone().add(d), pb2 = pb.clone().add(d);
    // Parede lateral (2 triângulos) com a orientação voltada para fora
    P.push(...pa.toArray(), ...pb.toArray(), ...pb2.toArray(), ...pa.toArray(), ...pb2.toArray(), ...pa2.toArray());
    if (U) U.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }
  faces.forEach((t) => { for (let k = 0; k < 3; k++) { const i = (t * 3 + k) * 3; P[i] += d.x; P[i + 1] += d.y; P[i + 2] += d.z; } });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  if (U) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.computeVertexNormals();
  mesh.geometry = g; const m = mesh;
  history.push({ label: 'Extrudar', undo: () => { m.geometry = old; if (mesh === m) rebuild(); }, redo: () => { m.geometry = g; if (mesh === m) rebuild(); } });
  rebuild(); syncSelectionFromFaces(); refresh();
  gizmo.showX = gizmo.showY = gizmo.showZ = true;
  toast('Extrudado — arraste a seta para ajustar');
}

export function deleteFaces() {
  if (!mesh || edit.select !== 'face' || !faces.size) return;
  const old = mesh.geometry; const keep = [];
  for (let t = 0; t < old.attributes.position.count / 3; t++) if (!faces.has(t)) keep.push(t);
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(old.attributes)) {
    const out = new Float32Array(keep.length * 3 * a.itemSize);
    keep.forEach((t, j) => out.set(a.array.subarray(t * 3 * a.itemSize, (t + 1) * 3 * a.itemSize), j * 3 * a.itemSize));
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  const m = mesh; mesh.geometry = g; faces.clear(); selected.clear();
  history.push({ label: 'Excluir faces', undo: () => { m.geometry = old; if (mesh === m) rebuild(); }, redo: () => { m.geometry = g; if (mesh === m) rebuild(); } });
  rebuild();
}

// O gizmo é criado em initViewport(); por isso os ganchos são ligados depois.
export function bindEditGizmo() {
  gizmo.addEventListener('dragging-changed', (e) => {
    if (state.mode !== 'edit' || !mesh) return;
    if (e.value) { before = mesh.geometry.attributes.position.array.slice(); last = handle.position.clone(); }
    else if (before) {
      const geo = mesh.geometry, b = before, a = geo.attributes.position.array.slice(); before = null;
      const apply = (src) => { geo.attributes.position.array.set(src); geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); };
      history.push({ label: 'Mover seleção', undo: () => apply(b), redo: () => apply(a) });
      drawOverlay();
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
    if (overlay) drawOverlay();
  });
}
