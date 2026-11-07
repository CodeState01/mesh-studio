// Sistemas de partículas na GPU (um draw call por emissor) com presets de VFX.
import * as THREE from 'three';
import { frameHooks } from '../core/viewport.js';
import { content } from '../core/objects.js';
import { nextId, state } from '../core/state.js';

export const VFX_TYPES = ['fire', 'smoke', 'sparks', 'snow', 'magic', 'rain', 'confetti', 'dust'];
const MAX = 1500;

const PRESETS = {
  fire:     { rate: 220, life: [0.5, 1.1], size: [0.35, 0.05], speed: [0.6, 1.4], spread: 0.25, gravity: 1.2, colors: ['#fff3c4', '#ffa53d', '#e0401a', '#2a0b05'], additive: true },
  smoke:    { rate: 40, life: [2.5, 4], size: [0.4, 1.6], speed: [0.3, 0.6], spread: 0.3, gravity: 0.25, colors: ['#5a5d63', '#3a3c40', '#202124'], additive: false, alpha: 0.35 },
  sparks:   { rate: 120, life: [0.4, 1.0], size: [0.07, 0.02], speed: [2, 4.5], spread: 1, gravity: -6, colors: ['#ffffff', '#ffd27a', '#ff7a2f'], additive: true, burst: true },
  snow:     { rate: 90, life: [5, 7], size: [0.05, 0.05], speed: [0.2, 0.5], spread: 6, gravity: -0.15, colors: ['#ffffff', '#e8eefc'], additive: false, area: [8, 4, 8], fall: true },
  rain:     { rate: 400, life: [0.8, 1.0], size: [0.03, 0.03], speed: [7, 9], spread: 6, gravity: -2, colors: ['#9fc2ff', '#6d8fc7'], additive: true, area: [8, 5, 8], fall: true, alpha: 0.6 },
  magic:    { rate: 140, life: [1.2, 2.2], size: [0.12, 0.0], speed: [0.4, 0.9], spread: 0.6, gravity: 0.3, colors: ['#ffffff', '#7fd4ff', '#3d6bff', '#120e3a'], additive: true, swirl: 3 },
  confetti: { rate: 160, life: [2, 3], size: [0.08, 0.08], speed: [3, 5], spread: 1.4, gravity: -4, colors: ['#ff5a5f', '#ffd166', '#06d6a0', '#118ab2', '#f4f1de'], additive: false, burst: true, random: true },
  dust:     { rate: 30, life: [4, 6], size: [0.03, 0.03], speed: [0.02, 0.08], spread: 3, gravity: 0, colors: ['#e9dcc0', '#b5a78a'], additive: true, area: [6, 3, 6], alpha: 0.45 },
};

const vert = /* glsl */`
  attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
  varying float vAlpha; varying vec3 vColor;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    gl_PointSize = aSize * (600.0 / -mv.z);
    gl_Position = projectionMatrix * mv; vAlpha = aAlpha; vColor = aColor;
  }`;
const frag = /* glsl */`
  varying float vAlpha; varying vec3 vColor;
  void main(){
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vAlpha;
    if(a < 0.003) discard;
    gl_FragColor = vec4(vColor, a);
  }`;

const lerpColor = (stops, t, out) => {
  const f = Math.min(0.9999, Math.max(0, t)) * (stops.length - 1); const i = Math.floor(f);
  return out.copy(stops[i]).lerp(stops[i + 1] || stops[i], f - i);
};

