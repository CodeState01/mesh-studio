// Curvas (como Bézier/NURBS path do Blender): pontos de controle suaves (Catmull-Rom), chanfro
// (bevel) que vira tubo, resolução, curva fechada, edição de pontos com o gizmo e conversão em malha.
// Também servem de caminho para a restrição "Seguir caminho".
import * as THREE from 'three';
import { state, bus, select, nextId } from '../core/state.js';
import { content, helpers, makeMaterial } from '../core/objects.js';
import { gizmo, setTool, worldToScreen, placePivot } from '../core/viewport.js';
import { history } from '../core/history.js';
import { toast } from '../ui/toast.js';

const SHAPES = {
  bezier: () => [[-1.5, 0, 0], [-0.5, 0.8, 0], [0.5, -0.8, 0], [1.5, 0, 0]],
  path: () => [[-2, 0, 0], [-1, 0, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0]],
  circle: () => Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2), 0, Math.sin((i / 8) * Math.PI * 2)]),
  spiral: () => Array.from({ length: 24 }, (_, i) => { const a = i * 0.55, r = 0.15 + i * 0.06; return [Math.cos(a) * r, 0, Math.sin(a) * r]; }),
  helix: () => Array.from({ length: 30 }, (_, i) => { const a = i * 0.6; return [Math.cos(a) * 0.6, i * 0.08, Math.sin(a) * 0.6]; }),
};
export const CURVE_TYPES = { bezier: 'Curva Bézier', path: 'Caminho', circle: 'Círculo (curva)', spiral: 'Espiral', helix: 'Hélice (mola)' };

export const curveOf = (o) => o?.userData.curve;
export function splineOf(o) { const c = curveOf(o); return new THREE.CatmullRomCurve3(c.points.map((p) => new THREE.Vector3().fromArray(p)), c.closed, 'catmullrom', c.tension ?? 0.5); }

function build(c) {
  const sp = new THREE.CatmullRomCurve3(c.points.map((p) => new THREE.Vector3().fromArray(p)), c.closed, 'catmullrom', c.tension ?? 0.5);
  const seg = Math.max(8, Math.round(c.points.length * c.resolution));
  return new THREE.TubeGeometry(sp, seg, Math.max(0.002, c.bevel), Math.max(3, c.sides ?? 8), c.closed);
}
export function createCurve(type = 'bezier', opts = {}) {
  const c = { points: opts.points || SHAPES[type](), closed: opts.closed ?? (type === 'circle'), bevel: opts.bevel ?? 0.04, resolution: opts.resolution ?? 12, sides: 8, tension: 0.5 };
  const m = new THREE.Mesh(build(c), makeMaterial(opts.color || '#e2703f'));
  m.name = opts.name || CURVE_TYPES[type] || 'Curva'; m.userData = { id: nextId('curve'), kind: 'curve', curve: c }; m.castShadow = m.receiveShadow = true;
  if (opts.position) m.position.fromArray(opts.position); else m.position.y = type === 'helix' ? 0 : 0.6;
  return m;
}
export function rebuildCurve(o) { const g = build(curveOf(o)); o.geometry.dispose(); o.geometry = g; refreshHandles(); bus.emit('curve:changed', o); }
export function setCurve(o, patch, label = 'Curva') {
  const before = JSON.parse(JSON.stringify(curveOf(o))); Object.assign(o.userData.curve, patch); rebuildCurve(o); const after = JSON.parse(JSON.stringify(curveOf(o)));
  history.push({ label, undo: () => { o.userData.curve = JSON.parse(JSON.stringify(before)); rebuildCurve(o); }, redo: () => { o.userData.curve = JSON.parse(JSON.stringify(after)); rebuildCurve(o); } });
}
export function rehydrateCurves(root = content) { root.traverse((o) => { if (curveOf(o) && o.isMesh) rebuildCurve(o); }); }

// Converte em malha comum (pode editar vértices, aplicar modificadores, exportar)
export function curveToMesh(o = state.selected) { if (!curveOf(o)) return; const c = o.userData.curve; delete o.userData.curve; o.userData.kind = 'mesh'; history.push({ label: 'Curva → malha', undo: () => { o.userData.curve = c; o.userData.kind = 'curve'; }, redo: () => { delete o.userData.curve; o.userData.kind = 'mesh'; } }); exitCurveEdit(); bus.emit('scene:changed'); toast('Curva convertida em malha'); }

