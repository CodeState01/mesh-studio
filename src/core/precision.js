// Precisão: transformação modal com valores digitados (G/R/S → X/Y/Z → número → Enter),
// snap por incremento/grade/vértice, cursor 3D e régua de medição.
import * as THREE from 'three';
import { state, bus, precision } from './state.js';
import { renderer, camera, getRenderCamera, gizmo, orbit, pickAt, cursor3D, placePivot } from './viewport.js';
import { content, helpers } from './objects.js';
import { history } from './history.js';

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const AXIS_COLOR = { x: '#e5534b', y: '#7bb33a', z: '#4a8ff0' };
let editApi = null; // registrado pelo modo de edição: { begin() → {points, applyMatrix(T), commit(label), cancel()} }
export const registerEditTransform = (api) => (editApi = api);
export const getEditApi = () => editApi;

const cam = () => getRenderCamera() || camera;
function toScreen(v) {
  const r = renderer.domElement.getBoundingClientRect(); const p = v.clone().project(cam());
  return new THREE.Vector2(r.left + ((p.x + 1) / 2) * r.width, r.top + ((1 - p.y) / 2) * r.height);
}
function rayAt(x, y) {
  const r = renderer.domElement.getBoundingClientRect(); const rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), cam()); return rc.ray;
}
const fmt = (v, d = precision.decimals) => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(d);

// ---------- HUD ----------
let hud;
function showHud(html) {
  if (!hud) { hud = document.createElement('div'); hud.className = 'modal-hud'; document.querySelector('#viewport').appendChild(hud); }
  hud.innerHTML = html; hud.classList.add('on');
}
const hideHud = () => hud?.classList.remove('on');

// ---------- Linha de eixo (guia visual durante restrição) ----------
let axisLine;
function showAxis(axis, origin, local) {
  if (!axisLine) {
    axisLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ depthTest: false, transparent: true }));
    axisLine.renderOrder = 999; axisLine.userData.noPick = true; helpers.add(axisLine);
  }
  axisLine.visible = !!axis; if (!axis) return;
  const d = AXES[axis].clone(); if (local) d.applyQuaternion(local);
  axisLine.geometry.setFromPoints([origin.clone().addScaledVector(d, -1000), origin.clone().addScaledVector(d, 1000)]);
  axisLine.material.color.set(AXIS_COLOR[axis]);
}

// ---------- Snap de vértice: vértice mais próximo do mouse (em pixels) ----------
function nearestVertex(x, y, exclude = []) {
  let best = null, bestD = 18; const v = new THREE.Vector3();
  content.traverse((o) => {
    if (!o.isMesh || o.userData.proxy || exclude.some((e) => e === o || e.getObjectById?.(o.id))) return;
    const p = o.geometry.attributes.position; if (!p || p.count > 60000) return;
    o.updateMatrixWorld();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      const s = toScreen(v); const d = Math.hypot(s.x - x, s.y - y);
      if (d < bestD) { bestD = d; best = v.clone(); }
    }
  });
  return best;
}

// ---------- Transformação modal ----------
let modal = null;
export const isModal = () => !!modal;

export function startModal(kind, mouse) {
  if (modal) return;
  const edit = state.mode === 'edit' && editApi;
  let targets, et;
  if (edit) { et = editApi.begin(); if (!et || !et.points.length) return; }
  else { targets = state.selection.slice(); if (!targets.length) return; }

  // Pivô
  const pivot = new THREE.Vector3();
  if (precision.pivot === 'cursor') pivot.copy(cursor3D);
  else if (edit) { et.points.forEach((p) => pivot.add(p)); pivot.divideScalar(et.points.length); }
  else if (precision.pivot === 'active') state.selected.getWorldPosition(pivot);
  else { targets.forEach((o) => pivot.add(o.getWorldPosition(new THREE.Vector3()))); pivot.divideScalar(targets.length); }
  const localQ = !edit && precision.orientation === 'local' ? state.selected.quaternion.clone() : null;

  modal = {
    kind, edit, et, targets, pivot, localQ, axis: null, typed: '', start: mouse.clone(), mouse: mouse.clone(),
    mats: targets?.map((o) => o.matrix.clone()), snaps: targets?.map((o) => history.snapshot(o)),
    planeHit0: null,
  };
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(cam().getWorldDirection(new THREE.Vector3()), pivot);
  modal.plane = plane; modal.planeHit0 = rayAt(mouse.x, mouse.y).intersectPlane(plane, new THREE.Vector3()) || pivot.clone();
  gizmo.enabled = false; orbit.enabled = false;
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('contextmenu', block, true);
  update();
}
const block = (e) => { e.preventDefault(); e.stopPropagation(); };

