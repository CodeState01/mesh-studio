// Animação por keyframes + trilha de áudio (SFX e clipes) + reprodução.
import * as THREE from 'three';
import { state, bus } from '../core/state.js';
import { frameHooks } from '../core/viewport.js';
import { content, findTarget, DEG } from '../core/objects.js';
import { history } from '../core/history.js';
import { playSFX, playBuffer, stopAllBuffers } from '../fx/audio.js';

export const anim = {
  tracks: new Map(), // objId -> [{t, p, r, s, o, ease}]
  sfx: [],           // [{id, preset, t, volume}]
  audio: [],         // [{id, name, t, duration, bufferId, volume}]
};

export const EASES = {
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  elastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
  bounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

const opacityOf = (o) => (o.material && !Array.isArray(o.material) ? o.material.opacity : 1);

export function insertKey(obj, t = state.time, over = {}, ease = 'easeInOut', record = true) {
  const id = obj.userData.id; const keys = anim.tracks.get(id) || [];
  const k = {
    t: +t.toFixed(4),
    p: over.position || obj.position.toArray(),
    r: over.rotation ? over.rotation.map((v) => v * DEG) : [obj.rotation.x, obj.rotation.y, obj.rotation.z],
    s: over.scale || obj.scale.toArray(),
    o: over.opacity ?? opacityOf(obj),
    ease,
  };
  const prev = keys.slice();
  const i = keys.findIndex((x) => Math.abs(x.t - k.t) < 1e-3);
  if (i >= 0) keys[i] = k; else keys.push(k);
  keys.sort((a, b) => a.t - b.t);
  anim.tracks.set(id, keys);
  if (record) history.push({ label: 'Keyframe', undo: () => anim.tracks.set(id, prev), redo: () => anim.tracks.set(id, keys) });
  bus.emit('anim:changed');
  return k;
}

export function clearKeys(obj) { anim.tracks.delete(obj.userData.id); bus.emit('anim:changed'); }

const v = new THREE.Vector3();
export function evaluate(time = state.time) {
  for (const [id, keys] of anim.tracks) {
    if (!keys.length) continue;
    const obj = findTarget(id); if (!obj) continue;
    let a = keys[0], b = keys[keys.length - 1];
    if (time <= a.t) b = a; else if (time >= b.t) a = b;
    else for (let i = 0; i < keys.length - 1; i++) if (time >= keys[i].t && time <= keys[i + 1].t) { a = keys[i]; b = keys[i + 1]; break; }
    const span = b.t - a.t; const k = span > 0 ? (EASES[b.ease] || EASES.linear)((time - a.t) / span) : 0;
    const L = (x, y) => x + (y - x) * k;
    obj.position.set(L(a.p[0], b.p[0]), L(a.p[1], b.p[1]), L(a.p[2], b.p[2]));
    obj.rotation.set(L(a.r[0], b.r[0]), L(a.r[1], b.r[1]), L(a.r[2], b.r[2]));
    obj.scale.set(L(a.s[0], b.s[0]), L(a.s[1], b.s[1]), L(a.s[2], b.s[2]));
    if (obj.material && !Array.isArray(obj.material) && (a.o < 1 || b.o < 1)) {
      obj.material.transparent = true; obj.material.opacity = Math.max(0, Math.min(1, L(a.o, b.o)));
    }
  }
}

// ---------- Motion presets (motion design pronto) ----------
export function motionPreset(obj, preset, start = state.time, dur = 1) {
  const p = obj.position.toArray(), r = [obj.rotation.x / DEG, obj.rotation.y / DEG, obj.rotation.z / DEG], s = obj.scale.toArray();
  const add = (t, o, e = 'easeOut') => insertKey(obj, start + t * dur, o, e, false);
  const prev = (anim.tracks.get(obj.userData.id) || []).slice();
  const R = (dx, dy, dz) => [r[0] + dx, r[1] + dy, r[2] + dz];
  switch (preset) {
    case 'pop_in': add(0, { scale: [0.001, 0.001, 0.001] }); add(1, { scale: s }, 'back'); break;
    case 'slide_up': add(0, { position: [p[0], p[1] - 1.5, p[2]], opacity: 0 }); add(1, { position: p, opacity: 1 }); break;
    case 'slide_left': add(0, { position: [p[0] + 3, p[1], p[2]], opacity: 0 }); add(1, { position: p, opacity: 1 }); break;
    case 'spin': add(0, { rotation: r }, 'linear'); add(1, { rotation: R(0, 360, 0) }, 'easeInOut'); break;
    case 'bounce': add(0, { position: [p[0], p[1] + 2.5, p[2]] }); add(1, { position: p }, 'bounce'); break;
    case 'drop': add(0, { position: [p[0], p[1] + 4, p[2]], scale: s }); add(0.8, { position: p, scale: [s[0] * 1.2, s[1] * 0.75, s[2] * 1.2] }, 'easeIn'); add(1, { position: p, scale: s }, 'back'); break;
    case 'float': add(0, { position: p }, 'easeInOut'); add(0.5, { position: [p[0], p[1] + 0.35, p[2]] }, 'easeInOut'); add(1, { position: p }, 'easeInOut'); break;
    case 'pulse': add(0, { scale: s }); add(0.5, { scale: s.map((x) => x * 1.18) }, 'easeInOut'); add(1, { scale: s }, 'easeInOut'); break;
    case 'orbit': for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI * 2; const rad = Math.hypot(p[0], p[2]) || 2; add(i / 8, { position: [Math.cos(a) * rad, p[1], Math.sin(a) * rad] }, 'linear'); } break;
    case 'fade_out': add(0, { opacity: 1 }); add(1, { opacity: 0 }); break;
    default: throw new Error('Preset desconhecido: ' + preset);
  }
  const now = anim.tracks.get(obj.userData.id).slice();
  history.push({ label: 'Motion: ' + preset, undo: () => { anim.tracks.set(obj.userData.id, prev); bus.emit('anim:changed'); }, redo: () => { anim.tracks.set(obj.userData.id, now); bus.emit('anim:changed'); } });
  const end = start + dur; if (end > state.duration) state.duration = Math.ceil(end);
  bus.emit('anim:changed');
}

