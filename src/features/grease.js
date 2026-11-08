// Lápis 3D (Grease Pencil / "Story Artist"): desenhe traços 2D DENTRO da cena 3D — storyboards,
// anotações e animação 2D quadro a quadro com papel-cebola (onion skin).
// Cada objeto de desenho guarda quadros-chave { tempo: [traços] }; mostra o quadro vigente no tempo atual.
import * as THREE from 'three';
import { state, bus, select, nextId } from '../core/state.js';
import { content } from '../core/objects.js';
import { renderer, camera, getRenderCamera, cursor3D, pickAt } from '../core/viewport.js';
import { history } from '../core/history.js';
import { toast } from '../ui/toast.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const pencil = { tool: 'draw', color: '#1d1d1f', width: 0.03, plane: 'view', onion: true, fill: false };
export const PLANES = [['view', 'Vista (no cursor 3D)'], ['surface', 'Superfície'], ['floor', 'Chão'], ['front', 'Frente (XY)']];

// Fita (ribbon) com largura variável pela pressão da caneta; o plano define para onde ela "olha".
function ribbon(stroke, normal) {
  const pts = stroke.pts.map((p) => new THREE.Vector3().fromArray(p)); const n = pts.length; if (n < 2) return null;
  const pos = [], idx = []; const N = new THREE.Vector3().fromArray(normal || stroke.n || [0, 0, 1]);
  for (let i = 0; i < n; i++) {
    const t = pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    const side = new THREE.Vector3().crossVectors(t, N).normalize();
    const taper = Math.min(1, Math.min(i, n - 1 - i) / 3 + 0.35); const w = stroke.w * (stroke.pr?.[i] ?? 1) * taper * 0.5;
    const a = pts[i].clone().addScaledVector(side, w), b = pts[i].clone().addScaledVector(side, -w);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function fillGeo(stroke) { // preenchimento: polígono projetado no plano do traço
  const pts = stroke.pts.map((p) => new THREE.Vector3().fromArray(p)); if (pts.length < 3) return null;
  const N = new THREE.Vector3().fromArray(stroke.n || [0, 0, 1]); const q = new THREE.Quaternion().setFromUnitVectors(N, new THREE.Vector3(0, 0, 1));
  const flat = pts.map((p) => p.clone().applyQuaternion(q)); const tris = THREE.ShapeUtils.triangulateShape(flat.map((p) => new THREE.Vector2(p.x, p.y)), []);
  const g = new THREE.BufferGeometry().setFromPoints(pts); g.setIndex(tris.flat()); g.computeVertexNormals(); return g;
}

export function createPencilObject(name = 'Desenho') {
  const g = new THREE.Group(); g.name = name; g.userData = { id: nextId('gp'), kind: 'gpencil', gp: { frames: { 0: [] } } }; return g;
}
const frameAt = (gp, t) => { const keys = Object.keys(gp.frames).map(Number).sort((a, b) => a - b); let k = keys[0] ?? 0; for (const x of keys) if (x <= t + 1e-6) k = x; return { k, keys }; };

export function rebuild(obj) {
  [...obj.children].forEach((c) => { if (c.userData.gpStroke) { c.geometry.dispose(); obj.remove(c); } });
  const gp = obj.userData.gp; const { k, keys } = frameAt(gp, state.time);
  const add = (strokes, opacity, tint) => strokes.forEach((s, i) => {
    const geo = s.fill ? fillGeo(s) : ribbon(s); if (!geo) return;
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: tint || s.c, side: THREE.DoubleSide, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, polygonOffset: true, polygonOffsetFactor: -1 }));
    m.userData = { gpStroke: true, editHelper: true, strokeIndex: i, onion: opacity < 1 }; m.renderOrder = 5; m.castShadow = false; obj.add(m);
  });
  if (pencil.onion && state.workspace === 'draw') { const i = keys.indexOf(k); if (keys[i - 1] !== undefined) add(gp.frames[keys[i - 1]], 0.22, '#e5534b'); if (keys[i + 1] !== undefined) add(gp.frames[keys[i + 1]], 0.22, '#3dd6ff'); }
  add(gp.frames[k] || [], 1);
}
export function rehydratePencil(root = content) { root.traverse((o) => { if (o.userData.kind === 'gpencil') rebuild(o); }); }
bus.on('time', () => rehydratePencil()); bus.on('workspace', () => rehydratePencil());

function activeObject() {
  let o = state.selected?.userData.kind === 'gpencil' ? state.selected : null;
  if (!o) { o = createPencilObject(); content.add(o); bus.emit('scene:changed'); select(o); const obj = o; history.push({ label: 'Novo desenho', undo: () => { content.remove(obj); bus.emit('scene:changed'); }, redo: () => { content.add(obj); bus.emit('scene:changed'); } }); }
  return o;
}
// Quadro-chave novo no tempo atual (copia o anterior se pedido) — base da animação 2D
export function addFrame(copy = false) {
  const o = activeObject(); const gp = o.userData.gp; const t = +state.time.toFixed(3); const { k } = frameAt(gp, t);
  gp.frames[t] = copy ? JSON.parse(JSON.stringify(gp.frames[k] || [])) : []; rebuild(o); toast(`Quadro-chave de desenho em ${t.toFixed(2)}s`);
}

