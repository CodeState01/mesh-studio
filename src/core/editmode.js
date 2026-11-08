// Modo de Edição (Tab) sobre EditMesh: vértice / aresta / face, loops, seleção por retângulo,
// edição proporcional e operações (extrudar, inset, bevel, loop cut, merge, conectar, preencher…).
// Toda operação abre o painel "Ajustar última operação" com valores exatos.
import * as THREE from 'three';
import { state, bus, select, precision } from './state.js';
import { gizmo, renderer, camera, getRenderCamera, scene, orbit, pickAt } from './viewport.js';
import { registerEditTransform } from './precision.js';
import { EditMesh } from './editmesh.js';
import { history } from './history.js';
import { toast } from '../ui/toast.js';

const ek = (a, b) => (a < b ? a + '_' + b : b + '_' + a);
export const edit = { select: 'vertex', mesh: null, em: null, lastOp: null };
const sel = { verts: new Set(), edges: new Set(), faces: new Set() };
let overlay = null, handle = null;
const C_SEL = new THREE.Color('#ff8a4c'), C_VERT = new THREE.Color('#15161a'), C_EDGE = new THREE.Color('#0d0e10');

const cam = () => getRenderCamera() || camera;
function screenOf(v) {
  const r = renderer.domElement.getBoundingClientRect(); const p = v.clone().project(cam());
  return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height, z: p.z };
}
const world = (i) => edit.em.verts[i].clone().applyMatrix4(edit.mesh.matrixWorld);

// ---------- Entrar / sair ----------
export function toggleEditMode() {
  if (state.mode === 'edit') exitEdit();
  else if (state.selected?.isMesh && !state.selected.userData.vfx && !state.selected.isSkinnedMesh) enterEdit(state.selected);
  else toast('Selecione uma malha para editar');
}

function enterEdit(m) {
  edit.mesh = m; state.mode = 'edit';
  edit.em = m.__em || EditMesh.fromGeometry(m.geometry);
  if (m.__em === undefined) edit.em.smooth = m.userData.smooth ?? detectSmooth(m.geometry);
  m.__em = edit.em; sel.verts.clear(); sel.edges.clear(); sel.faces.clear();
  // Empurra a superfície um pouco para trás: as arestas desenhadas por cima não "tremem" (z-fighting)
  m.material.polygonOffset = true; m.material.polygonOffsetFactor = 1; m.material.polygonOffsetUnits = 1; m.material.needsUpdate = true;
  if (!handle) { handle = new THREE.Object3D(); handle.name = '__edithandle__'; scene.add(handle); }
  sync(); gizmo.detach();
  bus.emit('mode', 'edit'); bus.emit('edit:changed');
}

export function exitEdit() {
  if (!edit.mesh) return;
  if (overlay) { edit.mesh.remove(overlay); overlay.traverse((o) => o.geometry?.dispose()); overlay = null; }
  const m = edit.mesh; m.userData.smooth = edit.em.smooth;
  m.material.polygonOffset = false; m.material.needsUpdate = true;
  edit.mesh = null; edit.em = null; edit.lastOp = null; state.mode = 'object';
  gizmo.detach(); select(m); bus.emit('mode', 'object'); bus.emit('edit:op', null);
}

function detectSmooth(g) {
  const n = g.attributes.normal, p = g.attributes.position; if (!n) return false;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3(), vn = new THREE.Vector3();
  const idx = (i) => (g.index ? g.index.getX(i) : i); let diff = 0, cnt = Math.min(60, (g.index ? g.index.count : p.count) / 3);
  for (let t = 0; t < cnt; t++) {
    a.fromBufferAttribute(p, idx(t * 3)); b.fromBufferAttribute(p, idx(t * 3 + 1)); c.fromBufferAttribute(p, idx(t * 3 + 2));
    fn.subVectors(c, b).cross(a.clone().sub(b)).normalize(); vn.fromBufferAttribute(n, idx(t * 3));
    if (vn.dot(fn) < 0.995) diff++;
  }
  return diff > cnt * 0.3;
}

