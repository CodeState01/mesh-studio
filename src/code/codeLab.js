// Code Lab: escreva JavaScript que gera 3D e veja a prévia ao vivo.
// O código roda numa cena de prévia isolada; "Enviar para a cena" copia o resultado.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { content, makeMaterial, addToScene } from '../core/objects.js';
import { bus, nextId } from '../core/state.js';
import { history } from '../core/history.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';

export const TEMPLATES = {
  'Espiral de cubos': `// Cada cubo gira um pouco mais e sobe — mude os números!
for (let i = 0; i < 60; i++) {
  const a = i * 0.35;
  const c = box(0.3, 0.3, 0.3, \`hsl(\${i * 6}, 70%, 60%)\`);
  c.position.set(Math.cos(a) * 2, i * 0.06, Math.sin(a) * 2);
  c.rotation.y = -a;
}`,
  'Terreno com ruído': `// Plano deformado por ondas — um terreno procedural
const g = new THREE.PlaneGeometry(8, 8, 120, 120).rotateX(-Math.PI / 2);
const p = g.attributes.position;
for (let i = 0; i < p.count; i++) {
  const x = p.getX(i), z = p.getZ(i);
  p.setY(i, Math.sin(x * 1.3) * Math.cos(z * 1.1) * 0.5 + Math.sin(x * 3 + z * 2) * 0.12);
}
g.computeVertexNormals();
add(new THREE.Mesh(g, mat('#6f9a5a', { flatShading: true })));`,
  'Galáxia de partículas': `// 20 mil pontos em braços espirais
const n = 20000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
const a = new THREE.Color('#ff8a4c'), b = new THREE.Color('#3d6bff');
for (let i = 0; i < n; i++) {
  const r = Math.random() * 4, arm = (i % 3) * (Math.PI * 2 / 3), s = r * 1.2 + arm;
  const j = () => (Math.random() - 0.5) * 0.4 * (4 - r) / 4;
  pos.set([Math.cos(s) * r + j(), j() * 0.5 + 1, Math.sin(s) * r + j()], i * 3);
  const c = a.clone().lerp(b, r / 4); col.set([c.r, c.g, c.b], i * 3);
}
const g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
g.setAttribute('color', new THREE.BufferAttribute(col, 3));
const pts = add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.02, vertexColors: true })));
onFrame((t) => (pts.rotation.y = t * 0.1));`,
  'Torre procedural': `// Andares empilhados e torcidos
for (let i = 0; i < 24; i++) {
  const f = box(1.6 - i * 0.04, 0.18, 1.6 - i * 0.04, i % 2 ? '#e8e2d8' : '#2a2c33');
  f.position.y = 0.09 + i * 0.2;
  f.rotation.y = i * 0.08;
}`,
  'Órbitas animadas': `// onFrame(t) roda a cada quadro — t = segundos
const sol = sphere(0.5, '#ffb347'); sol.position.y = 1;
sol.material.emissive.set('#ff8a00'); sol.material.emissiveIntensity = 1.2;
const planetas = [0.9, 1.5, 2.2, 3].map((r, i) => {
  const p = sphere(0.12 + i * 0.04, ['#9fd2ff', '#e2703f', '#7bd389', '#c9a0ff'][i]);
  return { p, r, v: 1.4 / (i + 1) };
});
onFrame((t) => planetas.forEach(({ p, r, v }) => p.position.set(Math.cos(t * v) * r, 1, Math.sin(t * v) * r)));`,
  'Árvore fractal': `// Recursão: cada galho gera dois menores
function galho(pai, comp, prof) {
  if (prof === 0) return;
  const g = new THREE.Group();
  const c = cylinder(0.04 * prof, comp, prof > 2 ? '#6b4a2f' : '#5c9a4a');
  c.position.y = comp / 2; g.add(c);
  pai.add(g);
  [-0.5, 0.5].forEach((ang, k) => {
    const filho = new THREE.Group();
    filho.position.y = comp; filho.rotation.z = ang; filho.rotation.y = k * 1.7 + prof;
    g.add(filho); galho(filho, comp * 0.72, prof - 1);
  });
}
const raiz = add(new THREE.Group()); galho(raiz, 1, 7);`,
};

let view, renderer, scene, camera, controls, group, frameFns = [], clock, logEl, autoRun = true, raf;

const API_DOC = `add(obj) · box(w,h,d,cor) · sphere(r,cor) · cylinder(r,h,cor) · mat(cor,{...}) · onFrame(t => …) · log(...) · THREE`;

function buildPreview(host) {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
  host.appendChild(renderer.domElement);
  scene = new THREE.Scene(); scene.background = new THREE.Color('#141518');
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const sun = new THREE.DirectionalLight('#fff', 1.4); sun.position.set(4, 6, 3); scene.add(sun);
  const grid = new THREE.GridHelper(20, 40, 0x2c2e34, 0x222429); scene.add(grid);
  camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200); camera.position.set(6, 5, 7);
  controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, 1, 0); controls.enableDamping = true;
  group = new THREE.Group(); scene.add(group); clock = new THREE.Clock();
  new ResizeObserver(() => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }).observe(host);
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!renderer.domElement.isConnected) return;
    const t = clock.getElapsedTime();
    for (const f of frameFns) { try { f(t); } catch (e) { log('erro em onFrame: ' + e.message, true); frameFns = []; } }
    controls.update(); renderer.render(scene, camera);
  };
  loop();
}

