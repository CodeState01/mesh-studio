// Importação/exportação de modelos e salvamento de projeto (.orbe).
// O formato de projeto é versionado; MIGRATIONS converte arquivos antigos
// quando o app for atualizado — base para "atualizações futuras" sem quebrar projetos.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { content, addToScene, makeMaterial } from '../core/objects.js';
import { state, bus, nextId, select } from '../core/state.js';
import { applyEnvironment } from '../core/viewport.js';
import { serializeAnim, loadAnim } from '../anim/timeline.js';
import { serializeVideo, loadVideo } from '../video/editor.js';
import { rehydrateVFX } from '../fx/vfx.js';

export const PROJECT_VERSION = 1;
const MIGRATIONS = {
  // 0: (p) => { ...converter v0 → v1...; p.version = 1; return p; },
};

async function save(name, data, filters, binary = false) {
  if (window.orbe?.file) return window.orbe.file.save({ name, data, filters, binary });
  const blob = new Blob([data]); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click(); return name;
}

async function open(filters, accept) {
  if (window.orbe?.file) return window.orbe.file.open({ filters });
  return new Promise((res) => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
    i.onchange = async () => { const f = i.files[0]; if (!f) return res(null); res({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }); };
    i.click();
  });
}

// Clone limpo para exportação: sem proxies/helpers de editor.
function exportRoot() {
  const root = content.clone(true);
  const drop = []; root.traverse((o) => { if (o.userData.proxy || o.userData.editHelper || o.isPoints) drop.push(o); });
  drop.forEach((o) => o.parent?.remove(o)); root.name = 'Orbe';
  return root;
}

export async function exportModel(fmt) {
  const root = exportRoot();
  if (fmt === 'glb' || fmt === 'gltf') {
    const out = await new GLTFExporter().parseAsync(root, { binary: fmt === 'glb' });
    return fmt === 'glb' ? save('cena.glb', new Uint8Array(out), [{ name: 'GLB', extensions: ['glb'] }], true)
      : save('cena.gltf', JSON.stringify(out), [{ name: 'glTF', extensions: ['gltf'] }]);
  }
  if (fmt === 'obj') return save('cena.obj', new OBJExporter().parse(root), [{ name: 'OBJ', extensions: ['obj'] }]);
  if (fmt === 'stl') return save('cena.stl', new STLExporter().parse(root), [{ name: 'STL', extensions: ['stl'] }]);
}

export async function importModel() {
  const f = await open([{ name: 'Modelos 3D', extensions: ['glb', 'gltf', 'obj', 'fbx', 'stl'] }], '.glb,.gltf,.obj,.fbx,.stl');
  if (!f) return null;
  const ext = f.name.split('.').pop().toLowerCase();
  const buf = f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength);
  let obj;
  if (ext === 'glb' || ext === 'gltf') obj = (await new GLTFLoader().parseAsync(ext === 'glb' ? buf : new TextDecoder().decode(buf), '')).scene;
  else if (ext === 'obj') obj = new OBJLoader().parse(new TextDecoder().decode(buf));
  else if (ext === 'fbx') obj = new FBXLoader().parse(buf, '');
  else if (ext === 'stl') obj = new THREE.Mesh(new STLLoader().parse(buf), makeMaterial());
  // Normaliza escala: cabe numa caixa de ~2 unidades e apoia no chão.
  const box = new THREE.Box3().setFromObject(obj); const size = box.getSize(new THREE.Vector3()).length();
  if (size > 0) { const s = 2.5 / size; obj.scale.multiplyScalar(s); }
  const b2 = new THREE.Box3().setFromObject(obj); obj.position.y -= b2.min.y;
  obj.name = f.name.replace(/\.[^.]+$/, ''); obj.userData.id = nextId('imp'); obj.userData.kind = 'import';
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  return addToScene(obj);
}

// ---------- Projeto ----------
export function serializeProject() {
  const root = content.clone(true);
  const drop = []; root.traverse((o) => { if (o.userData.editHelper) drop.push(o); }); drop.forEach((o) => o.parent.remove(o));
  root.traverse((o) => { delete o.userData.dispose; });
  return {
    app: 'orbe-studio', version: PROJECT_VERSION, savedAt: new Date().toISOString(),
    scene: root.toJSON(), env: state.env, anim: serializeAnim(), video: serializeVideo(),
  };
}

export async function saveProject() {
  return save('projeto.orbe', JSON.stringify(serializeProject()), [{ name: 'Projeto Orbe', extensions: ['orbe'] }]);
}

export async function openProject() {
  const f = await open([{ name: 'Projeto Orbe', extensions: ['orbe'] }], '.orbe');
  if (!f) return; loadProject(JSON.parse(new TextDecoder().decode(f.data)));
}

export async function loadProject(p) {
  while ((p.version ?? 0) < PROJECT_VERSION) {
    const m = MIGRATIONS[p.version ?? 0]; if (!m) throw new Error(`Sem migração para v${p.version}`); p = m(p);
  }
  if (p.version > PROJECT_VERSION) throw new Error('Projeto criado numa versão mais nova do Orbe. Atualize o app.');
  const root = await new THREE.ObjectLoader().parseAsync(p.scene);
  select(null);
  [...content.children].forEach((c) => { c.userData.dispose?.(); content.remove(c); });
  [...root.children].forEach((c) => content.add(c));
  rehydrateVFX();
  applyEnvironment(p.env || {});
  loadAnim(p.anim); loadVideo(p.video);
  bus.emit('scene:changed');
}

// Autosave local (recuperação de falhas)
export function startAutosave() {
  setInterval(() => { try { localStorage.setItem('orbe:autosave', JSON.stringify(serializeProject())); } catch {} }, 60_000);
}
export function restoreAutosave() {
  const raw = localStorage.getItem('orbe:autosave'); if (!raw) return false;
  loadProject(JSON.parse(raw)); return true;
}
