// Editor de curvas: valores de cada canal ao longo do tempo; arraste keys (tempo × valor).
import * as THREE from 'three';
import { state, bus } from '../core/state.js';
import { anim, EASES, setTime } from './timeline.js';

const CH = [
  ['p', 0, 'Pos X', '#e5534b'], ['p', 1, 'Pos Y', '#7bb33a'], ['p', 2, 'Pos Z', '#4a8ff0'],
  ['r', 0, 'Rot X', '#ff9b8f'], ['r', 1, 'Rot Y', '#b9e07f'], ['r', 2, 'Rot Z', '#93bdff'],
  ['s', 0, 'Esc X', '#d06b62'], ['s', 1, 'Esc Y', '#8fb35a'], ['s', 2, 'Esc Z', '#6a8fd0'],
];
const visible = new Set([0, 1, 2]);
let selKey = null; // { id, index }
const DEG = 180 / Math.PI;
const val = (k, c) => (CH[c][0] === 'r' ? k.r[CH[c][1]] * DEG : k[CH[c][0]][CH[c][1]]);
const setVal = (k, c, v) => { if (CH[c][0] === 'r') k.r[CH[c][1]] = v / DEG; else k[CH[c][0]][CH[c][1]] = v; };

function sample(keys, c, t) {
  if (t <= keys[0].t) return val(keys[0], c); if (t >= keys[keys.length - 1].t) return val(keys[keys.length - 1], c);
  for (let i = 0; i < keys.length - 1; i++) { const a = keys[i], b = keys[i + 1]; if (t >= a.t && t <= b.t) { const k = (EASES[b.ease] || EASES.linear)((t - a.t) / ((b.t - a.t) || 1)); return val(a, c) + (val(b, c) - val(a, c)) * k; } }
  return 0;
}

export function renderGraph(el) {
  const id = state.selected?.userData?.id; const keys = id ? anim.tracks.get(id) : null;
  el.innerHTML = `<div class="graph"><div class="graph-ch">${CH.map(([, , n, col], i) => `<button data-c="${i}" class="${visible.has(i) ? 'on' : ''}" style="--c:${col}"><i></i>${n}</button>`).join('')}
    <div class="graph-ease">${selKey ? `<label>Suavização</label><select class="field" id="g-ease">${Object.keys(EASES).map((e) => `<option ${keys?.[selKey.index]?.ease === e ? 'selected' : ''}>${e}</option>`).join('')}</select>` : ''}</div></div>
    <canvas class="graph-cv"></canvas>${!keys?.length ? '<div class="graph-empty">Selecione um objeto animado (com keyframes) para ver as curvas.</div>' : ''}</div>`;
  el.querySelector('.graph-ch').onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; const c = +b.dataset.c; visible.has(c) ? visible.delete(c) : visible.add(c); renderGraph(el); };
  el.querySelector('#g-ease')?.addEventListener('change', (e) => { keys[selKey.index].ease = e.target.value; bus.emit('anim:changed'); setTime(state.time); draw(); });
  const cv = el.querySelector('canvas'); const g = cv.getContext('2d');
  let view = null;
  function draw() {
    const W = cv.clientWidth, H = cv.clientHeight; const dpr = devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H); if (!keys?.length) return;
    let lo = Infinity, hi = -Infinity;
    for (const c of visible) for (let t = 0; t <= state.duration; t += state.duration / 80) { const v = sample(keys, c, t); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!isFinite(lo)) { lo = -1; hi = 1; } if (hi - lo < 1e-3) { lo -= 1; hi += 1; } const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    const L = 46, R = 12, T = 10, B = 22;
    const X = (t) => L + (t / state.duration) * (W - L - R), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    view = { X, Y, L, R, T, B, W, H, lo, hi };
    g.font = '10px Cascadia Mono, monospace'; g.fillStyle = '#77767a'; g.strokeStyle = '#24252a'; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const v = lo + ((hi - lo) * i) / 4; const y = Y(v); g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.fillText(v.toFixed(2), 4, y + 3); }
    for (let s = 0; s <= state.duration; s++) { const x = X(s); g.beginPath(); g.moveTo(x, T); g.lineTo(x, H - B); g.stroke(); g.fillText(s + 's', x - 6, H - 6); }
    g.strokeStyle = '#e2703f'; g.beginPath(); g.moveTo(X(state.time), T); g.lineTo(X(state.time), H - B); g.stroke();
    for (const c of visible) {
      g.strokeStyle = CH[c][3]; g.lineWidth = 1.6; g.beginPath();
      for (let px = 0; px <= W - L - R; px += 2) { const t = (px / (W - L - R)) * state.duration; const y = Y(sample(keys, c, t)); px ? g.lineTo(L + px, y) : g.moveTo(L, y); }
      g.stroke();
      keys.forEach((k, i) => { const on = selKey && selKey.index === i; g.fillStyle = on ? '#ffffff' : CH[c][3]; g.save(); g.translate(X(k.t), Y(val(k, c))); g.rotate(Math.PI / 4); g.fillRect(-4, -4, 8, 8); g.restore(); });
    }
  }
  draw(); new ResizeObserver(draw).observe(cv);
  cv.onpointerdown = (e) => {
    if (!keys?.length || !view) return; const r = cv.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    let hit = null; for (const c of visible) keys.forEach((k, i) => { if (Math.hypot(view.X(k.t) - mx, view.Y(val(k, c)) - my) < 7) hit = { i, c }; });
    if (!hit) { setTime(((mx - view.L) / (view.W - view.L - view.R)) * state.duration); draw(); return; }
    selKey = { id, index: hit.i }; const k = keys[hit.i]; const t0 = k.t, v0 = val(k, hit.c); cv.setPointerCapture(e.pointerId);
    const mv = (ev) => {
      const dt = ((ev.clientX - e.clientX) / (view.W - view.L - view.R)) * state.duration; const dv = -((ev.clientY - e.clientY) / (view.H - view.T - view.B)) * (view.hi - view.lo);
      k.t = Math.max(0, Math.round((t0 + (ev.shiftKey ? 0 : dt)) * state.fps) / state.fps);
      setVal(k, hit.c, ev.altKey ? v0 : +(v0 + dv).toFixed(4));
      setTime(state.time); draw();
    };
    cv.addEventListener('pointermove', mv);
    cv.addEventListener('pointerup', () => { cv.removeEventListener('pointermove', mv); keys.sort((a, b) => a.t - b.t); selKey.index = keys.indexOf(k); bus.emit('anim:changed'); renderGraph(el); }, { once: true });
  };
  return draw;
}
export { THREE };