function onMove(e) { modal.mouse.set(e.clientX, e.clientY); modal.ctrl = e.ctrlKey; update(); }
function onDown(e) { e.preventDefault(); e.stopPropagation(); if (e.button === 0) finish(true); else finish(false); }
function onKey(e) {
  e.preventDefault(); e.stopPropagation();
  const k = e.key.toLowerCase();
  if (k === 'escape') return finish(false);
  if (k === 'enter' || k === ' ') return finish(true);
  if (k === 'x' || k === 'y' || k === 'z') { modal.axis = modal.axis === k ? null : k; return update(); }
  if (k === 'g' || k === 'r' || k === 's') { const m = { g: 'move', r: 'rotate', s: 'scale' }[k]; if (m !== modal.kind) { restore(); modal.kind = m; modal.typed = ''; } return update(); }
  if (k === 'backspace') { modal.typed = modal.typed.slice(0, -1); return update(); }
  if (k === 'control') { modal.ctrl = true; return update(); }
  if (/^[0-9.]$/.test(k) || (k === '-' && !modal.typed)) { modal.typed += k; return update(); }
  if (k === '-' ) { modal.typed = modal.typed.startsWith('-') ? modal.typed.slice(1) : '-' + modal.typed; return update(); }
}

function restore() {
  if (modal.edit) modal.et.applyMatrix(new THREE.Matrix4());
  else modal.targets.forEach((o, i) => modal.mats[i].decompose(o.position, o.quaternion, o.scale));
}