// ---------- Desenhar / apagar com o mouse ou caneta ----------
const ray = new THREE.Raycaster();
function planeFor(e) {
  const cam = getRenderCamera() || camera;
  if (pencil.plane === 'floor') return { plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), n: [0, 1, 0] };
  if (pencil.plane === 'front') return { plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), n: [0, 0, 1] };
  if (pencil.plane === 'surface') { const h = pickAt(e.clientX, e.clientY).find((x) => !x.object.userData.gpStroke && x.object.isMesh && !x.object.userData.proxy); if (h) { const n = h.face.normal.clone().transformDirection(h.object.matrixWorld); return { plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, h.point.clone().addScaledVector(n, 0.004)), n: n.toArray() }; } }
  const n = cam.getWorldDirection(new THREE.Vector3()).negate(); return { plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, cursor3D), n: n.toArray() };
}
function project(e, plane) {
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), getRenderCamera() || camera);
  return ray.ray.intersectPlane(plane, new THREE.Vector3());
}
export function initPencil() {
  const el = renderer.domElement; let cur = null, preview = null;
  el.addEventListener('pointerdown', (e) => {
    if (state.workspace !== 'draw' || e.button !== 0 || e.altKey) return;
    const o = activeObject();
    if (pencil.tool === 'erase') { eraseAt(o, e); cur = { erase: true, o }; return; }
    const { plane, n } = planeFor(e); const p = project(e, plane); if (!p) return;
    try { el.setPointerCapture(e.pointerId); } catch {}
    cur = { o, plane, s: { pts: [p.toArray()], pr: [e.pressure || 0.5], c: pencil.color, w: pencil.width, n, fill: pencil.fill } };
  });
  el.addEventListener('pointermove', (e) => {
    if (!cur) return; if (cur.erase) { if (e.buttons & 1) eraseAt(cur.o, e); return; }
    const p = project(e, cur.plane); if (!p) return; const last = new THREE.Vector3().fromArray(cur.s.pts[cur.s.pts.length - 1]);
    if (p.distanceTo(last) < pencil.width * 0.35) return;
    cur.s.pts.push(p.toArray()); cur.s.pr.push(e.pointerType === 'pen' ? e.pressure : 1);
    if (preview) { preview.geometry.dispose(); preview.parent?.remove(preview); }
    const g = ribbon(cur.s); if (g) { preview = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: cur.s.c, side: THREE.DoubleSide })); preview.userData.editHelper = true; cur.o.add(preview); }
  });
  el.addEventListener('pointerup', () => {
    if (!cur) return; const { o, s, erase } = cur; cur = null; if (preview) { preview.geometry.dispose(); preview.parent?.remove(preview); preview = null; }
    if (erase || s.pts.length < 2) return;
    s.pts = s.pts.map((p) => p.map((v) => +v.toFixed(4))); const gp = o.userData.gp; const { k } = frameAt(gp, state.time); (gp.frames[k] ||= []).push(s); rebuild(o);
    history.push({ label: 'Traço', undo: () => { gp.frames[k].splice(gp.frames[k].indexOf(s), 1); rebuild(o); }, redo: () => { gp.frames[k].push(s); rebuild(o); } });
  });
}
function eraseAt(o, e) {
  const hit = pickAt(e.clientX, e.clientY, [o]).find((h) => h.object.userData.gpStroke && !h.object.userData.onion); if (!hit) return;
  const gp = o.userData.gp; const { k } = frameAt(gp, state.time); const list = gp.frames[k]; const s = list[hit.object.userData.strokeIndex]; if (!s) return;
  const i = list.indexOf(s); list.splice(i, 1); rebuild(o);
  history.push({ label: 'Apagar traço', undo: () => { list.splice(i, 0, s); rebuild(o); }, redo: () => { list.splice(list.indexOf(s), 1); rebuild(o); } });
}
// Traço vindo da IA/MCP: lista de pontos 3D
export function addStroke(points, { color = pencil.color, width = pencil.width, fill = false, target } = {}) {
  const o = target || activeObject(); const gp = o.userData.gp; const { k } = frameAt(gp, state.time);
  const s = { pts: points.map((p) => p.map(Number)), c: color, w: width, n: [0, 0, 1], fill }; (gp.frames[k] ||= []).push(s); rebuild(o);
  history.push({ label: 'Traço', undo: () => { gp.frames[k].splice(gp.frames[k].indexOf(s), 1); rebuild(o); }, redo: () => { gp.frames[k].push(s); rebuild(o); } });
  return { object: o.name, strokes: gp.frames[k].length };
}
// Converte o quadro atual em malha real (exportável)
export function pencilToMesh(o = state.selected) {
  if (o?.userData.kind !== 'gpencil') { toast('Selecione um desenho'); return; }
  const geos = o.children.filter((c) => c.userData.gpStroke && !c.userData.onion).map((c) => c.geometry.clone()); if (!geos.length) return;
  {
    const m = new THREE.Mesh(mergeGeometries(geos.map((g) => g.index ? g.toNonIndexed() : g)), new THREE.MeshStandardMaterial({ color: o.children.find((c) => c.userData.gpStroke)?.material.color || '#222', side: THREE.DoubleSide }));
    m.name = o.name + '.malha'; m.userData = { id: nextId('mesh'), kind: 'mesh' }; m.position.copy(o.position); m.quaternion.copy(o.quaternion); m.scale.copy(o.scale);
    content.add(m); bus.emit('scene:changed'); select(m); history.push({ label: 'Desenho → malha', undo: () => { content.remove(m); bus.emit('scene:changed'); }, redo: () => { content.add(m); bus.emit('scene:changed'); } });
  }
}
