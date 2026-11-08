// Rastreamento de movimento (Motion Tracking) e máscaras, como no Clip Editor do Blender:
//   • carregue um vídeo, clique para criar marcadores e rastreie quadro a quadro
//     (casamento de padrão por soma de diferenças absolutas numa janela de busca);
//   • "Estabilizar" pré-visualiza o vídeo travado no marcador 1;
//   • "Objeto segue marcador" cria um objeto animado (keyframes) na cena 3D;
//   • "Resolver câmera (tripé)" converte o deslocamento médio em giro/inclinação da câmera;
//   • Máscara: desenhe um polígono e exporte como PNG com transparência.
import * as THREE from 'three';
import { state, bus, nextId, select } from '../core/state.js';
import { content, createPrimitive, createCamera } from '../core/objects.js';
import { insertKey } from '../anim/timeline.js';
import { history } from '../core/history.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';

const T = { video: null, fps: 24, frame: 0, frames: 0, markers: [], mask: [], tool: 'marker', stabilize: false, busy: false, patch: 9, search: 24, w: 0, h: 0 };
let page = null, cv = null, ctx = null, work = null, wctx = null;

const gray = (img) => { const g = new Float32Array(img.width * img.height); const d = img.data; for (let i = 0; i < g.length; i++) g[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114; return g; };
function grab() { wctx.drawImage(T.video, 0, 0, T.w, T.h); return gray(wctx.getImageData(0, 0, T.w, T.h)); }
const seek = (t) => new Promise((res) => { const v = T.video; if (Math.abs(v.currentTime - t) < 1e-4) return res(); const done = () => { v.removeEventListener('seeked', done); res(); }; v.addEventListener('seeked', done); v.currentTime = t; });

// Procura, ao redor da posição anterior, o deslocamento cujo patch mais se parece com o de referência.
function trackStep(prevG, curG, x, y) {
  const P = T.patch, S = T.search, W = T.w; let best = Infinity, bx = x, by = y;
  const xi = Math.round(x), yi = Math.round(y);
  for (let dy = -S; dy <= S; dy += 1) for (let dx = -S; dx <= S; dx += 1) {
    let sad = 0; const cx = xi + dx, cy = yi + dy; if (cx - P < 0 || cy - P < 0 || cx + P >= W || cy + P >= T.h) continue;
    for (let py = -P; py <= P; py += 2) { const r0 = (yi + py) * W + xi, r1 = (cy + py) * W + cx; for (let px = -P; px <= P; px += 2) sad += Math.abs(prevG[r0 + px] - curG[r1 + px]); if (sad >= best) break; }
    if (sad < best) { best = sad; bx = cx; by = cy; }
  }
  return [bx, by, best / ((P + 1) * (P + 1))];
}
async function trackForward(n = Infinity) {
  if (!T.markers.length) { toast('Clique no vídeo para criar marcadores primeiro'); return; }
  T.busy = true; draw(); await seek(T.frame / T.fps); let prev = grab();
  for (let f = T.frame + 1; f < T.frames && f <= T.frame + n && T.busy; f++) {
    await seek(f / T.fps); const cur = grab();
    for (const m of T.markers) { const last = m.track[f - 1]; if (!last || m.lost) continue; const [x, y, err] = trackStep(prev, cur, last[0], last[1]); if (err > 60) { m.lost = f; continue; } m.track[f] = [x, y]; }
    prev = cur; T.frame = f; draw(); if (f % 4 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  T.busy = false; draw(); toast('Rastreamento concluído');
}

function draw() {
  if (!page || !T.video) return; const off = T.stabilize && T.markers[0]?.track[T.frame] && T.markers[0].track[T.markers[0].first] ? [T.markers[0].track[T.markers[0].first][0] - T.markers[0].track[T.frame][0], T.markers[0].track[T.markers[0].first][1] - T.markers[0].track[T.frame][1]] : [0, 0];
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(T.video, off[0], off[1], T.w, T.h);
  if (T.mask.length) { ctx.fillStyle = 'rgba(185,242,60,.18)'; ctx.strokeStyle = '#b9f23c'; ctx.beginPath(); T.mask.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  T.markers.forEach((m, mi) => {
    ctx.strokeStyle = m.lost && m.lost <= T.frame ? '#e5534b' : ['#ffcc33', '#3dd6ff', '#ff6fb5', '#7bd389', '#b98cff'][mi % 5]; ctx.lineWidth = 1.5;
    ctx.beginPath(); let started = false; for (let f = Math.max(0, T.frame - 20); f <= T.frame; f++) { const p = m.track[f]; if (!p) continue; started ? ctx.lineTo(p[0] + off[0], p[1] + off[1]) : ctx.moveTo(p[0] + off[0], p[1] + off[1]); started = true; } ctx.stroke();
    const p = m.track[T.frame]; if (p) { ctx.strokeRect(p[0] - T.patch + off[0], p[1] - T.patch + off[1], T.patch * 2, T.patch * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fillText(String(mi + 1), p[0] + T.patch + 3 + off[0], p[1] - T.patch + off[1]); }
  });
  page.querySelector('#tr-info').textContent = `Quadro ${T.frame + 1}/${T.frames} · ${T.markers.length} marcador(es)${T.busy ? ' · rastreando…' : ''}`;
  page.querySelector('#tr-scrub').value = T.frame;
}

async function loadVideo(file) {
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.src = URL.createObjectURL(file instanceof Blob ? file : new Blob([file.data]));
  await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('Vídeo não suportado')); });
  // WebM gravado por navegador não informa a duração: pular para o fim força o cálculo
  if (!isFinite(v.duration)) { await new Promise((r) => { v.ontimeupdate = () => { v.ontimeupdate = null; r(); }; v.currentTime = 1e9; }); }
  const scale = Math.min(1, 960 / v.videoWidth); T.w = Math.round(v.videoWidth * scale); T.h = Math.round(v.videoHeight * scale);
  T.video = v; T.frames = Math.max(1, Math.floor(v.duration * T.fps)); T.frame = 0; T.markers = []; T.mask = [];
  cv.width = T.w; cv.height = T.h; work.width = T.w; work.height = T.h; page.querySelector('#tr-scrub').max = T.frames - 1;
  await seek(0); draw();
}

// ---------- Saídas para a cena 3D ----------
function trackTo3D(m, scale = 4) { const keys = Object.keys(m.track).map(Number).sort((a, b) => a - b); return keys.map((f) => ({ f, x: (m.track[f][0] / T.w - 0.5) * scale * (T.w / T.h), y: (0.5 - m.track[f][1] / T.h) * scale + scale / 2 })); }
function objectFollows(i = 0) {
  const m = T.markers[i]; if (!m) { toast('Nenhum marcador'); return; }
  const o = createPrimitive('sphere', { name: `Segue marcador ${i + 1}`, scale: [0.25, 0.25, 0.25], color: '#ffcc33' }); content.add(o); bus.emit('scene:changed');
  const pts = trackTo3D(m); const t0 = state.time; state.duration = Math.max(state.duration, T.frames / T.fps);
  pts.forEach(({ f, x, y }, k) => { if (k % 2 && k !== pts.length - 1) return; o.position.set(x, y, 0); insertKey(o, f / T.fps, {}, 'linear', false); });
  state.time = t0; bus.emit('anim:changed'); select(o);
  history.push({ label: 'Objeto segue marcador', undo: () => { content.remove(o); bus.emit('scene:changed'); }, redo: () => { content.add(o); bus.emit('scene:changed'); } });
  toast(`Objeto animado com ${pts.length} quadros do marcador ${i + 1}`);
}
function solveTripod() {
  const valid = T.markers.filter((m) => Object.keys(m.track).length > 2); if (!valid.length) { toast('Rastreie pelo menos um marcador'); return; }
  const cam = createCamera({ name: 'Câmera rastreada', position: [0, 1.6, 6], look_at: [0, 1.6, 0] }); content.add(cam); bus.emit('scene:changed');
  const fov = THREE.MathUtils.degToRad(cam.fov); const fx = (T.h / 2) / Math.tan(fov / 2); const base = cam.rotation.clone();
  for (let f = 0; f < T.frames; f += 2) {
    let dx = 0, dy = 0, n = 0; for (const m of valid) { const a = m.track[m.first], b = m.track[f]; if (a && b) { dx += b[0] - a[0]; dy += b[1] - a[1]; n++; } } if (!n) continue;
    cam.rotation.set(base.x - Math.atan2(dy / n, fx), base.y + Math.atan2(dx / n, fx), base.z); insertKey(cam, f / T.fps, {}, 'linear', false);
  }
  cam.rotation.copy(base); state.duration = Math.max(state.duration, T.frames / T.fps); bus.emit('anim:changed'); select(cam);
  toast('Câmera resolvida (tripé): giro e inclinação animados');
}
function exportMask() {
  if (T.mask.length < 3) { toast('Desenhe a máscara (ferramenta Máscara) com 3+ pontos'); return; }
  const c = document.createElement('canvas'); c.width = T.w; c.height = T.h; const g = c.getContext('2d'); g.drawImage(T.video, 0, 0, T.w, T.h);
  g.globalCompositeOperation = 'destination-in'; g.beginPath(); T.mask.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
  const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `mascara-quadro-${T.frame + 1}.png`; a.click();
}

export function renderTracking(el) {
  page = el;
  el.innerHTML = `<div class="page-wrap tracking"><header class="page-head"><div><h1>Rastreamento de movimento</h1><p>Rastreie pontos de um vídeo, estabilize, resolva a câmera e leve o movimento para a cena 3D.</p></div></header>
    <div class="tr-bar">
      <button class="btn sm" id="tr-open">${icon('upload', 14)} Abrir vídeo</button><i class="pb-sep"></i>
      <div class="seg sm" id="tr-tool"><button data-t="marker" class="on">${icon('Crosshair', 14)} Marcador</button><button data-t="mask">${icon('PenTool', 14)} Máscara</button></div><i class="pb-sep"></i>
      <button class="btn sm" id="tr-run">${icon('play', 14)} Rastrear →</button><button class="btn sm" id="tr-stop">${icon('stop', 14)}</button>
      <label class="tr-chk"><input type="checkbox" id="tr-stab"> Estabilizar</label><i class="pb-sep"></i>
      <button class="btn sm" id="tr-follow">${icon('Magnet', 14)} Objeto segue marcador</button><button class="btn sm" id="tr-solve">${icon('camera', 14)} Resolver câmera (tripé)</button><button class="btn sm" id="tr-mask">${icon('download', 14)} Exportar máscara</button><button class="btn sm" id="tr-clear">${icon('trash', 14)} Limpar</button>
    </div>
    <div class="tr-stage"><canvas id="tr-cv"></canvas><div class="tr-empty" id="tr-empty">${icon('film', 34)}<span>Abra um vídeo (MP4/WebM) para começar</span></div></div>
    <div class="tr-foot"><input type="range" id="tr-scrub" min="0" max="0" value="0"><span class="muted" id="tr-info"></span></div></div>`;
  cv = el.querySelector('#tr-cv'); ctx = cv.getContext('2d', { willReadFrequently: true }); work = document.createElement('canvas'); wctx = work.getContext('2d', { willReadFrequently: true }); ctx.font = '12px sans-serif';
  if (T.video) { cv.width = T.w; cv.height = T.h; work.width = T.w; work.height = T.h; el.querySelector('#tr-empty').remove(); el.querySelector('#tr-scrub').max = T.frames - 1; draw(); }
  el.querySelector('#tr-open').onclick = async () => {
    let f = null; if (window.meshApp?.file) f = await window.meshApp.file.open({ filters: [{ name: 'Vídeo', extensions: ['mp4', 'webm', 'mov', 'mkv'] }] });
    else f = await new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'video/*'; i.onchange = () => res(i.files[0]); i.click(); });
    if (!f) return; try { await loadVideo(f); el.querySelector('#tr-empty')?.remove(); } catch (e) { toast(e.message, { kind: 'error' }); }
  };
  el.querySelector('#tr-tool').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; T.tool = b.dataset.t; el.querySelectorAll('#tr-tool button').forEach((x) => x.classList.toggle('on', x === b)); };
  cv.onclick = (e) => { if (!T.video || T.busy) return; const r = cv.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * T.w, y = ((e.clientY - r.top) / r.height) * T.h;
    if (T.tool === 'mask') T.mask.push([x, y]); else T.markers.push({ id: nextId('trk'), first: T.frame, track: { [T.frame]: [x, y] } }); draw(); };
  el.querySelector('#tr-scrub').oninput = async (e) => { if (!T.video || T.busy) return; T.frame = +e.target.value; await seek(T.frame / T.fps); draw(); };
  el.querySelector('#tr-run').onclick = () => !T.busy && trackForward();
  el.querySelector('#tr-stop').onclick = () => (T.busy = false);
  el.querySelector('#tr-stab').onchange = (e) => { T.stabilize = e.target.checked; draw(); };
  el.querySelector('#tr-follow').onclick = () => objectFollows(0);
  el.querySelector('#tr-solve').onclick = solveTripod;
  el.querySelector('#tr-mask').onclick = exportMask;
  el.querySelector('#tr-clear').onclick = () => { T.markers = []; T.mask = []; draw(); };
}