// ---------- Sincronização malha ↔ geometria ↔ overlay ----------
function sync(topology = true) {
  const m = edit.mesh, em = edit.em; if (!m) return;
  m.geometry.dispose(); m.geometry = em.toGeometry();
  if (topology || !overlay) buildOverlay(); else updateOverlayPositions();
  recolor();
}

function buildOverlay() {
  const m = edit.mesh, em = edit.em;
  if (overlay) { m.remove(overlay); overlay.traverse((o) => o.geometry?.dispose()); }
  overlay = new THREE.Group(); overlay.userData.editHelper = true;
  const vp = new Float32Array(em.verts.length * 3), vc = new Float32Array(em.verts.length * 3);
  const pts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 6, sizeAttenuation: false, vertexColors: true, depthTest: false, transparent: true }));
  pts.geometry.setAttribute('position', new THREE.BufferAttribute(vp, 3)); pts.geometry.setAttribute('color', new THREE.BufferAttribute(vc, 3));
  const edges = em.edges(); edit.edgeList = edges;
  const lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthTest: true }));
  lines.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edges.length * 6), 3));
  lines.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(edges.length * 6), 3));
  const faces = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: '#ff8a4c', transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  [pts, lines, faces].forEach((o) => { o.renderOrder = 990; o.userData.editHelper = true; o.raycast = () => {}; });
  pts.renderOrder = 999;
  overlay.add(faces, lines, pts); overlay.points = pts; overlay.lines = lines; overlay.faces = faces;
  m.add(overlay); updateOverlayPositions();
}

function updateOverlayPositions() {
  const em = edit.em; const vp = overlay.points.geometry.attributes.position;
  em.verts.forEach((v, i) => vp.setXYZ(i, v.x, v.y, v.z)); vp.needsUpdate = true;
  const lp = overlay.lines.geometry.attributes.position;
  edit.edgeList.forEach(([a, b], i) => { const A = em.verts[a], B = em.verts[b]; lp.setXYZ(i * 2, A.x, A.y, A.z); lp.setXYZ(i * 2 + 1, B.x, B.y, B.z); });
  lp.needsUpdate = true; overlay.points.geometry.computeBoundingSphere(); overlay.lines.geometry.computeBoundingSphere();
  drawSelectedFaces();
}

function drawSelectedFaces() {
  const em = edit.em; const arr = [];
  if (edit.select === 'face') for (const fi of sel.faces) { const f = em.faces[fi]; if (!f) continue; for (let i = 1; i < f.length - 1; i++) for (const v of [f[0], f[i], f[i + 1]]) arr.push(em.verts[v].x, em.verts[v].y, em.verts[v].z); }
  overlay.faces.geometry.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
}

function derivedVerts() {
  if (edit.select === 'vertex') return new Set(sel.verts);
  const s = new Set();
  if (edit.select === 'edge') sel.edges.forEach((k) => k.split('_').forEach((v) => s.add(+v)));
  else sel.faces.forEach((fi) => edit.em.faces[fi]?.forEach((v) => s.add(v)));
  return s;
}
function selectedEdgeKeys() {
  if (edit.select === 'edge') return [...sel.edges];
  const vs = derivedVerts(); return edit.edgeList.filter(([a, b]) => vs.has(a) && vs.has(b)).map(([a, b]) => ek(a, b));
}

