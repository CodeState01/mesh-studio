// Viewport: renderer, câmera do editor, navegação estilo DCC, gizmo, seleção,
// modos de sombreamento e pós-processamento (bloom + contorno de seleção).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { ViewHelper } from 'three/addons/helpers/ViewHelper.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { content, helpers, topLevel } from './objects.js';
import { state, bus, select } from './state.js';
import { history } from './history.js';

export const scene = new THREE.Scene();
export let renderer, camera, orbit, gizmo, composer, bloomPass, outlinePass, viewHelper;
export const frameHooks = new Set(); // (dt, t) => void — VFX, timeline, etc.
let renderCamera = null; // câmera da cena usada no modo "ver pela câmera"
let container;

const SKIES = {
  studio: ['#2a2d33', '#141518'],
  sunset: ['#f0a36b', '#3a2440'],
  night: ['#0d1426', '#04060c'],
  overcast: ['#9aa2ad', '#4e545c'],
};

function gradientTexture([top, bottom]) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function initViewport(el) {
  container = el;
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(40, 1, 0.05, 1000);
  camera.position.set(10, 7, 11);

  // Iluminação de estúdio via PMREM — reflexos realistas mesmo sem HDRI.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(content, helpers);

  // Grade dupla (menor/maior) + eixos X/Z coloridos, como em ferramentas DCC.
  const minor = new THREE.GridHelper(60, 120, 0x2a2d33, 0x22252a);
  const major = new THREE.GridHelper(60, 12, 0x34373e, 0x34373e);
  minor.material.transparent = major.material.transparent = true;
  minor.material.opacity = 0.6; major.material.opacity = 0.9;
  const axes = new THREE.Group();
  const line = (a, b, c) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: c }));
  axes.add(line(new THREE.Vector3(-30, 0.001, 0), new THREE.Vector3(30, 0.001, 0), 0xc4473f));
  axes.add(line(new THREE.Vector3(0, 0.001, -30), new THREE.Vector3(0, 0.001, 30), 0x6c9a3a));
  const grid = new THREE.Group(); grid.add(minor, major, axes); grid.name = '__grid__';
  helpers.add(grid);

  // Navegação: botão do meio orbita, Shift+meio pan, roda zoom, Alt+esquerdo orbita.
  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true; orbit.dampingFactor = 0.12;
  orbit.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
  orbit.target.set(0, 0.5, 0);
  renderer.domElement.addEventListener('pointerdown', (e) => {
    orbit.mouseButtons.LEFT = e.altKey ? THREE.MOUSE.ROTATE : null;
  }, true);

  gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setSize(0.85);
  scene.add(gizmo.getHelper());
  let before = null;
  gizmo.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value;
    const o = gizmo.object; if (!o || state.mode === 'edit') return;
    if (e.value) before = history.snapshot(o);
    else if (before) { history.transform(o, before, 'Mover/Girar/Escalar'); before = null; bus.emit('object:transformed', o); }
  });
  gizmo.addEventListener('objectChange', () => bus.emit('object:transforming', gizmo.object));

  viewHelper = new ViewHelper(camera, renderer.domElement);
  viewHelper.center = orbit.target;

  // Pós-processamento
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  outlinePass = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
  outlinePass.visibleEdgeColor.set('#ff7a45'); outlinePass.hiddenEdgeColor.set('#5a2a18');
  outlinePass.edgeStrength = 4; outlinePass.edgeThickness = 1; outlinePass.edgeGlow = 0;
  // Bloom ANTES do contorno — senão a borda de seleção também "brilha".
  bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.45, 0.92);
  composer.addPass(bloomPass);
  composer.addPass(outlinePass);
  composer.addPass(new OutputPass());

  setupPicking();
  applyEnvironment();
  new ResizeObserver(resize).observe(el);
  resize();

  bus.on('selection', (o) => {
    if (o && state.mode === 'object') gizmo.attach(o); else if (state.mode === 'object') gizmo.detach();
    outlinePass.selectedObjects = o ? [o] : [];
  });
  bus.on('request:select', (o) => select(o));

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    frameHooks.forEach((fn) => fn(dt));
    if (viewHelper.animating) viewHelper.update(dt);
    orbit.update();
    renderFrame();
  });
}

export function renderFrame(cam = renderCamera || camera) {
  const pass = composer.passes[0]; pass.camera = cam; outlinePass.renderCamera = cam;
  renderer.autoClear = true;
  if (state.shading === 'wire' || state.shading === 'solid') {
    bloomPass.enabled = false;
  } else bloomPass.enabled = state.env.bloom > 0;
  composer.render();
  if (!renderCamera && !state.hideOverlays) { renderer.autoClear = false; viewHelper.render(renderer); }
}

function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
  composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (renderCamera) { renderCamera.aspect = w / h; renderCamera.updateProjectionMatrix(); }
}

// ---------- Seleção por clique (com tolerância a arrasto) ----------
const ray = new THREE.Raycaster();
export function pickAt(clientX, clientY, objects = content.children) {
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, renderCamera || camera);
  ray.params.Points.threshold = 0.08;
  return ray.intersectObjects(objects, true).filter((h) => h.object.visible);
}