function update() {
  const m = modal; const snapOn = precision.snap !== !!m.ctrl;
  const typedVal = m.typed && m.typed !== '-' && m.typed !== '.' ? parseFloat(m.typed) : null;
  const axisDir = m.axis ? AXES[m.axis].clone().applyQuaternion(m.localQ || new THREE.Quaternion()) : null;
  let T = new THREE.Matrix4(); let label = '';

  if (m.kind === 'move') {
    let d;
    if (typedVal !== null) d = (axisDir || AXES.x).clone().multiplyScalar(typedVal);
    else {
      const hit = rayAt(m.mouse.x, m.mouse.y).intersectPlane(m.plane, new THREE.Vector3()) || m.planeHit0;
      d = hit.sub(m.planeHit0);
      if (snapOn && precision.snapTarget === 'vertex') {
        const v = nearestVertex(m.mouse.x, m.mouse.y, m.targets || []); if (v) d = v.sub(m.pivot);
      } else if (snapOn) {
        const st = precision.snapTarget === 'grid' ? 1 : precision.moveStep;
        if (precision.snapTarget === 'grid') { const tgt = m.pivot.clone().add(d); tgt.set(Math.round(tgt.x / st) * st, Math.round(tgt.y / st) * st, Math.round(tgt.z / st) * st); d = tgt.sub(m.pivot); }
        else d.set(Math.round(d.x / st) * st, Math.round(d.y / st) * st, Math.round(d.z / st) * st);
      }
      if (axisDir) d = axisDir.clone().multiplyScalar(d.dot(axisDir));
    }
    T.makeTranslation(d.x, d.y, d.z);
    label = `${icon('move')} Mover ${m.axis ? `<b style="color:${AXIS_COLOR[m.axis]}">${m.axis.toUpperCase()}</b>` : ''} ${fmt(d.x)} · ${fmt(d.y)} · ${fmt(d.z)} ${precision.unit} <span>· distância ${fmt(d.length())} ${precision.unit}</span>`;
  } else if (m.kind === 'rotate') {
    const ps = toScreen(m.pivot);
    let ang = typedVal !== null ? THREE.MathUtils.degToRad(typedVal)
      : -(Math.atan2(m.mouse.y - ps.y, m.mouse.x - ps.x) - Math.atan2(m.start.y - ps.y, m.start.x - ps.x));
    if (snapOn && typedVal === null) { const st = THREE.MathUtils.degToRad(precision.rotateStep); ang = Math.round(ang / st) * st; }
    const ax = axisDir || cam().getWorldDirection(new THREE.Vector3()).negate();
    T = new THREE.Matrix4().makeTranslation(m.pivot.x, m.pivot.y, m.pivot.z).multiply(new THREE.Matrix4().makeRotationAxis(ax.normalize(), ang)).multiply(new THREE.Matrix4().makeTranslation(-m.pivot.x, -m.pivot.y, -m.pivot.z));
    label = `${icon('rotate')} Girar ${m.axis ? `<b style="color:${AXIS_COLOR[m.axis]}">${m.axis.toUpperCase()}</b>` : 'vista'} ${fmt(THREE.MathUtils.radToDeg(ang), 1)}°`;
  } else {
    const ps = toScreen(m.pivot);
    let f = typedVal !== null ? typedVal : Math.max(0.001, m.mouse.distanceTo(ps) / Math.max(1, m.start.distanceTo(ps)));
    if (snapOn && typedVal === null) f = Math.max(precision.scaleStep, Math.round(f / precision.scaleStep) * precision.scaleStep);
    const s = m.axis ? new THREE.Vector3(1, 1, 1).setComponent('xyz'.indexOf(m.axis), f) : new THREE.Vector3(f, f, f);
    const R = m.localQ ? new THREE.Matrix4().makeRotationFromQuaternion(m.localQ) : new THREE.Matrix4();
    T = new THREE.Matrix4().makeTranslation(m.pivot.x, m.pivot.y, m.pivot.z).multiply(R).multiply(new THREE.Matrix4().makeScale(s.x, s.y, s.z)).multiply(R.clone().invert()).multiply(new THREE.Matrix4().makeTranslation(-m.pivot.x, -m.pivot.y, -m.pivot.z));
    label = `${icon('scale')} Escalar ${m.axis ? `<b style="color:${AXIS_COLOR[m.axis]}">${m.axis.toUpperCase()}</b>` : ''} ×${fmt(f)}`;
  }

  if (m.edit) m.et.applyMatrix(T);
  else m.targets.forEach((o, i) => {
    if (precision.pivot === 'individual' && m.kind !== 'move') {
      const p = new THREE.Vector3(); m.mats[i].decompose(p, new THREE.Quaternion(), new THREE.Vector3());
      const local = new THREE.Matrix4().makeTranslation(p.x - m.pivot.x, p.y - m.pivot.y, p.z - m.pivot.z);
      const Ti = local.clone().multiply(T).multiply(local.clone().invert());
      Ti.multiply(m.mats[i]).decompose(o.position, o.quaternion, o.scale);
    } else T.clone().multiply(m.mats[i]).decompose(o.position, o.quaternion, o.scale);
  });
  showAxis(m.axis, m.pivot, m.localQ);
  showHud(`${label}${m.typed ? ` <kbd>${m.typed}</kbd>` : ''}<em>X Y Z eixo · digite um valor · Ctrl snap · Enter confirma · Esc cancela</em>`);
  bus.emit('object:transforming', state.selected);
}

function finish(ok) {
  const m = modal; modal = null;
  window.removeEventListener('pointermove', onMove, true);
  window.removeEventListener('pointerdown', onDown, true);
  window.removeEventListener('keydown', onKey, true);
  setTimeout(() => window.removeEventListener('contextmenu', block, true), 50);
  hideHud(); showAxis(null); orbit.enabled = true; gizmo.enabled = ['move', 'rotate', 'scale'].includes(state.tool);
  const label = { move: 'Mover', rotate: 'Girar', scale: 'Escalar' }[m.kind];
  if (m.edit) { ok ? m.et.commit(label) : m.et.cancel(); return; }
  if (!ok) { m.targets.forEach((o, i) => m.mats[i].decompose(o.position, o.quaternion, o.scale)); }
  else {
    const rec = m.targets.map((o, i) => [o, m.snaps[i], history.snapshot(o)]);
    history.push({ label: label + ' (preciso)', undo: () => rec.forEach(([o, b]) => history.restore(o, b)), redo: () => rec.forEach(([o, , a]) => history.restore(o, a)) });
  }
  placePivot(); bus.emit('object:transformed', state.selected);
}