function recolor() {
  if (!overlay) return;
  const vs = derivedVerts(); const vc = overlay.points.geometry.attributes.color;
  for (let i = 0; i < edit.em.verts.length; i++) { const c = vs.has(i) ? C_SEL : C_VERT; vc.setXYZ(i, c.r, c.g, c.b); }
  vc.needsUpdate = true; overlay.points.visible = edit.select === 'vertex' || vs.size > 0;
  const lc = overlay.lines.geometry.attributes.color; const es = new Set(selectedEdgeKeys());
  edit.edgeList.forEach(([a, b], i) => { const c = es.has(ek(a, b)) ? C_SEL : C_EDGE; lc.setXYZ(i * 2, c.r, c.g, c.b); lc.setXYZ(i * 2 + 1, c.r, c.g, c.b); });
  lc.needsUpdate = true; drawSelectedFaces(); placeHandle();
  bus.emit('edit:selection', { verts: vs.size, edges: es.size, faces: sel.faces.size });
}

function placeHandle() {
  const vs = derivedVerts(); if (!vs.size || state.tool === 'select') { gizmo.detach(); return; }
  const c = new THREE.Vector3(); vs.forEach((i) => c.add(world(i))); handle.position.copy(c.divideScalar(vs.size));
  handle.quaternion.identity(); handle.scale.set(1, 1, 1); handle.updateMatrixWorld(true);
  gizmo.attach(handle);
}

// ---------- Seleção ----------
function nearestVertex(x, y, maxPx = 14) {
  let best = -1, bd = maxPx; edit.mesh.updateMatrixWorld();
  edit.em.verts.forEach((_, i) => { const s = screenOf(world(i)); if (s.z > 1) return; const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = i; } });
  return best;
}
function nearestEdge(x, y, maxPx = 10) {
  let best = null, bd = maxPx;
  for (const [a, b] of edit.edgeList) {
    const A = screenOf(world(a)), B = screenOf(world(b)); const dx = B.x - A.x, dy = B.y - A.y; const L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / L)); const d = Math.hypot(A.x + dx * t - x, A.y + dy * t - y);
    if (d < bd) { bd = d; best = [a, b]; }
  }
  return best;
}
function faceAt(x, y) { const h = pickAt(x, y, [edit.mesh]).find((h) => h.object === edit.mesh); return h ? edit.em.triToFace[h.faceIndex] : -1; }

bus.on('edit:click', (e) => {
  if (!edit.mesh) return;
  const add = e.shiftKey; const set = edit.select === 'vertex' ? sel.verts : edit.select === 'edge' ? sel.edges : sel.faces;
  if (!add) { sel.verts.clear(); sel.edges.clear(); sel.faces.clear(); }
  if (e.altKey && edit.select !== 'face') { // loop de arestas
    const ed = nearestEdge(e.clientX, e.clientY, 14); if (ed) edit.em.edgeLoop(...ed).forEach((k) => (edit.select === 'edge' ? sel.edges.add(k) : k.split('_').forEach((v) => sel.verts.add(+v))));
  } else {
    let item = null;
    if (edit.select === 'vertex') { const v = nearestVertex(e.clientX, e.clientY); if (v >= 0) item = v; }
    else if (edit.select === 'edge') { const ed = nearestEdge(e.clientX, e.clientY); if (ed) item = ek(...ed); }
    else { const f = faceAt(e.clientX, e.clientY); if (f >= 0) item = f; }
    if (item !== null) { if (add && set.has(item)) set.delete(item); else set.add(item); }
  }
  recolor();
});