function log(msg, err = false) {
  if (!logEl) return;
  const d = document.createElement('div'); d.className = err ? 'err' : ''; d.textContent = msg; logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight;
}

function run(code) {
  group.clear(); frameFns = []; logEl.innerHTML = ''; clock.start();
  const add = (o) => { group.add(o); return o; };
  const mat = (color = '#c9ccd3', o = {}) => Object.assign(makeMaterial(color), o);
  const api = {
    THREE, add, mat, log: (...a) => log(a.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ')),
    box: (w = 1, h = 1, d = 1, c) => add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c))),
    sphere: (r = 0.5, c) => add(new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), mat(c))),
    cylinder: (r = 0.3, h = 1, c) => new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, h, 12), mat(c)),
    onFrame: (fn) => frameFns.push(fn),
  };
  const t0 = performance.now();
  try {
    new Function(...Object.keys(api), `"use strict";\n${code}`)(...Object.values(api));
    let tris = 0; group.traverse((o) => { if (o.geometry) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    log(`✓ executado em ${(performance.now() - t0).toFixed(1)} ms · ${group.children.length} objetos · ${Math.round(tris).toLocaleString()} triângulos`);
  } catch (e) { log('✗ ' + e.message, true); }
  try { localStorage.setItem('argila:code', code); } catch {}
}

function sendToScene() {
  if (!group.children.length) { toast('Nada para enviar — execute o código primeiro'); return; }
  const root = new THREE.Group(); root.name = 'Código'; root.userData = { id: nextId('code'), kind: 'import' };
  group.children.forEach((c) => root.add(c.clone(true)));
  root.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  addToScene(root);
  history.push({ label: 'Código → cena', undo: () => { content.remove(root); bus.emit('scene:changed'); }, redo: () => { content.add(root); bus.emit('scene:changed'); } });
  toast('Enviado para a cena (animações onFrame ficam só na prévia)');
}

export function renderCodeLab(el) {
  let saved = ''; try { saved = localStorage.getItem('argila:code') || ''; } catch {}
  el.innerHTML = `<div class="code-lab">
    <div class="code-bar">
      <select class="field" id="cl-tpl" style="width:200px"><option value="">Modelos de código…</option>${Object.keys(TEMPLATES).map((k) => `<option>${k}</option>`).join('')}</select>
      <button class="btn primary sm" id="cl-run">${icon('play', 14)} Executar <kbd>Ctrl+Enter</kbd></button>
      <label class="toggle"><input type="checkbox" id="cl-auto" ${autoRun ? 'checked' : ''}><span></span> Prévia ao vivo</label>
      <span class="spacer"></span>
      <button class="btn sm" id="cl-copy">${icon('copy', 14)} Copiar</button>
      <button class="btn sm" id="cl-send">${icon('upload', 14)} Enviar para a cena</button>
    </div>
    <div class="code-split">
      <div class="code-editor" id="cl-editor"></div>
      <div class="code-preview"><div id="cl-canvas"></div><div class="code-api">${API_DOC}</div></div>
    </div>
    <div class="code-console" id="cl-log"></div></div>`;
  logEl = el.querySelector('#cl-log');
  const host = el.querySelector('#cl-canvas');
  if (!renderer) buildPreview(host); else host.appendChild(renderer.domElement);
  let timer;
  view = new EditorView({
    doc: saved || TEMPLATES['Espiral de cubos'],
    parent: el.querySelector('#cl-editor'),
    extensions: [basicSetup, javascript(), oneDark,
      keymap.of([{ key: 'Mod-Enter', run: () => { run(view.state.doc.toString()); return true; } }]),
      EditorView.updateListener.of((u) => { if (u.docChanged && autoRun) { clearTimeout(timer); timer = setTimeout(() => run(view.state.doc.toString()), 450); } }),
      EditorView.theme({ '&': { height: '100%', fontSize: '13px' }, '.cm-scroller': { fontFamily: 'var(--mono)' } })],
  });
  el.querySelector('.code-editor').addEventListener('keydown', (e) => e.stopPropagation());
  el.querySelector('#cl-run').onclick = () => run(view.state.doc.toString());
  el.querySelector('#cl-auto').onchange = (e) => (autoRun = e.target.checked);
  el.querySelector('#cl-send').onclick = sendToScene;
  el.querySelector('#cl-copy').onclick = () => { navigator.clipboard.writeText(view.state.doc.toString()); toast('Código copiado'); };
  el.querySelector('#cl-tpl').onchange = (e) => {
    const t = TEMPLATES[e.target.value]; if (!t) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t } }); run(t); e.target.value = '';
  };
  run(view.state.doc.toString());
}