export function createVFX(type = 'fire', opts = {}) {
  const base = PRESETS[type] || PRESETS.fire;
  const cfg = { ...base, rate: opts.rate ?? base.rate };
  const stops = (opts.color && !base.random ? [opts.color, opts.color, '#000000'] : base.colors).map((c) => new THREE.Color(c));
  const sizeMul = opts.size ?? 1;

  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3), size = new Float32Array(MAX), alpha = new Float32Array(MAX);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);

  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
    blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = opts.name || `VFX ${type}`;
  pts.userData = { id: nextId('vfx'), kind: 'vfx', vfx: { type, color: opts.color, rate: cfg.rate, size: sizeMul } };
  pts.frustumCulled = false;
  if (opts.position) pts.position.fromArray(opts.position);

  // Proxy de seleção (losango)
  const px = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), new THREE.MeshBasicMaterial({ color: '#ff9b5e', wireframe: true }));
  px.userData.proxy = true; pts.add(px);

  // Estado das partículas (CPU) — simples e rápido para até ~1500 por emissor.
  const P = Array.from({ length: MAX }, () => ({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), age: 0, life: 1, seed: 0, c: null }));
  let acc = 0, burstTimer = 0; const tmp = new THREE.Color(); const rnd = (a, b) => a + Math.random() * (b - a);

  function spawn() {
    const q = P.find((x) => !x.alive); if (!q) return;
    q.alive = true; q.age = 0; q.life = rnd(...cfg.life); q.seed = Math.random();
    if (cfg.area) q.p.set(rnd(-1, 1) * cfg.area[0] / 2, cfg.fall ? cfg.area[1] : rnd(0, cfg.area[1]), rnd(-1, 1) * cfg.area[2] / 2);
    else q.p.set(rnd(-1, 1) * cfg.spread * 0.3, 0, rnd(-1, 1) * cfg.spread * 0.3);
    const sp = rnd(...cfg.speed);
    if (cfg.fall) q.v.set(rnd(-0.1, 0.1), -sp, rnd(-0.1, 0.1));
    else if (cfg.burst) q.v.set(rnd(-1, 1) * cfg.spread, rnd(0.6, 1.2), rnd(-1, 1) * cfg.spread).normalize().multiplyScalar(sp);
    else q.v.set(rnd(-1, 1) * cfg.spread, 1, rnd(-1, 1) * cfg.spread).normalize().multiplyScalar(sp);
    q.c = base.random ? stops[Math.floor(Math.random() * stops.length)] : null;
  }

  const hook = (dt) => {
    if (!pts.parent) return;               // emissor removido
    if (!pts.visible) return;
    const sim = state.playing || !state.pauseVfxWhenStopped;
    if (sim) {
      if (cfg.burst) { burstTimer -= dt; if (burstTimer <= 0) { for (let i = 0; i < cfg.rate * 0.6; i++) spawn(); burstTimer = 1.4; } }
      else { acc += cfg.rate * dt; while (acc >= 1) { spawn(); acc--; } }
    }
    let n = 0;
    for (const q of P) {
      if (!q.alive) continue;
      if (sim) {
        q.age += dt; if (q.age >= q.life) { q.alive = false; continue; }
        q.v.y += cfg.gravity * dt;
        if (cfg.swirl) { const a = cfg.swirl * dt; const x = q.p.x * Math.cos(a) - q.p.z * Math.sin(a); q.p.z = q.p.x * Math.sin(a) + q.p.z * Math.cos(a); q.p.x = x; q.p.multiplyScalar(1 + dt * 0.4); }
        if (type === 'snow' || type === 'dust') q.v.x += Math.sin(q.age * 2 + q.seed * 10) * dt * 0.2;
        q.p.addScaledVector(q.v, dt);
      }
      const t = q.age / q.life;
      pos.set([q.p.x, q.p.y, q.p.z], n * 3);
      const c = q.c ? tmp.copy(q.c) : lerpColor(stops, t, tmp); col.set([c.r, c.g, c.b], n * 3);
      size[n] = (cfg.size[0] + (cfg.size[1] - cfg.size[0]) * t) * sizeMul;
      alpha[n] = (cfg.alpha ?? 1) * Math.min(1, t * 8) * (1 - t);
      n++;
    }
    geo.setDrawRange(0, n);
    for (const a of ['position', 'aColor', 'aSize', 'aAlpha']) geo.attributes[a].needsUpdate = true;
  };
  frameHooks.add(hook);
  pts.userData.dispose = () => frameHooks.delete(hook);
  return pts;
}

// Reconstrói emissores após carregar um projeto (estado de simulação não é salvo).
export function rehydrateVFX() {
  const old = []; content.traverse((o) => { if (o.userData?.vfx && !o.userData.dispose) old.push(o); });
  for (const o of old) {
    const n = createVFX(o.userData.vfx.type, { ...o.userData.vfx, name: o.name });
    n.position.copy(o.position); n.rotation.copy(o.rotation); n.scale.copy(o.scale); n.userData.id = o.userData.id;
    const parent = o.parent; parent.add(n); parent.remove(o);
  }
}
