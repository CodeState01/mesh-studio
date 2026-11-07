// Barra inferior: dopesheet de animação/áudio ou timeline de vídeo (conforme o workspace).
import { state, bus, select } from '../core/state.js';
import { content, findTarget } from '../core/objects.js';
import { anim, setTime, play, insertKey, addSFX } from '../anim/timeline.js';
import { SFX_PRESETS, playSFX, decodeAudio } from '../fx/audio.js';
import { video, videoPlay, videoSeek, addClip, importMedia, splitAtPlayhead, deleteSelectedClip, exportVideo, renderTimeline as renderVideoTL, videoDuration } from '../video/editor.js';
import { icon } from './icons.js';
import { toast } from './toast.js';

const $ = (s, r = document) => r.querySelector(s);
const NAME_W = 150;
let pps = 80; // pixels por segundo

const tc = (t, fps = state.fps) => {
  const s = Math.floor(t); const f = Math.floor((t - s) * fps);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
};

export function initTimelineUI() {
  bus.on('workspace', () => renderBar());
  bus.on('anim:changed', () => renderDopesheet());
  bus.on('scene:changed', () => renderDopesheet());
  bus.on('selection', () => renderDopesheet());
  bus.on('time', () => { updateHead(); const t = $('#tc'); if (t && state.workspace !== 'video') t.textContent = tc(state.time); });
  bus.on('video:time', (t) => { const e = $('#tc'); if (e && state.workspace === 'video') e.textContent = tc(t, video.fps); });
  bus.on('play', () => renderBar());
  bus.on('video:play', () => renderBar());
  new ResizeObserver(() => (state.workspace === 'video' ? renderVideoTL() : renderDopesheet())).observe($('#timeline'));
  renderBar();
}

function renderBar() {
  const bar = $('#bt-bar');
  if (state.workspace === 'video') {
    bar.innerHTML = `
      <button class="icon-btn" data-a="vstart" title="Início">${icon('prev', 16)}</button>
      <button class="icon-btn ${video.playing ? 'on' : ''}" data-a="vplay" title="Play (Espaço)">${icon(video.playing ? 'pause' : 'play', 16)}</button>
      <span class="tc" id="tc">${tc(video.time, video.fps)}</span><span class="sep"></span>
      <button class="btn sm" data-a="c-scene">${icon('cube', 14)} Cena 3D</button>
      <button class="btn sm" data-a="c-title">${icon('text', 14)} Título</button>
      <button class="btn sm" data-a="c-color">${icon('layers', 14)} Cor</button>
      <button class="btn sm" data-a="c-media">${icon('upload', 14)} Mídia</button>
      <span class="sep"></span>
      <button class="icon-btn" data-a="split" title="Cortar no playhead (S)">${icon('scissors', 16)}</button>
      <button class="icon-btn" data-a="cdel" title="Excluir clipe">${icon('trash', 16)}</button>
      <span class="spacer"></span>
      <span class="lbl">${videoDuration().toFixed(1)}s · ${video.width}×${video.height}</span>
      <button class="btn sm primary" data-a="export">${icon('download', 14)} Exportar vídeo</button>`;
    renderVideoTL();
  } else {
    bar.innerHTML = `
      <button class="icon-btn" data-a="start" title="Início (Shift+←)">${icon('prev', 16)}</button>
      <button class="icon-btn ${state.playing ? 'on' : ''}" data-a="play" title="Play (Espaço)">${icon(state.playing ? 'pause' : 'play', 16)}</button>
      <button class="icon-btn" data-a="end" title="Fim">${icon('next', 16)}</button>
      <span class="tc" id="tc">${tc(state.time)}</span>
      <span class="sep"></span>
      <button class="btn sm" data-a="key" title="Inserir keyframe (I)">${icon('key', 13)} Keyframe</button>
      <select class="field" id="sfx-pick" title="Adicionar SFX no playhead"><option value="">+ SFX…</option>${SFX_PRESETS.map((p) => `<option>${p}</option>`).join('')}</select>
      <button class="btn sm" data-a="audio">${icon('wave', 14)} Áudio</button>
      <span class="spacer"></span>
      <span class="lbl">Duração</span><input class="field" id="dur" type="number" min="1" step="1" value="${state.duration}" style="width:58px">
      <span class="lbl">FPS</span><select class="field" id="fps">${[24, 25, 30, 50, 60].map((f) => `<option ${f === state.fps ? 'selected' : ''}>${f}</option>`).join('')}</select>`;
    renderDopesheet();
  }
  bar.onclick = onBar;
  const dur = $('#dur'); if (dur) { dur.onkeydown = (e) => e.stopPropagation(); dur.onchange = () => { state.duration = Math.max(1, +dur.value); renderDopesheet(); }; }
  const fps = $('#fps'); if (fps) fps.onchange = () => { state.fps = +fps.value; };
  const sp = $('#sfx-pick'); if (sp) sp.onchange = () => { if (sp.value) { addSFX(sp.value, state.time); playSFX(sp.value); toast(`SFX “${sp.value}” em ${state.time.toFixed(2)}s`); } sp.value = ''; };
}

