// Editor de vídeo não-linear: trilhas, clipes (cena 3D, título, cor, imagem, vídeo, áudio),
// transições, monitor de programa e exportação WebM (vídeo + áudio).
import { state, bus, nextId } from '../core/state.js';
import { renderer, renderFrame, getRenderCamera, frameHooks, gizmo, outlinePass } from '../core/viewport.js';
import { content, helpers } from '../core/objects.js';
import { setTime as setSceneTime } from '../anim/timeline.js';
import { history } from '../core/history.js';
import { audioStream, decodeAudio, playBuffer, stopAllBuffers } from '../fx/audio.js';
import { toast } from '../ui/toast.js';

export const video = { clips: [], time: 0, playing: false, width: 1920, height: 1080, fps: 30 };
const TRACKS = 4; // V1..V3 + A1 (track 0 = áudio)
let monitor, mctx, timelineEl;
const media = new Map(); // clipId -> HTMLImageElement | HTMLVideoElement

export const videoDuration = () => Math.max(5, ...video.clips.map((c) => c.start + c.duration));

export function addClip(c) {
  const clip = {
    id: nextId('clip'), kind: 'scene', track: c.kind === 'audio' ? 0 : 1, start: null, duration: 4,
    text: 'Título', color: '#ff6a3d', transition: 'fade', offset: 0, ...c,
  };
  if (clip.start == null) {
    clip.start = Math.max(0, ...video.clips.filter((x) => x.track === clip.track).map((x) => x.start + x.duration));
  }
  video.clips.push(clip);
  history.push({ label: 'Clipe', undo: () => { video.clips = video.clips.filter((x) => x !== clip); renderTimeline(); }, redo: () => { video.clips.push(clip); renderTimeline(); } });
  renderTimeline(); drawMonitor(); return clip;
}

// ---------- Monitor de programa ----------
export function initVideo(viewportEl, timelineContainer) {
  monitor = document.createElement('canvas'); monitor.className = 'program-monitor';
  monitor.width = 1280; monitor.height = 720; mctx = monitor.getContext('2d');
  viewportEl.appendChild(monitor);
  timelineEl = timelineContainer;
  bus.on('workspace', (ws) => {
    const on = ws === 'video';
    monitor.classList.toggle('on', on);
    // No modo vídeo o viewport renderiza "limpo" (sem grid/gizmo/proxies).
    helpers.visible = !on;
    gizmo.getHelper().visible = !on && ['move', 'rotate', 'scale'].includes(state.tool);
    content.traverse((o) => { if (o.userData.proxy) o.visible = !on; });
    if (on) { outlinePass.selectedObjects = []; renderTimeline(); drawMonitor(); }
  });
  frameHooks.add((dt) => {
    if (!video.playing) return;
    video.time += dt;
    if (video.time >= videoDuration()) { if (recording) stopRecording(); video.time = 0; if (!recording) { stopAllBuffers(); startAudioAt(0); } }
    drawMonitor(); updatePlayhead();
  });
}

const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function drawMonitor() {
  if (!mctx || state.workspace !== 'video') return;
  const W = monitor.width, H = monitor.height, T = video.time;
  mctx.fillStyle = '#000'; mctx.fillRect(0, 0, W, H);
  const active = video.clips.filter((c) => c.track > 0 && T >= c.start && T < c.start + c.duration).sort((a, b) => a.track - b.track);
  for (const c of active) {
    const local = T - c.start; const tin = ease(local / 0.5), tout = ease((c.duration - local) / 0.5);
    const k = Math.min(tin, tout);
    mctx.save();
    if (c.transition === 'fade') mctx.globalAlpha = k;
    if (c.transition === 'slide') mctx.translate((1 - tin) * W * 0.3 - (1 - tout) * W * 0.3, 0);
    if (c.transition === 'zoom') { const s = 0.85 + 0.15 * k; mctx.translate(W / 2, H / 2); mctx.scale(s, s); mctx.translate(-W / 2, -H / 2); mctx.globalAlpha = k; }
    drawClip(c, local, W, H);
    mctx.restore();
  }
}