// ---------- Áudio na timeline ----------
let sfxSeq = 0;
export function addSFX(preset, t = state.time, volume = 1) {
  const e = { id: 'sfx' + ++sfxSeq, preset, t, volume }; anim.sfx.push(e);
  history.push({ label: 'SFX', undo: () => { anim.sfx = anim.sfx.filter((x) => x !== e); bus.emit('anim:changed'); }, redo: () => { anim.sfx.push(e); bus.emit('anim:changed'); } });
  bus.emit('anim:changed'); return e;
}

// ---------- Reprodução ----------
export function setTime(t) { state.time = Math.max(0, Math.min(state.duration, t)); evaluate(); bus.emit('time', state.time); }
export function play(on = !state.playing) {
  state.playing = on;
  if (on) {
    if (state.time >= state.duration - 1e-3) state.time = 0;
    anim.audio.forEach((a) => { if (state.time < a.t + a.duration) playBuffer(a.bufferId, state.time - a.t, a.volume ?? 1); });
  } else stopAllBuffers();
  bus.emit('play', on);
}

frameHooks.add((dt) => {
  if (!state.playing) return;
  const prev = state.time; let t = prev + dt;
  if (t >= state.duration) {
    if (state.loop !== false) { t = 0; stopAllBuffers(); anim.audio.forEach((a) => { if (a.t <= 1e-3) playBuffer(a.bufferId, 0, a.volume ?? 1); }); }
    else { t = state.duration; play(false); }
  }
  for (const e of anim.sfx) if (e.t > prev && e.t <= t) playSFX(e.preset, { volume: e.volume });
  for (const a of anim.audio) if (a.t > prev && a.t <= t) playBuffer(a.bufferId, 0, a.volume ?? 1);
  state.time = t; evaluate(); bus.emit('time', t);
});

export function serializeAnim() {
  return { tracks: [...anim.tracks.entries()], sfx: anim.sfx, audio: anim.audio.map(({ bufferId, ...r }) => r), duration: state.duration, fps: state.fps };
}
export function loadAnim(d = {}) {
  anim.tracks = new Map(d.tracks || []); anim.sfx = d.sfx || []; anim.audio = [];
  state.duration = d.duration || 8; state.fps = d.fps || 30; bus.emit('anim:changed');
}
export const animatedIds = () => [...anim.tracks.keys()].filter((id) => content.getObjectByProperty && findTarget(id));