// ---------- Cursor 3D ----------
let cursorMesh;
export function initPrecision() {
  cursorMesh = new THREE.Group(); cursorMesh.name = '__cursor3d__';
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.11, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, side: THREE.DoubleSide }));
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.13, 32, 1, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#e5534b', depthTest: false, side: THREE.DoubleSide }));
  cursorMesh.add(ring, ring2); cursorMesh.renderOrder = 999; cursorMesh.traverse((o) => { o.renderOrder = 999; o.userData.noPick = true; });
  helpers.add(cursorMesh);
  // Mantém o cursor sempre de frente para a câmera e com tamanho constante na tela
  const loop = () => { requestAnimationFrame(loop); cursorMesh.position.copy(cursor3D); cursorMesh.quaternion.copy(cam().quaternion); cursorMesh.scale.setScalar(cam().position.distanceTo(cursor3D) * 0.06); };
  loop();
  const el = renderer.domElement;
  el.addEventListener('contextmenu', (e) => { if (e.shiftKey) { e.preventDefault(); setCursorAt(e.clientX, e.clientY); } });
  bus.on('viewport:click', (e) => { if (state.tool === 'cursor') setCursorAt(e.clientX, e.clientY); if (state.tool === 'measure') measureClick(e); });
  initMeasure();
}
export function setCursorAt(x, y) {
  const hit = pickAt(x, y).find((h) => !h.object.userData.noPick && !h.object.userData.proxy);
  const p = hit ? hit.point : rayAt(x, y).intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
  if (p) { const snap = precision.snap && precision.snapTarget === 'vertex' ? nearestVertex(x, y) : null; cursor3D.copy(snap || p); bus.emit('cursor3d', cursor3D); if (precision.pivot === 'cursor') placePivot(); }
}
export function cursorToSelection() { if (!state.selection.length) return; const c = new THREE.Vector3(); state.selection.forEach((o) => c.add(o.getWorldPosition(new THREE.Vector3()))); cursor3D.copy(c.divideScalar(state.selection.length)); bus.emit('cursor3d', cursor3D); }
export function cursorToOrigin() { cursor3D.set(0, 0, 0); bus.emit('cursor3d', cursor3D); }
export function selectionToCursor() {
  const rec = state.selection.map((o) => [o, history.snapshot(o)]);
  state.selection.forEach((o) => o.position.copy(cursor3D));
  const after = rec.map(([o]) => history.snapshot(o));
  history.push({ label: 'Seleção → cursor', undo: () => rec.forEach(([o, s]) => history.restore(o, s)), redo: () => rec.forEach(([o], i) => history.restore(o, after[i])) });
  placePivot(); bus.emit('object:transformed', state.selected);
}

// ---------- Régua ----------
const measures = []; let pending = null, labelsEl;
function initMeasure() {
  labelsEl = document.createElement('div'); labelsEl.className = 'measure-labels'; document.querySelector('#viewport').appendChild(labelsEl);
  const tick = () => {
    requestAnimationFrame(tick);
    if (!measures.length && !pending) { labelsEl.innerHTML = ''; return; }
    const r = renderer.domElement.getBoundingClientRect(); const vr = labelsEl.parentElement.getBoundingClientRect();
    labelsEl.innerHTML = measures.map((m) => { const mid = toScreen(m.a.clone().add(m.b).multiplyScalar(0.5)); const d = m.a.distanceTo(m.b);
      return `<span style="left:${mid.x - vr.left}px;top:${mid.y - vr.top}px">${fmt(d)} ${precision.unit}<small>Δ ${fmt(m.b.x - m.a.x, 2)} · ${fmt(m.b.y - m.a.y, 2)} · ${fmt(m.b.z - m.a.z, 2)}</small></span>`; }).join('');
    void r;
  };
  tick();
}
function measureClick(e) {
  const hit = pickAt(e.clientX, e.clientY).find((h) => !h.object.userData.noPick && !h.object.userData.proxy);
  let p = (precision.snap ? nearestVertex(e.clientX, e.clientY) : null) || hit?.point || rayAt(e.clientX, e.clientY).intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
  if (!p) return;
  if (!pending) { pending = p.clone(); return; }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([pending, p]), new THREE.LineDashedMaterial({ color: '#ffd23d', dashSize: 0.08, gapSize: 0.05, depthTest: false }));
  line.computeLineDistances(); line.renderOrder = 998; line.userData.noPick = true; helpers.add(line);
  measures.push({ a: pending, b: p.clone(), line }); pending = null;
  bus.emit('measure', measures);
}
export function clearMeasures() { measures.forEach((m) => helpers.remove(m.line)); measures.length = 0; pending = null; }

// Ícone inline mínimo para o HUD (evita import circular com a UI)
function icon(n) { return { move: '✥', rotate: '⟳', scale: '⤢' }[n] || ''; }