// Seleção por retângulo (arrastar no vazio)
function setupRectSelect() {
  const el = renderer.domElement; let start = null, box = null;
  el.addEventListener('pointerdown', (e) => {
    if (state.mode !== 'edit' || e.button !== 0 || e.altKey || gizmo.dragging || gizmo.axis) return;
    start = { x: e.clientX, y: e.clientY, shift: e.shiftKey };
  });
  window.addEventListener('pointermove', (e) => {
    if (!start) return; const w = e.clientX - start.x, h = e.clientY - start.y;
    if (!box && Math.hypot(w, h) < 6) return;
    if (!box) { box = document.createElement('div'); box.className = 'rect-select'; document.body.appendChild(box); orbit.enabled = false; }
    Object.assign(box.style, { left: Math.min(start.x, e.clientX) + 'px', top: Math.min(start.y, e.clientY) + 'px', width: Math.abs(w) + 'px', height: Math.abs(h) + 'px' });
  });
  window.addEventListener('pointerup', (e) => {
    if (!start) return; const s = start; start = null; if (!box) return;
    box.remove(); box = null; orbit.enabled = true;
    const x0 = Math.min(s.x, e.clientX), x1 = Math.max(s.x, e.clientX), y0 = Math.min(s.y, e.clientY), y1 = Math.max(s.y, e.clientY);
    const inside = (p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p.z < 1;
    if (!s.shift) { sel.verts.clear(); sel.edges.clear(); sel.faces.clear(); }
    const em = edit.em; const vin = em.verts.map((_, i) => inside(screenOf(world(i))));
    if (edit.select === 'vertex') vin.forEach((v, i) => v && sel.verts.add(i));
    else if (edit.select === 'edge') edit.edgeList.forEach(([a, b]) => vin[a] && vin[b] && sel.edges.add(ek(a, b)));
    else em.faces.forEach((f, fi) => f.every((v) => vin[v]) && sel.faces.add(fi));
    recolor();
  });
}

export function setSelectMode(m) {
  const vs = derivedVerts(); edit.select = m;
  // converte a seleção atual para o novo modo
  sel.verts = m === 'vertex' ? vs : new Set(); sel.edges.clear(); sel.faces.clear();
  if (m === 'edge') edit.edgeList.forEach(([a, b]) => vs.has(a) && vs.has(b) && sel.edges.add(ek(a, b)));
  if (m === 'face') edit.em.faces.forEach((f, fi) => f.every((v) => vs.has(v)) && sel.faces.add(fi));
  recolor(); bus.emit('edit:select-mode', m);
}
export function selectAllVerts() {
  const all = derivedVerts().size === edit.em.verts.length;
  sel.verts.clear(); sel.edges.clear(); sel.faces.clear();
  if (!all) { if (edit.select === 'vertex') edit.em.verts.forEach((_, i) => sel.verts.add(i)); else if (edit.select === 'edge') edit.edgeList.forEach(([a, b]) => sel.edges.add(ek(a, b))); else edit.em.faces.forEach((_, i) => sel.faces.add(i)); }
  recolor();
}
export function invertSelection() {
  if (edit.select === 'vertex') { const s = new Set(); edit.em.verts.forEach((_, i) => !sel.verts.has(i) && s.add(i)); sel.verts = s; }
  else if (edit.select === 'edge') { const s = new Set(); edit.edgeList.forEach(([a, b]) => !sel.edges.has(ek(a, b)) && s.add(ek(a, b))); sel.edges = s; }
  else { const s = new Set(); edit.em.faces.forEach((_, i) => !sel.faces.has(i) && s.add(i)); sel.faces = s; }
  recolor();
}
export function selectLinked() {
  const em = edit.em; const vf = em.vertFaces(); const seen = new Set(derivedVerts()); const queue = [...seen];
  while (queue.length) { const v = queue.pop(); for (const fi of vf[v]) for (const w of em.faces[fi]) if (!seen.has(w)) { seen.add(w); queue.push(w); } }
  sel.verts = seen; const m = edit.select; edit.select = 'vertex'; setSelectMode(m);
}

// ---------- Transformação (gizmo e modal G/R/S) com edição proporcional ----------
function beginTransform() {
  const em = edit.em; const vs = [...derivedVerts()]; if (!vs.length) return null;
  const inv = edit.mesh.matrixWorld.clone().invert(); const before = em.clone();
  const startW = em.verts.map((_, i) => world(i));
  const weights = new Map(vs.map((v) => [v, 1]));
  if (precision.proportional) {
    const R = precision.propRadius; const fall = { linear: (t) => t, sharp: (t) => t * t, sphere: (t) => Math.sqrt(1 - (1 - t) * (1 - t)), smooth: (t) => t * t * (3 - 2 * t) }[precision.propFalloff] || ((t) => t);
    startW.forEach((p, i) => { if (weights.has(i)) return; let d = Infinity; for (const v of vs) d = Math.min(d, p.distanceTo(startW[v])); if (d < R) weights.set(i, fall(1 - d / R)); });
  }
  // Espelho em X (simetria): cada vértice movido leva junto o "gêmeo" do outro lado (x → −x)
  const pairs = [];
  if (precision.mirrorX) {
    const key = (v, sx = 1) => `${Math.round(v.x * sx * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`;
    const idx = new Map(before.verts.map((v, i) => [key(v), i]));
    for (const i of weights.keys()) { const j = idx.get(key(before.verts[i], -1)); if (j !== undefined && j !== i && !weights.has(j)) pairs.push([i, j]); }
  }
  return {
    points: vs.map((v) => startW[v].clone()),
    applyMatrix(T) {
      for (const [i, w] of weights) { const p = startW[i].clone(); const q = p.clone().applyMatrix4(T); em.verts[i].copy(p.lerp(q, w).applyMatrix4(inv)); }
      if (precision.mirrorX) {
        for (const [i, j] of pairs) { const d = em.verts[i].clone().sub(before.verts[i]); em.verts[j].copy(before.verts[j]).add(new THREE.Vector3(-d.x, d.y, d.z)); }
        for (const i of weights.keys()) if (Math.abs(before.verts[i].x) < 1e-4) em.verts[i].x = 0; // costura fica no centro
      }
      edit.mesh.geometry.dispose(); edit.mesh.geometry = em.toGeometry(); updateOverlayPositions();
    },
    commit(label) { pushOp(label, before, em.clone()); placeHandle(); },
    cancel() { em.verts.forEach((v, i) => v.copy(before.verts[i])); sync(false); },
  };
}
registerEditTransform({ begin: () => (state.mode === 'edit' ? beginTransform() : null) });

export function bindEditGizmo() {
  let tr = null, inv0 = null;
  gizmo.addEventListener('dragging-changed', (e) => {
    if (state.mode !== 'edit' || gizmo.object !== handle) return;
    if (e.value) { tr = beginTransform(); handle.updateMatrixWorld(true); inv0 = handle.matrixWorld.clone().invert(); }
    else if (tr) { tr.commit('Mover seleção'); tr = null; }
  });
  gizmo.addEventListener('objectChange', () => {
    if (state.mode !== 'edit' || !tr) return;
    handle.updateMatrixWorld(true); tr.applyMatrix(handle.matrixWorld.clone().multiply(inv0));
  });
  setupRectSelect();
  bus.on('tool', () => { if (state.mode === 'edit') placeHandle(); });
}

// ---------- Histórico + "ajustar última operação" ----------
function pushOp(label, before, after) {
  const m = edit.mesh;
  const apply = (src) => { if (edit.mesh !== m) { m.__em = src.clone(); m.geometry = m.__em.toGeometry(); return; } edit.em.verts = src.clone().verts; Object.assign(edit.em, src.clone()); m.__em = edit.em; sync(true); };
  history.push({ label, undo: () => apply(before), redo: () => apply(after) });
}

function runOp(name, label, params, fn, after) {
  if (!edit.mesh) return;
  const before = edit.em.clone(); const snapshot = { verts: new Set(sel.verts), edges: new Set(sel.edges), faces: new Set(sel.faces) };
  const exec = (p) => {
    Object.assign(edit.em, before.clone()); sel.verts = new Set(snapshot.verts); sel.edges = new Set(snapshot.edges); sel.faces = new Set(snapshot.faces);
    const r = fn(edit.em, p); sync(true); after?.(r); return r;
  };
  const r = exec(params);
  if (r === false) { toast(label + ': nada a fazer com esta seleção'); return; }
  pushOp(label, before, edit.em.clone());
  edit.lastOp = { name, label, params: { ...params }, rerun(p) { history.undo?.call(history); exec(p); pushOp(label, before, edit.em.clone()); edit.lastOp.params = { ...p }; } };
  bus.emit('edit:op', edit.lastOp);
}

// ---------- Operações ----------
const need = (n, what) => { if (n) return true; toast(`Selecione ${what}`); return false; };
export const ops = {
  extrude() {
    if (edit.select !== 'face') { setSelectMode('face'); }
    if (!need(sel.faces.size, 'faces (modo Face)')) return;
    runOp('extrude', 'Extrudar', { distance: 0.3 }, (em, p) => { em.extrudeFaces(sel.faces, p.distance); });
  },
  inset() {
    if (!need(edit.select === 'face' && sel.faces.size, 'faces (modo Face)')) return;
    runOp('inset', 'Inset', { amount: 0.25 }, (em, p) => { em.insetFaces(sel.faces, p.amount); });
  },
  bevel() {
    const keys = selectedEdgeKeys(); if (!need(keys.length, 'arestas')) return;
    runOp('bevel', 'Bevel', { width: 0.1 }, (em, p) => { sel.verts.clear(); sel.edges.clear(); sel.faces.clear(); return em.bevelEdges(keys, p.width) || false; });
  },
  loopCut(mouse) {
    let ed = null;
    if (mouse) ed = nearestEdge(mouse.x, mouse.y, 40);
    if (!ed) { const k = selectedEdgeKeys()[0]; if (k) ed = k.split('_').map(Number); }
    if (!need(ed, 'uma aresta (ou aponte o mouse para ela)')) return;
    runOp('loopcut', 'Loop Cut', { position: 0.5 }, (em, p) => em.loopCut(ed[0], ed[1], p.position) || false);
  },
  subdivide() {
    if (!need(edit.select === 'face' && sel.faces.size, 'faces (modo Face)')) return;
    runOp('subdivide', 'Subdividir', {}, (em) => { em.subdivideFaces(sel.faces); sel.faces.clear(); });
  },
  merge() { const vs = derivedVerts(); if (!need(vs.size > 1, '2+ vértices')) return; runOp('merge', 'Merge', {}, (em) => { em.mergeVerts(vs); sel.verts.clear(); sel.edges.clear(); sel.faces.clear(); }); },
  connect() { const vs = [...derivedVerts()]; if (!need(vs.length === 2, 'exatamente 2 vértices da mesma face')) return; runOp('connect', 'Conectar', {}, (em) => em.connect(vs[0], vs[1])); },
  fill() { const vs = derivedVerts(); if (!need(vs.size > 2, '3+ vértices')) return; runOp('fill', 'Preencher', {}, (em) => { em.fill(vs); }); },
  flip() { if (!need(sel.faces.size, 'faces (modo Face)')) return; runOp('flip', 'Inverter normais', {}, (em) => { em.flipFaces(sel.faces); }); },
  remove() {
    runOp('delete', 'Excluir', {}, (em) => {
      if (edit.select === 'face') { if (!sel.faces.size) return false; em.deleteFaces(sel.faces); }
      else { const vs = derivedVerts(); if (!vs.size) return false; em.deleteVerts(vs); }
      sel.verts.clear(); sel.edges.clear(); sel.faces.clear();
    });
  },
  shade(smooth) { runOp('shade', smooth ? 'Suavizar' : 'Facetar', {}, (em) => { em.smooth = smooth; }); },
};

// Teclas do modo de edição (têm prioridade sobre os atalhos globais)
export const EDIT_KEYS = {
  '1': () => setSelectMode('vertex'), '2': () => setSelectMode('edge'), '3': () => setSelectMode('face'),
  E: ops.extrude, I: ops.inset, 'Ctrl+B': ops.bevel, 'Ctrl+R': (m) => ops.loopCut(m), M: ops.merge, J: ops.connect, F: ops.fill,
  X: ops.remove, Delete: ops.remove, A: selectAllVerts, 'Ctrl+I': invertSelection, L: selectLinked, 'Alt+N': ops.flip,
};

// Leitura (sem efeitos colaterais) das posições de mundo dos vértices selecionados — usada pelo painel.
export function selectedPoints() { return edit.mesh ? [...derivedVerts()].map(world) : []; }

// ---------- Ferramenta de malha sem malha em edição ----------
// Se o usuário escolhe Extrudar/Bevel/… fora do modo de edição:
//  • há malha selecionada → entra no modo de edição já no sub-modo certo;
//  • não há → destaca as PARTES (vértices + arestas) de todas as malhas e espera um clique.
import { content } from './objects.js';
let pending = null, parts = [];
const WHAT = { face: 'as faces', edge: 'as arestas', vertex: 'os vértices' };

export function showMeshParts(on) {
  parts.forEach(({ m, g }) => { m.remove(g); g.traverse((o) => o.geometry?.dispose()); }); parts = [];
  if (!on) { bus.emit('meshparts', false); return; }
  content.traverse((m) => {
    if (!m.isMesh || m.userData.proxy || m.userData.editHelper || m.userData.vfx || m === edit.mesh) return;
    const g = new THREE.Group(); g.userData.editHelper = true; g.userData.noPick = true;
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 1), new THREE.LineBasicMaterial({ color: '#b9f23c', transparent: true, opacity: 0.75, depthTest: false }));
    const pos = m.geometry.attributes.position; const uniq = new Map();
    for (let i = 0; i < pos.count && uniq.size < 20000; i++) { const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`; if (!uniq.has(k)) uniq.set(k, [pos.getX(i), pos.getY(i), pos.getZ(i)]); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute([...uniq.values()].flat(), 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: '#ffffff', size: 5, sizeAttenuation: false, depthTest: false }));
    [lines, pts].forEach((o) => { o.renderOrder = 995; o.raycast = () => {}; o.userData.editHelper = true; });
    g.add(lines, pts); m.add(g); parts.push({ m, g });
  });
  bus.emit('meshparts', true);
}

export function ensureEdit(mode, toolName) {
  if (state.mode === 'edit' && edit.mesh) { if (edit.select !== mode && mode) setSelectMode(mode); return true; }
  const o = state.selected;
  if (o?.isMesh && !o.userData.vfx && !o.isSkinnedMesh) {
    enterEdit(o); setSelectMode(mode);
    toast(`${toolName}: selecione ${WHAT[mode]} e use de novo`, { ms: 3500 });
    return false;
  }
  let any = false; content.traverse((m) => { if (m.isMesh && !m.userData.proxy && !m.userData.vfx) any = true; });
  if (!any) { toast('Não há malhas na cena — adicione uma (Shift+A)'); return false; }
  pending = { mode, toolName }; showMeshParts(true);
  toast(`${toolName}: clique numa malha (as partes dela estão destacadas)`, { ms: 4500 });
  return false;
}
bus.on('selection', (o) => {
  if (!pending) return;
  if (o?.isMesh && !o.userData.vfx) { const p = pending; pending = null; showMeshParts(false); enterEdit(o); setSelectMode(p.mode); toast(`${p.toolName}: selecione ${WHAT[p.mode]} e use de novo`, { ms: 3500 }); }
});
export function cancelPending() { if (pending) { pending = null; showMeshParts(false); } }

const NEED = { extrude: ['face', 'Extrudar'], inset: ['face', 'Inset'], bevel: ['edge', 'Bevel'], loopCut: ['edge', 'Loop Cut'], subdivide: ['face', 'Subdividir'], merge: ['vertex', 'Merge'], connect: ['vertex', 'Conectar'], fill: ['vertex', 'Preencher'], flip: ['face', 'Inverter normais'] };
for (const [k, [mode, label]] of Object.entries(NEED)) { const fn = ops[k]; ops[k] = (...a) => (ensureEdit(mode, label) ? fn(...a) : undefined); }
