// Liga a pilha de modificadores aos objetos da cena: base (EditMesh) → pilha → geometria exibida.
// A base é salva no projeto (userData.modBase) para não aplicar os modificadores duas vezes ao reabrir.
import * as THREE from 'three';
import { EditMesh } from './editmesh.js';
import { evaluate, MODIFIERS, defaultParams, modContext } from './modstack.js';
import { state, bus } from './state.js';
import { edit } from './editmode.js';
import { history } from './history.js';
import { content } from './objects.js';
import { toast } from '../ui/toast.js';

// Shrinkwrap: alvo resolvido pelo nome, com a matriz alvo→local do objeto que está sendo avaliado
let evaluating = null;
modContext.findMesh = (name) => { if (!name || !evaluating) return null; let t = null; content.traverse((o) => { if (!t && o.isMesh && o.name === name && o !== evaluating) t = o; }); if (!t) return null; evaluating.updateMatrixWorld(); t.updateMatrixWorld(); return { geometry: t.geometry, toLocal: evaluating.matrixWorld.clone().invert().multiply(t.matrixWorld) }; };

const baseOf = (m) => {
  if (!m.__em) { m.__em = EditMesh.fromGeometry(m.geometry); m.__em.smooth = m.userData.smooth ?? false; }
  return m.__em;
};
const pack = (em) => ({ v: em.verts.flatMap((v) => [+v.x.toFixed(6), +v.y.toFixed(6), +v.z.toFixed(6)]), f: em.faces, u: em.uvs, s: em.smooth });
function unpack(d) { const em = new EditMesh(); for (let i = 0; i < d.v.length; i += 3) em.verts.push(new THREE.Vector3(d.v[i], d.v[i + 1], d.v[i + 2])); em.faces = d.f; em.uvs = d.u || d.f.map((f) => f.map(() => [0, 0])); em.smooth = !!d.s; return em; }

export function refresh(mesh) {
  const stack = mesh.userData.modifiers || [];
  if (edit.mesh === mesh) return; // no modo de edição mostramos a "gaiola" (base)
  const base = baseOf(mesh);
  if (stack.length) mesh.userData.modBase = pack(base); else delete mesh.userData.modBase;
  evaluating = mesh; let out; try { out = evaluate(base, stack); } finally { evaluating = null; }
  mesh.geometry.dispose(); mesh.geometry = out.toGeometry();
  bus.emit('modifiers:changed', mesh);
}

function record(mesh, label, fn) {
  const before = JSON.parse(JSON.stringify(mesh.userData.modifiers || [])); const baseBefore = baseOf(mesh).clone();
  fn(); refresh(mesh);
  const after = JSON.parse(JSON.stringify(mesh.userData.modifiers || [])); const baseAfter = baseOf(mesh).clone();
  history.push({ label, undo: () => { mesh.userData.modifiers = JSON.parse(JSON.stringify(before)); mesh.__em = baseBefore.clone(); refresh(mesh); }, redo: () => { mesh.userData.modifiers = JSON.parse(JSON.stringify(after)); mesh.__em = baseAfter.clone(); refresh(mesh); } });
}

export function addModifier(mesh, type) {
  if (!mesh?.isMesh || mesh.isSkinnedMesh) { toast('Modificadores precisam de uma malha'); return; }
  baseOf(mesh); // garante a base ANTES do 1º modificador
  record(mesh, 'Adicionar ' + MODIFIERS[type].label, () => { (mesh.userData.modifiers ||= []).push({ type, enabled: true, params: defaultParams(type) }); });
}
export function setParam(mesh, i, key, value) { record(mesh, 'Ajustar modificador', () => { mesh.userData.modifiers[i].params[key] = value; }); }
export function toggleModifier(mesh, i) { record(mesh, 'Ligar/desligar modificador', () => { const m = mesh.userData.modifiers[i]; m.enabled = m.enabled === false; }); }
export function moveModifier(mesh, i, d) { record(mesh, 'Reordenar modificador', () => { const s = mesh.userData.modifiers; const j = i + d; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j], s[i]]; }); }
export function removeModifier(mesh, i) { record(mesh, 'Remover modificador', () => { mesh.userData.modifiers.splice(i, 1); }); }
// "Aplicar": incorpora o modificador na malha base (como no Blender)
export function applyModifierStack(mesh, i) {
  record(mesh, 'Aplicar modificador', () => { const s = mesh.userData.modifiers; mesh.__em = evaluate(baseOf(mesh), [s[i]]); s.splice(i, 1); });
  toast('Modificador aplicado na malha');
}

// Ao reabrir um projeto: reconstrói a base a partir do que foi salvo
export function rehydrateModifiers(root = content) {
  root.traverse((o) => { if (o.isMesh && o.userData.modBase) { o.__em = unpack(o.userData.modBase); refresh(o); } });
}
// Ao sair do modo de edição, reavalia a pilha
bus.on('mode', (m) => { if (m === 'object' && state.selected?.isMesh && state.selected.userData.modifiers?.length) refresh(state.selected); });
