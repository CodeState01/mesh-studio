// Gera miniaturas REAIS de cada item (renderizando o objeto/efeito/som),
// com uma fila para não travar a interface. Resultado em cache por chave.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { renderSFX } from '../fx/audio.js';

const SIZE = 256;
let renderer, scene, camera;
const cache = new Map();
const queue = [];
let busy = false;

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  renderer.setSize(SIZE, SIZE); renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
  scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight('#ffffff', 1.6); key.position.set(3, 5, 4); scene.add(key);
  camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
}

function frame(obj, { elevation = 0.45, pad = 1.25 } = {}) {
  const box = new THREE.Box3().setFromObject(obj); const c = box.getCenter(new THREE.Vector3());
  const r = box.getSize(new THREE.Vector3()).length() / 2 || 1;
  const dist = (r * pad) / Math.sin((camera.fov * Math.PI) / 360);
  camera.position.set(c.x + dist * 0.75, c.y + dist * elevation, c.z + dist * 0.8); camera.lookAt(c);
}

// kind: 'object' (Object3D pronto) | 'vfx' (Points com userData.step) | 'sfx' (preset) | 'material'
async function render(job) {
  if (!renderer) init();
  const { kind, make, bg = '#1b1c20' } = job;
  if (kind === 'sfx') return waveform(await renderSFX(make()));
  scene.background = new THREE.Color(bg);
  const obj = make(); scene.add(obj);
  if (kind === 'vfx') { // simula 2s de partículas antes da foto
    scene.background = new THREE.Color('#0d0e11');
    for (let i = 0; i < 120; i++) obj.userData.step(1 / 60);
    obj.traverse((o) => { if (o.userData.proxy) o.visible = false; });
    camera.position.set(0, 1.4, 5.2); camera.lookAt(0, 1.1, 0);
  } else frame(obj, job.frame);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/webp', 0.9);
  scene.remove(obj);
  obj.traverse((o) => { o.geometry?.dispose(); });
  return url;
}

function waveform(data) {
  const c = document.createElement('canvas'); c.width = SIZE; c.height = SIZE; const g = c.getContext('2d');
  g.fillStyle = '#16171b'; g.fillRect(0, 0, SIZE, SIZE);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#b9f23c';
  const bars = 64, step = Math.floor(data.length / bars); const mid = SIZE / 2;
  let peak = 0.0001; for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  for (let b = 0; b < bars; b++) {
    let m = 0; for (let i = b * step; i < (b + 1) * step; i++) m = Math.max(m, Math.abs(data[i]));
    const h = Math.max(2, (m / peak) * SIZE * 0.36); const x = 16 + b * ((SIZE - 32) / bars);
    g.fillStyle = accent; g.globalAlpha = 0.35 + 0.65 * (m / peak);
    g.fillRect(x, mid - h, 2.2, h * 2);
  }
  return c.toDataURL('image/webp', 0.9);
}

async function pump() {
  if (busy) return; busy = true;
  while (queue.length) {
    const job = queue.shift();
    try { const url = await render(job); cache.set(job.key, url); job.resolve(url); } catch (e) { console.warn('thumb', job.key, e); job.resolve(null); }
    await new Promise((r) => requestAnimationFrame(r)); // 1 miniatura por quadro
  }
  busy = false;
}

export function thumb(key, kind, make, opts = {}) {
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  return new Promise((resolve) => { queue.push({ key, kind, make, resolve, ...opts }); pump(); });
}
