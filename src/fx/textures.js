// Gerador de texturas procedurais em canvas + importação de imagem.
// Gera albedo e, a partir dele, um mapa de rugosidade/normal aproximado.
import * as THREE from 'three';

export const TEXTURES = ['none', 'checker', 'grid', 'noise', 'marble', 'wood', 'bricks', 'brushed', 'uv', 'camo', 'tiles'];
const SIZE = 512;

// Value-noise 2D com oitavas (fBm) — determinístico, sem dependências.
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o = 5) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2; a *= 0.5; } return s; }

function pixels(fn) {
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const g = c.getContext('2d'); const img = g.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const [r, gg, b] = fn(x / SIZE, y / SIZE); const i = (y * SIZE + x) * 4;
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return c;
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const GEN = {
  checker: () => pixels((u, v) => ((Math.floor(u * 8) + Math.floor(v * 8)) % 2 ? [220, 220, 220] : [60, 62, 66])),
  grid: () => pixels((u, v) => ((u * 16) % 1 < 0.04 || (v * 16) % 1 < 0.04 ? [240, 240, 240] : [40, 42, 46])),
  noise: () => pixels((u, v) => { const n = fbm(u * 8, v * 8) * 255; return [n, n, n]; }),
  marble: () => pixels((u, v) => { const t = 0.5 + 0.5 * Math.sin((u * 6 + fbm(u * 4, v * 4) * 6) * Math.PI); return mix([70, 72, 78], [238, 236, 232], Math.pow(t, 0.4)); }),
  wood: () => pixels((u, v) => { const r = Math.hypot(u - 0.5, (v - 0.5) * 0.15) * 40 + fbm(u * 3, v * 12) * 4; const t = r % 1; return mix([92, 56, 30], [178, 120, 70], t * t); }),
  bricks: () => pixels((u, v) => {
    const row = Math.floor(v * 10); const uu = u * 5 + (row % 2) * 0.5;
    const mortar = (v * 10) % 1 < 0.08 || uu % 1 < 0.04;
    const n = fbm(u * 20, v * 20) * 0.35;
    return mortar ? [170, 165, 155] : mix([140, 58, 40], [190, 90, 60], hash(Math.floor(uu), row) * 0.6 + n);
  }),
  brushed: () => pixels((u, v) => { const n = fbm(u * 2, v * 200, 3) * 80 + 140; return [n, n, n + 6]; }),
  uv: () => pixels((u, v) => {
    const line = (u * 8) % 1 < 0.02 || (v * 8) % 1 < 0.02;
    return line ? [20, 20, 20] : [u * 255, v * 255, 180 - u * 90];
  }),
  camo: () => pixels((u, v) => { const n = fbm(u * 5, v * 5, 4); return n < 0.4 ? [58, 66, 44] : n < 0.5 ? [104, 96, 64] : n < 0.6 ? [34, 40, 30] : [140, 130, 96]; }),
  tiles: () => pixels((u, v) => { const g = (u * 6) % 1 < 0.03 || (v * 6) % 1 < 0.03; const n = hash(Math.floor(u * 6), Math.floor(v * 6)) * 30; return g ? [90, 92, 96] : [210 + n * 0.5, 212 + n * 0.4, 214]; }),
};

const cache = new Map();
export function proceduralTexture(name, scale = 1) {
  if (!GEN[name]) return null;
  let canvas = cache.get(name);
  if (!canvas) { canvas = GEN[name](); cache.set(name, canvas); }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(scale, scale); t.anisotropy = 8; t.name = name;
  return t;
}

// Mapa normal a partir da luminância (operador Sobel) — dá relevo a qualquer textura.
export function normalFromTexture(tex, strength = 2) {
  const src = tex.image; const w = src.width, h = src.height;
  const g = src.getContext ? src.getContext('2d') : (() => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(src, 0, 0); return x; })();
  const d = g.getImageData(0, 0, w, h).data;
  const L = (x, y) => { x = (x + w) % w; y = (y + h) % h; const i = (y * w + x) * 4; return (d[i] + d[i + 1] + d[i + 2]) / 765; };
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const out = c.getContext('2d').createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (L(x + 1, y) - L(x - 1, y)) * strength, dy = (L(x, y + 1) - L(x, y - 1)) * strength;
    const n = new THREE.Vector3(-dx, -dy, 1).normalize(); const i = (y * w + x) * 4;
    out.data[i] = (n.x * 0.5 + 0.5) * 255; out.data[i + 1] = (n.y * 0.5 + 0.5) * 255; out.data[i + 2] = (n.z * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
  }
  c.getContext('2d').putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.copy(tex.repeat); return t;
}

export function applyTexture(mesh, name, scale = 1, { normal = true } = {}) {
  const m = mesh.material; if (!m) return;
  for (const k of ['map', 'normalMap']) { m[k]?.dispose(); m[k] = null; }
  if (name && name !== 'none') {
    m.map = proceduralTexture(name, scale);
    if (normal) m.normalMap = normalFromTexture(m.map, name === 'brushed' ? 1 : 3);
    m.color.set('#ffffff');
  }
  mesh.userData.texture = { name, scale };
  m.needsUpdate = true;
}

export async function textureFromFile(file) {
  const url = URL.createObjectURL(file instanceof Blob ? file : new Blob([file]));
  const t = await new THREE.TextureLoader().loadAsync(url);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.name = file.name || 'imagem';
  return t;
}
