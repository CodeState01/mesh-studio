// Render "Cycles": path tracing físico na GPU (three-gpu-pathtracer). Luz indireta, reflexos,
// refração, sombras macias e cáusticas — acumula amostras progressivamente no viewport (modo "Ciclos")
// ou renderiza uma imagem final com N amostras (F11).
import * as THREE from 'three';
import { WebGLPathTracer, GradientEquirectTexture } from 'three-gpu-pathtracer';
import { scene, renderer, camera, orbit, getRenderCamera, captureImage, frameHooks, setRenderOverride } from '../core/viewport.js';
import { content } from '../core/objects.js';
import { state, bus } from '../core/state.js';
import { toast } from '../ui/toast.js';

// Fundo (o que aparece atrás) e luz ambiente (o que ilumina) são separados, como World no Blender:
// o fundo segue o céu do viewport; a luz imita o estúdio claro que o RoomEnvironment dá no modo Material.
const SKY = { studio: ['#3a3e46', '#141518'], sunset: ['#f0a36b', '#3a2440'], night: ['#1a2440', '#04060c'], overcast: ['#c7ccd3', '#4e545c'] };
const LIGHT = { studio: ['#f2f4f7', '#5a5d63'], sunset: ['#ffd2a8', '#6a4a5a'], night: ['#5a6c9a', '#151a28'], overcast: ['#eef1f5', '#7a8088'] };
export const pt = { tracer: null, active: false, dirty: true, bounces: 6, maxSamples: 1024, env: null };
let saved = null, rebuildTimer = 0;

function ensure() {
  if (pt.tracer) return pt.tracer;
  const t = new WebGLPathTracer(renderer);
  t.tiles.set(2, 2); t.renderDelay = 0; t.fadeDuration = 250; t.minSamples = 1; t.dynamicLowRes = true; t.lowResScale = 0.35;
  pt.tracer = t; pt.env = new GradientEquirectTexture(256); pt.bg = new GradientEquirectTexture(256); return t;
}

// Esconde tudo que não é conteúdo do usuário (grade, gizmo, proxies de luz) só durante a montagem do BVH.
function withOnlyContent(fn) {
  const hidden = [];
  scene.traverse((o) => { if (o === scene || !o.visible) return; let p = o, inContent = false; while (p) { if (p === content) { inContent = true; break; } p = p.parent; } if (!inContent || o.userData.proxy || o.userData.editHelper || o.isPoints) { hidden.push(o); o.visible = false; } });
  content.visible = true;
  try { return fn(); } finally { hidden.forEach((o) => (o.visible = true)); }
}

function applySky() {
  const [top, bottom] = SKY[state.env.sky] || [state.env.background, state.env.background];
  pt.bg.topColor.set(top); pt.bg.bottomColor.set(bottom); pt.bg.exponent = 1.5; pt.bg.update();
  const [lt, lb] = LIGHT[state.env.sky] || LIGHT.studio;
  pt.env.topColor.set(lt); pt.env.bottomColor.set(lb); pt.env.exponent = 0.8; pt.env.update();
}

export function rebuild() {
  const t = ensure(); const cam = getRenderCamera() || camera;
  applySky();
  const env = scene.environment, bg = scene.background; scene.environment = pt.env; scene.background = pt.bg;
  try { withOnlyContent(() => t.setScene(scene, cam)); } finally { if (!pt.active) { scene.environment = env; scene.background = bg; } }
  t.bounces = pt.bounces; pt.dirty = false;
}