function setupPicking() {
  const el = renderer.domElement;
  let down = null;
  el.addEventListener('pointerdown', (e) => { if (e.button === 0 && !e.altKey) down = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', (e) => {
    if (!down || e.button !== 0) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4; down = null;
    if (moved || gizmo.dragging) return;
    // Clique no ViewHelper (canto inferior direito)
    const r = el.getBoundingClientRect();
    if (e.clientX > r.right - 128 && e.clientY > r.bottom - 128) { viewHelper.handleClick(e); return; }
    if (state.mode === 'edit') { bus.emit('edit:click', e); return; }
    const hit = pickAt(e.clientX, e.clientY)[0];
    select(hit ? topLevel(hit.object) : null);
  });
}

// ---------- API pública do viewport ----------
export function setTool(tool) {
  state.tool = tool;
  if (tool === 'move' || tool === 'rotate' || tool === 'scale') {
    gizmo.setMode({ move: 'translate', rotate: 'rotate', scale: 'scale' }[tool]);
    gizmo.enabled = true; gizmo.getHelper().visible = true;
  } else { gizmo.enabled = false; gizmo.getHelper().visible = false; }
  bus.emit('tool', tool);
}

export function setShading(mode) {
  state.shading = mode;
  if (mode === 'wire') scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: '#9aa0aa', wireframe: true });
  else if (mode === 'solid') scene.overrideMaterial = new THREE.MeshStandardMaterial({ color: '#b4b7bd', roughness: 0.85, metalness: 0 });
  else scene.overrideMaterial = null;
  renderer.shadowMap.enabled = mode !== 'wire';
  bus.emit('shading', mode);
}

export function applyEnvironment(patch = {}) {
  Object.assign(state.env, patch);
  const env = state.env;
  scene.background = env.sky && env.sky !== 'none' && SKIES[env.sky] ? gradientTexture(SKIES[env.sky]) : new THREE.Color(env.background);
  scene.fog = env.fog > 0 ? new THREE.FogExp2(env.sky !== 'none' && SKIES[env.sky] ? SKIES[env.sky][1] : env.background, env.fog) : null;
  if (bloomPass) bloomPass.strength = env.bloom;
  if (renderer) renderer.toneMappingExposure = env.exposure;
  bus.emit('env', env);
}

export function frameSelected() {
  const o = state.selected; if (!o) return;
  const box = new THREE.Box3().setFromObject(o);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length() || 1;
  const dir = camera.position.clone().sub(orbit.target).normalize();
  animateCamera(c, c.clone().add(dir.multiplyScalar(size * 1.8 + 1)));
}

export function viewAxis(axis) {
  const t = orbit.target.clone(); const d = camera.position.distanceTo(t);
  const off = { front: [0, 0, 1], back: [0, 0, -1], right: [1, 0, 0], left: [-1, 0, 0], top: [0, 1, 0.0001], bottom: [0, -1, 0.0001] }[axis];
  animateCamera(t, t.clone().add(new THREE.Vector3(...off).multiplyScalar(d)));
}

function animateCamera(target, pos) {
  const t0 = orbit.target.clone(), p0 = camera.position.clone(); let k = 0;
  const step = (dt) => {
    k = Math.min(1, k + dt * 3.2); const e = 1 - Math.pow(1 - k, 3);
    orbit.target.lerpVectors(t0, target, e); camera.position.lerpVectors(p0, pos, e);
    if (k >= 1) frameHooks.delete(step);
  };
  frameHooks.add(step);
}

export function lookThrough(cam) {
  renderCamera = cam || null;
  helpers.visible = !cam;
  content.traverse((o) => { if (o.userData.proxy) o.visible = !cam; });
  gizmo.getHelper().visible = !cam && ['move', 'rotate', 'scale'].includes(state.tool);
  resize();
  bus.emit('camera:view', cam);
}
export const getRenderCamera = () => renderCamera;

// Render "limpo" para screenshot/export: oculta helpers, gizmo, proxies e contorno.
export function captureImage(width, height, cam) {
  const prev = { w: renderer.domElement.width, h: renderer.domElement.height, pr: renderer.getPixelRatio() };
  const useCam = cam || renderCamera || camera;
  const gh = gizmo.getHelper().visible, hv = helpers.visible, sel = outlinePass.selectedObjects;
  gizmo.getHelper().visible = false; helpers.visible = false; outlinePass.selectedObjects = [];
  const proxies = []; content.traverse((o) => { if (o.userData.proxy && o.visible) { proxies.push(o); o.visible = false; } });
  const w = width || container.clientWidth, h = height || container.clientHeight;
  renderer.setPixelRatio(1); renderer.setSize(w, h, false); composer.setSize(w, h);
  const asp = useCam.aspect; useCam.aspect = w / h; useCam.updateProjectionMatrix();
  state.hideOverlays = true; renderFrame(useCam); state.hideOverlays = false;
  const url = renderer.domElement.toDataURL('image/png');
  useCam.aspect = asp; useCam.updateProjectionMatrix();
  gizmo.getHelper().visible = gh; helpers.visible = hv; outlinePass.selectedObjects = sel;
  proxies.forEach((o) => (o.visible = true));
  renderer.setPixelRatio(prev.pr); resize();
  return url;
}

// Converte posição 3D → coordenada de tela (usada pelos cursores da IA).
export function worldToScreen(v) {
  const r = renderer.domElement.getBoundingClientRect();
  const p = v.clone().project(renderCamera || camera);
  return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
}