function drawClip(c, local, W, H) {
  if (c.kind === 'color') { mctx.fillStyle = c.color; mctx.fillRect(0, 0, W, H); }
  else if (c.kind === 'scene') {
    setSceneTime(c.offset + local);
    // Renderiza pela câmera da cena (a mais recente) — não pela câmera do editor.
    let cam = getRenderCamera(); if (!cam) content.traverse((o) => { if (o.isCamera) cam = o; });
    const src = renderer.domElement;
    if (cam) { cam.aspect = src.width / src.height; cam.updateProjectionMatrix(); }
    state.hideOverlays = true; renderFrame(cam || undefined); state.hideOverlays = false; const sa = src.width / src.height, da = W / H;
    let sw = src.width, sh = src.height, sx = 0, sy = 0;
    if (sa > da) { sw = sh * da; sx = (src.width - sw) / 2; } else { sh = sw / da; sy = (src.height - sh) / 2; }
    mctx.drawImage(src, sx, sy, sw, sh, 0, 0, W, H);
  } else if (c.kind === 'image' || c.kind === 'video') {
    const m = media.get(c.id); if (!m) return;
    if (c.kind === 'video' && Math.abs(m.currentTime - (c.offset + local)) > 0.25) m.currentTime = c.offset + local;
    const iw = m.videoWidth || m.naturalWidth, ih = m.videoHeight || m.naturalHeight; if (!iw) return;
    const s = Math.max(W / iw, H / ih); mctx.drawImage(m, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
  } else if (c.kind === 'title') {
    // Título com entrada letra a letra (stagger) — motion tipográfico.
    const text = c.text || ''; const size = Math.round(H * 0.11);
    mctx.font = `700 ${size}px "Inter Tight", "Segoe UI Variable Display", "Segoe UI", sans-serif`;
    mctx.textBaseline = 'middle'; mctx.fillStyle = c.color || '#fff';
    const total = mctx.measureText(text).width; let x = (W - total) / 2;
    const out = ease((c.duration - local) / 0.4);
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]; const t = ease((local - i * 0.035) / 0.45);
      mctx.globalAlpha = Math.min(t, out);
      mctx.fillText(ch, x, H / 2 + (1 - t) * size * 0.6);
      x += mctx.measureText(ch).width;
    }
    mctx.globalAlpha = 1;
  }
}

// ---------- Reprodução ----------
function startAudioAt(t) {
  for (const c of video.clips) if (c.kind === 'audio' && t < c.start + c.duration) {
    const delay = c.start - t;
    if (delay <= 0) playBuffer(c.id, -delay + c.offset); else setTimeout(() => video.playing && playBuffer(c.id, c.offset), delay * 1000);
  }
  for (const c of video.clips) if (c.kind === 'video') { const m = media.get(c.id); if (m) { m.muted = false; } }
}
export function videoPlay(on = !video.playing) {
  video.playing = on; stopAllBuffers();
  if (on) startAudioAt(video.time);
  media.forEach((m) => { if (m.tagName === 'VIDEO') on ? m.play().catch(() => {}) : m.pause(); });
  bus.emit('video:play', on); renderTimeline();
}
export function videoSeek(t) { video.time = Math.max(0, t); drawMonitor(); updatePlayhead(); }

// ---------- Exportação ----------
let recorder = null, recording = false, chunks = [];
export function exportVideo() {
  if (recording) return;
  const stream = monitor.captureStream(video.fps);
  audioStream().getAudioTracks().forEach((t) => stream.addTrack(t));
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm';
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
  chunks = []; recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    if (window.argila?.file) await window.argila.file.save({ name: 'argila-video.webm', data: buf, binary: true, filters: [{ name: 'WebM', extensions: ['webm'] }] });
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'argila-video.webm'; a.click(); }
    toast('Vídeo exportado');
  };
  recording = true; video.time = 0; recorder.start(); videoPlay(true);
  toast(`Gravando ${videoDuration().toFixed(1)}s…`);
}
function stopRecording() { recording = false; videoPlay(false); recorder?.stop(); }

// ---------- Importação de mídia ----------
export async function importMedia(file) {
  const url = URL.createObjectURL(file);
  if (file.type.startsWith('audio')) {
    const clip = addClip({ kind: 'audio', name: file.name, track: 0 });
    clip.duration = await decodeAudio(clip.id, await file.arrayBuffer()); renderTimeline(); return clip;
  }
  if (file.type.startsWith('video')) {
    const v = document.createElement('video'); v.src = url; v.muted = true; v.playsInline = true;
    await new Promise((r) => (v.onloadedmetadata = r));
    const clip = addClip({ kind: 'video', name: file.name, duration: v.duration, track: 2 }); media.set(clip.id, v); return clip;
  }
  const img = new Image(); img.src = url; await img.decode();
  const clip = addClip({ kind: 'image', name: file.name, track: 2 }); media.set(clip.id, img); return clip;
}