export function enterPathTracing() {
  if (pt.active) return; ensure(); pt.active = true;
  saved = { env: scene.environment, bg: scene.background, fog: scene.fog };
  scene.fog = null; rebuild();
  setRenderOverride(() => { if (pt.dirty) rebuild(); if (pt.tracer.samples < pt.maxSamples) pt.tracer.renderSample(); });
  orbit.addEventListener('change', onCam); badge(true);
}
export function exitPathTracing() {
  if (!pt.active) return; pt.active = false; setRenderOverride(null); orbit.removeEventListener('change', onCam);
  if (saved) { scene.environment = saved.env; scene.background = saved.bg; scene.fog = saved.fog; saved = null; }
  badge(false);
}
function onCam() { pt.tracer?.updateCamera(); }
const markDirty = () => { if (!pt.active) return; clearTimeout(rebuildTimer); rebuildTimer = setTimeout(() => (pt.dirty = true), 120); };
['scene:changed', 'object:transformed', 'material:changed', 'modifiers:changed', 'env', 'time', 'history'].forEach((e) => bus.on(e, markDirty));
bus.on('camera:view', () => pt.active && (pt.dirty = true));
bus.on('shading', (m) => (m === 'cycles' ? enterPathTracing() : exitPathTracing()));

let badgeEl = null;
function badge(on) {
  if (!on) { badgeEl?.remove(); badgeEl = null; return; }
  badgeEl = Object.assign(document.createElement('div'), { className: 'pt-badge' }); document.querySelector('#viewport').appendChild(badgeEl);
  const tick = () => { if (!badgeEl) { frameHooks.delete(tick); return; } badgeEl.textContent = pt.tracer?.isCompiling ? 'Ciclos · compilando shaders (só na 1ª vez pode levar 1–2 min)…' : `Ciclos · ${pt.tracer?.samples.toFixed(0) || 0} amostras`; };
  frameHooks.add(tick);
}

// Render final com N amostras numa resolução escolhida. Retorna dataURL PNG.
export async function renderPathTraced({ width = 1920, height = 1080, samples = 128, onProgress } = {}) {
  const t = ensure(); const wasActive = pt.active; if (!wasActive) enterPathTracing();
  const cam = getRenderCamera() || camera; const prevSize = renderer.getSize(new THREE.Vector2()); const pr = renderer.getPixelRatio();
  const aspect = cam.aspect;
  setRenderOverride(() => {}); // pausa o loop do viewport enquanto renderiza
  renderer.setPixelRatio(1); renderer.setSize(width, height, false); cam.aspect = width / height; cam.updateProjectionMatrix();
  rebuild(); t.renderScale = 1; t.dynamicLowRes = false; t.reset();
  await new Promise((resolve) => {
    const step = () => { for (let k = 0; k < 2 && t.samples < samples; k++) t.renderSample(); onProgress?.(Math.min(1, t.samples / samples)); if (t.samples >= samples) resolve(); else requestAnimationFrame(step); };
    step();
  });
  const url = renderer.domElement.toDataURL('image/png');
  renderer.setPixelRatio(pr); renderer.setSize(prevSize.x, prevSize.y, false); cam.aspect = aspect; cam.updateProjectionMatrix();
  t.dynamicLowRes = true; pt.dirty = true;
  if (wasActive) setRenderOverride(() => { if (pt.dirty) rebuild(); if (t.samples < pt.maxSamples) t.renderSample(); }); else exitPathTracing();
  window.dispatchEvent(new Event('resize'));
  return url;
}

export async function renderCyclesToFile(opts = {}) {
  const tst = toast('Renderizando com Ciclos… 0%', { ms: 600000 });
  const url = await renderPathTraced({ ...opts, onProgress: (p) => tst?.update?.(`Renderizando com Ciclos… ${Math.round(p * 100)}%`) });
  tst?.close?.();
  const data = Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0));
  if (window.meshApp?.file) { const p = await window.meshApp.file.save({ name: 'render-ciclos.png', data, binary: true, filters: [{ name: 'PNG', extensions: ['png'] }] }); if (p) toast('Render (Ciclos) salvo'); }
  else { const a = document.createElement('a'); a.href = url; a.download = 'render-ciclos.png'; a.click(); }
  return { samples: opts.samples || 128 };
}
export { captureImage };