async function onBar(e) {
  const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
  switch (a) {
    case 'play': play(); break;
    case 'start': setTime(0); break;
    case 'end': setTime(state.duration); break;
    case 'key': if (state.selected) { insertKey(state.selected); toast('Keyframe inserido'); } else toast('Selecione um objeto'); break;
    case 'audio': {
      const i = document.createElement('input'); i.type = 'file'; i.accept = 'audio/*';
      i.onchange = async () => {
        const f = i.files[0]; const id = 'aud' + Date.now();
        const duration = await decodeAudio(id, await f.arrayBuffer());
        anim.audio.push({ id, name: f.name, t: state.time, duration, bufferId: id, volume: 1 });
        if (state.time + duration > state.duration) state.duration = Math.ceil(state.time + duration);
        bus.emit('anim:changed'); renderBar(); toast('Áudio adicionado');
      };
      i.click(); break;
    }
    case 'vplay': videoPlay(); break;
    case 'vstart': videoSeek(0); break;
    case 'c-scene': addClip({ kind: 'scene', track: 1, duration: state.duration }); break;
    case 'c-title': addClip({ kind: 'title', track: 2, text: 'Título', color: '#ffffff', duration: 3 }); break;
    case 'c-color': addClip({ kind: 'color', track: 1, color: '#16181c', duration: 2 }); break;
    case 'c-media': {
      const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*,video/*,audio/*';
      i.onchange = async () => { await importMedia(i.files[0]); renderBar(); }; i.click(); break;
    }
    case 'split': splitAtPlayhead(); break;
    case 'cdel': deleteSelectedClip(); break;
    case 'export': exportVideo(); break;
  }
}

// ---------- Dopesheet ----------
function renderDopesheet() {
  if (state.workspace === 'video') return;
  const el = $('#timeline'); const width = el.clientWidth - NAME_W - 16;
  pps = Math.max(20, width / state.duration);
  const objs = content.children.filter((o) => anim.tracks.has(o.userData.id) || o === state.selected);
  const ticks = [];
  const stepS = pps > 60 ? 0.5 : pps > 30 ? 1 : 2;
  for (let s = 0; s <= state.duration + 1e-6; s += stepS) ticks.push(`<i style="left:${s * pps}px"></i>${Number.isInteger(s) ? `<span style="left:${s * pps}px">${s}s</span>` : ''}`);
  el.innerHTML = `
    <div class="tl-ruler" id="tl-ruler">${ticks.join('')}</div>
    ${objs.map((o) => `<div class="tl-row ${o === state.selected ? 'sel' : ''}" data-id="${o.userData.id}">
      <div class="tl-name">${o.name}</div>
      <div class="tl-track">${(anim.tracks.get(o.userData.id) || []).map((k, i) => `<i class="kf" data-k="${i}" style="left:${k.t * pps}px" title="${k.t.toFixed(2)}s · ${k.ease}"></i>`).join('')}</div>
    </div>`).join('')}
    <div class="tl-row"><div class="tl-name">${icon('wave', 13)} SFX</div><div class="tl-track">${anim.sfx.map((s) => `<span class="sfx-pin" style="left:${s.t * pps}px">${s.preset}</span>`).join('')}</div></div>
    ${anim.audio.map((a) => `<div class="tl-row"><div class="tl-name">${icon('wave', 13)} ${a.name}</div><div class="tl-track"><span class="sfx-pin" style="left:${a.t * pps}px;width:${a.duration * pps}px;border-color:#5bd17a;background:rgba(91,209,122,.12);color:#b8f5c8">${a.name}</span></div></div>`).join('')}
    ${!objs.length && !anim.sfx.length ? `<div class="empty">Selecione um objeto e pressione <b>I</b> para inserir um keyframe, ou use os presets em Motion.</div>` : ''}
    <div class="tl-end" style="left:${NAME_W + state.duration * pps}px;right:0"></div>
    <div class="tl-playhead" id="tl-ph"></div>`;
  updateHead();
  const scrub = (e) => { const r = $('#tl-ruler').getBoundingClientRect(); setTime((e.clientX - r.left) / pps); };
  $('#tl-ruler').onpointerdown = (e) => {
    scrub(e); const mv = (ev) => scrub(ev);
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', () => window.removeEventListener('pointermove', mv), { once: true });
  };
  el.querySelectorAll('.tl-row[data-id]').forEach((row) => {
    row.querySelector('.tl-name').onclick = () => select(findTarget(row.dataset.id));
    row.querySelectorAll('.kf').forEach((kf) => {
      kf.onpointerdown = (e) => {
        e.stopPropagation(); const keys = anim.tracks.get(row.dataset.id); const k = keys[+kf.dataset.k]; const x0 = e.clientX, t0 = k.t;
        const mv = (ev) => { k.t = Math.max(0, Math.round((t0 + (ev.clientX - x0) / pps) * state.fps) / state.fps); kf.style.left = k.t * pps + 'px'; };
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); keys.sort((a, b) => a.t - b.t); bus.emit('anim:changed'); setTime(state.time); }, { once: true });
      };
      kf.ondblclick = () => { const keys = anim.tracks.get(row.dataset.id); keys.splice(+kf.dataset.k, 1); if (!keys.length) anim.tracks.delete(row.dataset.id); bus.emit('anim:changed'); };
    });
  });
}

function updateHead() { const ph = $('#tl-ph'); if (ph) ph.style.transform = `translateX(${state.time * pps}px)`; }