// ---------- Edição de pontos (modo "curve") ----------
let editing = null; const handles = new THREE.Group(); handles.name = '__curve_handles__'; let activeIdx = -1;
const HMAT = new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false }); const HSEL = new THREE.MeshBasicMaterial({ color: '#b9f23c', depthTest: false });
function refreshHandles() {
  if (!editing) return; if (!handles.parent) helpers.add(handles);
  while (handles.children.length) handles.remove(handles.children[0]);
  const geo = new THREE.SphereGeometry(0.045, 12, 8); editing.updateMatrixWorld();
  curveOf(editing).points.forEach((p, i) => { const h = new THREE.Mesh(geo, i === activeIdx ? HSEL : HMAT); h.renderOrder = 999; h.position.fromArray(p).applyMatrix4(editing.matrixWorld); h.userData.idx = i; handles.add(h); });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(handles.children.map((h) => h.position)), new THREE.LineDashedMaterial({ color: '#9aa0aa', dashSize: 0.06, gapSize: 0.04, depthTest: false })); line.computeLineDistances(); handles.add(line);
  if (activeIdx >= 0 && handles.children[activeIdx]) gizmo.attach(handles.children[activeIdx]); else gizmo.detach();
}
export function enterCurveEdit(o = state.selected) {
  if (!curveOf(o)) { toast('Selecione uma curva'); return; }
  editing = o; activeIdx = 0; state.mode = 'curve'; setTool('move'); refreshHandles(); bus.emit('mode', 'curve');
  toast('Editando pontos: clique num ponto e arraste o gizmo · Tab ou Esc para sair');
}
export function exitCurveEdit() {
  if (!editing) return; const o = editing; editing = null; activeIdx = -1; helpers.remove(handles); gizmo.detach(); state.mode = 'object'; bus.emit('mode', 'object'); select(o); placePivot();
}
export const isCurveEditing = () => !!editing;
export function addCurvePoint() { if (!editing) return; const c = curveOf(editing); const last = new THREE.Vector3().fromArray(c.points[c.points.length - 1]); const prev = new THREE.Vector3().fromArray(c.points[c.points.length - 2] || [0, 0, 0]); setCurve(editing, { points: [...c.points, last.clone().add(last.clone().sub(prev)).toArray()] }, 'Adicionar ponto'); activeIdx = c.points.length - 1; refreshHandles(); }
export function removeCurvePoint() { if (!editing || activeIdx < 0) return; const c = curveOf(editing); if (c.points.length <= 2) return; setCurve(editing, { points: c.points.filter((_, i) => i !== activeIdx) }, 'Remover ponto'); activeIdx = Math.min(activeIdx, c.points.length - 1); refreshHandles(); }

let dragBefore = null;
export function initCurves() {
  bus.on('curve:click', (e) => {
    if (!editing) return; let best = -1, bd = 14;
    handles.children.forEach((h, i) => { if (!h.isMesh) return; const s = worldToScreen(h.position); const d = Math.hypot(s.x - e.clientX, s.y - e.clientY); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) { activeIdx = best; refreshHandles(); }
  });
  gizmo.addEventListener('dragging-changed', (ev) => { if (!editing) return; if (ev.value) dragBefore = JSON.parse(JSON.stringify(curveOf(editing).points)); else if (dragBefore) { const b = dragBefore, a = JSON.parse(JSON.stringify(curveOf(editing).points)); const o = editing; dragBefore = null; history.push({ label: 'Mover ponto', undo: () => { o.userData.curve.points = b; rebuildCurve(o); }, redo: () => { o.userData.curve.points = a; rebuildCurve(o); } }); } });
  gizmo.addEventListener('objectChange', () => {
    if (!editing || activeIdx < 0 || gizmo.object !== handles.children[activeIdx]) return;
    const local = gizmo.object.position.clone().applyMatrix4(editing.matrixWorld.clone().invert());
    curveOf(editing).points[activeIdx] = local.toArray().map((v) => +v.toFixed(5));
    const g = build(curveOf(editing)); editing.geometry.dispose(); editing.geometry = g;
    const line = handles.children.find((h) => h.isLine); if (line) { line.geometry.setFromPoints(handles.children.filter((h) => h.isMesh).map((h) => h.position)); line.computeLineDistances(); }
  });
  window.addEventListener('keydown', (e) => {
    if (!editing || e.target?.closest?.('input,textarea,select')) return;
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); exitCurveEdit(); }
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); e.stopImmediatePropagation(); addCurvePoint(); }
    if (e.key === 'x' || e.key === 'X' || e.key === 'Delete') { e.preventDefault(); e.stopImmediatePropagation(); removeCurvePoint(); }
  }, true);
}