export function splitAtPlayhead() {
  const t = video.time; const c = video.clips.find((x) => x.id === selectedClip) || video.clips.find((x) => t > x.start && t < x.start + x.duration);
  if (!c || t <= c.start || t >= c.start + c.duration) return;
  const right = { ...c, id: nextId('clip'), start: t, duration: c.start + c.duration - t, offset: c.offset + (t - c.start) };
  c.duration = t - c.start; video.clips.push(right); if (media.has(c.id)) media.set(right.id, media.get(c.id));
  renderTimeline();
}
export function deleteSelectedClip() { video.clips = video.clips.filter((c) => c.id !== selectedClip); selectedClip = null; renderTimeline(); drawMonitor(); }

// ---------- UI da timeline de vídeo ----------
let selectedClip = null; let pxPerSec = 60;
const KIND_LABEL = { scene: 'Cena 3D', title: 'Título', color: 'Cor', image: 'Imagem', video: 'Vídeo', audio: 'Áudio' };

export function renderTimeline() {
  if (!timelineEl || state.workspace !== 'video') return;
  const dur = videoDuration() + 4;
  pxPerSec = Math.max(30, (timelineEl.clientWidth - 70) / dur);
  const lanes = [3, 2, 1, 0];
  timelineEl.innerHTML = `
    <div class="vt-ruler"><div class="vt-head"></div><div class="vt-scale">${Array.from({ length: Math.ceil(dur) + 1 }, (_, i) => `<span style="left:${i * pxPerSec}px">${i}s</span>`).join('')}</div></div>
    ${lanes.map((l) => `<div class="vt-lane" data-track="${l}"><div class="vt-head">${l === 0 ? 'A1' : 'V' + l}</div><div class="vt-body">
      ${video.clips.filter((c) => c.track === l).map((c) => `<div class="vt-clip k-${c.kind} ${c.id === selectedClip ? 'sel' : ''}" data-id="${c.id}" style="left:${c.start * pxPerSec}px;width:${c.duration * pxPerSec}px">
        <b>${KIND_LABEL[c.kind]}</b><span>${c.kind === 'title' ? escapeHtml(c.text) : c.name || ''}</span><i class="vt-trim"></i></div>`).join('')}
    </div></div>`).join('')}
    <div class="vt-playhead"></div>`;
  updatePlayhead();
  timelineEl.querySelectorAll('.vt-clip').forEach(bindClipDrag);
  timelineEl.querySelector('.vt-scale').onpointerdown = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const seek = (ev) => videoSeek((ev.clientX - r.left) / pxPerSec);
    seek(e); const mv = (ev) => seek(ev); window.addEventListener('pointermove', mv); window.addEventListener('pointerup', () => window.removeEventListener('pointermove', mv), { once: true });
  };
  bus.emit('video:selection', video.clips.find((c) => c.id === selectedClip));
}
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function updatePlayhead() {
  const ph = timelineEl?.querySelector('.vt-playhead'); if (ph) ph.style.transform = `translateX(${70 + video.time * pxPerSec}px)`;
  bus.emit('video:time', video.time);
}

function bindClipDrag(el) {
  el.onpointerdown = (e) => {
    e.stopPropagation(); const c = video.clips.find((x) => x.id === el.dataset.id); selectedClip = c.id;
    const trim = e.target.classList.contains('vt-trim'); const x0 = e.clientX; const s0 = c.start, d0 = c.duration;
    const lanes = [...timelineEl.querySelectorAll('.vt-lane')];
    const mv = (ev) => {
      const dt = (ev.clientX - x0) / pxPerSec;
      if (trim) c.duration = Math.max(0.2, d0 + dt);
      else {
        c.start = Math.max(0, Math.round((s0 + dt) * 10) / 10);
        const lane = lanes.find((l) => { const r = l.getBoundingClientRect(); return ev.clientY >= r.top && ev.clientY < r.bottom; });
        const tr = lane ? +lane.dataset.track : c.track;
        if ((tr === 0) === (c.kind === 'audio')) c.track = tr;
      }
      el.style.left = c.start * pxPerSec + 'px'; el.style.width = c.duration * pxPerSec + 'px';
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); renderTimeline(); drawMonitor(); }, { once: true });
    timelineEl.querySelectorAll('.vt-clip').forEach((x) => x.classList.toggle('sel', x === el));
    bus.emit('video:selection', c);
  };
}

export function updateClip(id, patch) { const c = video.clips.find((x) => x.id === id); if (c) Object.assign(c, patch); renderTimeline(); drawMonitor(); }
export function serializeVideo() { return { clips: video.clips.filter((c) => !['image', 'video', 'audio'].includes(c.kind)) }; }
export function loadVideo(d = {}) { video.clips = d.clips || []; renderTimeline(); }
export const clipCenter = (id) => {
  const el = timelineEl?.querySelector(`[data-id="${id}"]`); if (!el) return null;
  const r = el.getBoundingClientRect(); return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 };
};
