// Outliner (árvore da cena) + Painel de Propriedades com abas.
import * as THREE from 'three';
import { content, DEG, describe } from '../core/objects.js';
import { state, bus, select } from '../core/state.js';
import { history } from '../core/history.js';
import { applyEnvironment } from '../core/viewport.js';
import { applyModifier, shadeSmooth } from '../core/modifiers.js';
import { TEXTURES, applyTexture, proceduralTexture, textureFromFile } from '../fx/textures.js';
import { anim, motionPreset, insertKey } from '../anim/timeline.js';
import { updateClip, video } from '../video/editor.js';
import { icon } from './icons.js';
import { toast } from './toast.js';

const KIND_ICON = { mesh: 'cube', text: 'text', light: 'light', camera: 'camera', vfx: 'spark', import: 'layers' };
const $ = (s, r = document) => r.querySelector(s);

// ---------- Outliner ----------
export function initOutliner() {
  const el = $('#outliner'); const seen = new Set();
  $('#outliner-actions').innerHTML = `<button data-a="del" title="Excluir (X)">${icon('trash', 15)}</button>`;
  $('#outliner-actions').onclick = (e) => { if (e.target.closest('[data-a=del]')) bus.emit('cmd', 'delete'); };
  const render = () => {
    const items = content.children;
    if (!items.length) { el.innerHTML = `<div class="empty">Cena vazia.<br>Shift+A para adicionar.</div>`; return; }
    // Só linhas novas animam a entrada — re-renderizações não "piscam".
    el.innerHTML = items.map((o, i) => `
      <div class="ol-row ${o === state.selected ? 'sel' : ''}" data-i="${i}" style="${seen.has(o.uuid) ? 'animation:none' : ''}">
        <span class="k">${icon(KIND_ICON[o.userData.kind] || 'cube', 14)}</span>
        <span class="n">${esc(o.name)}</span>
        ${anim.tracks.has(o.userData.id) ? '<i class="anim-dot" title="Animado"></i>' : ''}
        <button class="vis ${o.visible ? '' : 'off'}" data-vis="${i}">${icon(o.visible ? 'eye' : 'eyeoff', 14)}</button>
      </div>`).join('');
    items.forEach((o) => seen.add(o.uuid));
  };
  el.onclick = (e) => {
    const vis = e.target.closest('[data-vis]');
    if (vis) { const o = content.children[+vis.dataset.vis]; o.visible = !o.visible; render(); return; }
    const row = e.target.closest('.ol-row'); if (row) select(content.children[+row.dataset.i]);
  };
  el.ondblclick = (e) => {
    const row = e.target.closest('.ol-row'); if (!row) return; const o = content.children[+row.dataset.i];
    const n = row.querySelector('.n'); n.innerHTML = `<input class="field" value="${esc(o.name)}" style="height:20px">`;
    const inp = n.querySelector('input'); inp.focus(); inp.select();
    const done = () => { o.name = inp.value.trim() || o.name; render(); bus.emit('scene:changed'); };
    inp.onblur = done; inp.onkeydown = (ev) => { if (ev.key === 'Enter') inp.blur(); ev.stopPropagation(); };
  };
  ['scene:changed', 'selection', 'anim:changed'].forEach((e) => bus.on(e, render));
  render();
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Propriedades ----------
const TABS = [
  { id: 'object', label: 'Objeto', icon: 'cube' },
  { id: 'material', label: 'Material', icon: 'texture' },
  { id: 'modifiers', label: 'Modif.', icon: 'modifier' },
  { id: 'motion', label: 'Motion', icon: 'key' },
  { id: 'world', label: 'Mundo', icon: 'globe' },
];
let tab = 'object';
let lastClip = null;

export function initProperties() {
  const tabs = $('#prop-tabs');
  tabs.innerHTML = TABS.map((t) => `<button class="tab" data-tab="${t.id}" title="${t.label}">${icon(t.icon, 14)}<span>${t.label}</span></button>`).join('') + '<i class="bar"></i>';
  tabs.onclick = (e) => { const b = e.target.closest('.tab'); if (b) setTab(b.dataset.tab); };
  bus.on('selection', () => render());
  bus.on('object:transforming', () => syncTransform());
  bus.on('object:transformed', () => syncTransform());
  bus.on('history', () => syncTransform());
  bus.on('material:changed', () => tab === 'material' && render());
  bus.on('video:selection', (c) => {
    const same = c && lastClip && c.id === lastClip.id && $('#props').contains(document.activeElement);
    lastClip = c; if (state.workspace === 'video' && !same) renderClip(c);
  });
  bus.on('workspace', (ws) => { const map = { texture: 'material', animate: 'motion', vfx: 'object' }; if (map[ws]) setTab(map[ws]); else render(); });
  setTab('object');
}

export function setTab(t) {
  tab = t;
  document.querySelectorAll('#prop-tabs .tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  const on = $(`#prop-tabs .tab.on`); const bar = $('#prop-tabs .bar');
  if (on) { bar.style.left = on.offsetLeft + 'px'; bar.style.width = on.offsetWidth + 'px'; }
  render();
}

function render() {
  const el = $('#props'); el.classList.remove('props-anim'); void el.offsetWidth; el.classList.add('props-anim');
  if (state.workspace === 'video') { renderClip(lastClip && video.clips.includes(lastClip) ? lastClip : null); return; }
  const o = state.selected;
  if (tab === 'world') return renderWorld(el);
  if (!o) { el.innerHTML = `<div class="empty">Nada selecionado.<br>Clique num objeto no viewport ou no outliner.</div>`; return; }
  ({ object: renderObject, material: renderMaterial, modifiers: renderModifiers, motion: renderMotion }[tab])(el, o);
}

// Campo numérico com "scrub": arraste horizontal altera o valor, clique edita.
function numField(axis, value, onChange, step = 0.01) {
  const w = document.createElement('div'); w.className = 'num'; w.dataset.axis = axis;
  const inp = document.createElement('input'); inp.value = fmt(value); w.appendChild(inp);
  let sx = 0, sv = 0, moved = false;
  w.addEventListener('pointerdown', (e) => {
    if (document.activeElement === inp) return;
    e.preventDefault(); sx = e.clientX; sv = parseFloat(inp.value) || 0; moved = false; w.setPointerCapture(e.pointerId);
    const mv = (ev) => { const d = ev.clientX - sx; if (Math.abs(d) > 2) moved = true; if (!moved) return; const v = sv + d * step * (ev.shiftKey ? 0.1 : 1); inp.value = fmt(v); onChange(v, false); };
    const up = () => { w.removeEventListener('pointermove', mv); w.removeEventListener('pointerup', up); if (!moved) { inp.focus(); inp.select(); } else onChange(parseFloat(inp.value), true); };
    w.addEventListener('pointermove', mv); w.addEventListener('pointerup', up);
  });
  inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); };
  inp.onchange = () => { let v; try { v = Function(`"use strict";return (${inp.value})`)(); } catch { v = parseFloat(inp.value); } if (isFinite(v)) onChange(v, true); inp.value = fmt(v); };
  w.set = (v) => { if (document.activeElement !== inp) inp.value = fmt(v); };
  return w;
}
const fmt = (v) => (Math.abs(v) < 1e-6 ? '0' : (+v).toFixed(3).replace(/\.?0+$/, ''));

function vecRow(label, get, set, step) {
  const row = document.createElement('div'); row.className = 'row';
  row.innerHTML = `<label>${label}</label><div class="vec"></div>`;
  const vec = row.querySelector('.vec'); const fields = [];
  let before = null;
  ['X', 'Y', 'Z'].forEach((ax, i) => {
    const f = numField(ax, get()[i], (v, commit) => {
      if (!before) before = history.snapshot(state.selected);
      const arr = get(); arr[i] = v; set(arr);
      if (commit) { history.transform(state.selected, before); before = null; }
    }, step);
    fields.push(f); vec.appendChild(f);
  });
  row.sync = () => { const a = get(); fields.forEach((f, i) => f.set(a[i])); };
  return row;
}

let transformRows = [];
function syncTransform() { transformRows.forEach((r) => r.sync()); }

function renderObject(el, o) {
  el.innerHTML = `<div class="sec"><div class="sec-h"><span>Transformação</span><span>${o.userData.kind || o.type}</span></div><div id="tf"></div></div>`;
  const tf = $('#tf', el);
  transformRows = [
    vecRow('Posição', () => o.position.toArray(), (a) => o.position.fromArray(a), 0.01),
    vecRow('Rotação', () => [o.rotation.x / DEG, o.rotation.y / DEG, o.rotation.z / DEG], (a) => o.rotation.set(a[0] * DEG, a[1] * DEG, a[2] * DEG), 0.5),
    vecRow('Escala', () => o.scale.toArray(), (a) => o.scale.fromArray(a), 0.01),
  ];
  transformRows.forEach((r) => tf.appendChild(r));

  const sec = document.createElement('div'); sec.className = 'sec';
  if (o.isLight) {
    sec.innerHTML = `<div class="sec-h">Luz</div>
      <div class="row"><label>Cor</label><div class="color"><input type="color" id="lc" value="#${o.color.getHexString()}"></div></div>
      <div class="row"><label>Intensidade</label><div class="slider"><input type="range" id="li" min="0" max="${o.isDirectionalLight || o.isHemisphereLight ? 10 : 200}" step="0.1" value="${o.intensity}"><output>${o.intensity.toFixed(1)}</output></div></div>
      ${o.shadow ? `<div class="row"><label>Sombras</label><label><input type="checkbox" id="ls" ${o.castShadow ? 'checked' : ''}> projetar</label></div>` : ''}`;
    el.appendChild(sec);
    $('#lc', sec).oninput = (e) => o.color.set(e.target.value);
    $('#li', sec).oninput = (e) => { o.intensity = +e.target.value; e.target.nextElementSibling.textContent = o.intensity.toFixed(1); };
    $('#ls', sec)?.addEventListener('change', (e) => (o.castShadow = e.target.checked));
  } else if (o.isCamera) {
    sec.innerHTML = `<div class="sec-h">Câmera</div>
      <div class="row"><label>FOV</label><div class="slider"><input type="range" id="fov" min="10" max="120" value="${o.fov}"><output>${o.fov.toFixed(0)}°</output></div></div>
      <button class="btn block" id="look">${icon('camera', 15)} Ver pela câmera (Numpad 0)</button>`;
    el.appendChild(sec);
    $('#fov', sec).oninput = (e) => { o.fov = +e.target.value; o.updateProjectionMatrix(); e.target.nextElementSibling.textContent = o.fov + '°'; };
    $('#look', sec).onclick = () => bus.emit('cmd', 'look-through');
  } else if (o.isMesh) {
    const g = o.geometry; const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
    sec.innerHTML = `<div class="sec-h"><span>Malha</span><span>${g.attributes.position.count.toLocaleString()} v · ${Math.round(tris).toLocaleString()} tri</span></div>
      <div class="grid-btns"><button class="chip" id="sm">Suavizar</button><button class="chip" id="fl">Facetar</button><button class="chip" id="ed">Editar (Tab)</button></div>`;
    el.appendChild(sec);
    $('#sm', sec).onclick = () => { shadeSmooth(o, true); render(); };
    $('#fl', sec).onclick = () => { shadeSmooth(o, false); render(); };
    $('#ed', sec).onclick = () => bus.emit('cmd', 'edit-mode');
  }
}

function renderMaterial(el, o) {
  const m = o.material;
  if (!m || o.isPoints || !m.color) { el.innerHTML = `<div class="empty">Este objeto não tem material editável.</div>`; return; }
  const sl = (id, label, v, min = 0, max = 1, step = 0.01) => `<div class="row"><label>${label}</label><div class="slider"><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${(+v).toFixed(2)}</output></div></div>`;
  const tex = o.userData.texture?.name || 'none';
  el.innerHTML = `
    <div class="sec"><div class="sec-h">Superfície · PBR</div>
      <div class="row"><label>Base</label><div class="color"><input type="color" id="mc" value="#${m.color.getHexString()}"><span class="lbl">#${m.color.getHexString()}</span></div></div>
      ${sl('mm', 'Metálico', m.metalness)}${sl('mr', 'Rugosidade', m.roughness)}
      ${m.clearcoat !== undefined ? sl('mcc', 'Verniz', m.clearcoat) : ''}
      ${m.transmission !== undefined ? sl('mt', 'Transmissão', m.transmission) : ''}
      ${sl('mo', 'Opacidade', m.opacity)}
    </div>
    <div class="sec"><div class="sec-h">Emissão</div>
      <div class="row"><label>Cor</label><div class="color"><input type="color" id="me" value="#${m.emissive.getHexString()}"></div></div>
      ${sl('mei', 'Força', m.emissiveIntensity, 0, 10, 0.05)}
    </div>
    <div class="sec"><div class="sec-h"><span>Textura</span><span>${tex}</span></div>
      <div class="grid-btns" id="texs">${TEXTURES.map((t) => `<button class="chip ${t === tex ? 'on' : ''}" data-t="${t}"><span class="tex-swatch" data-sw="${t}"></span>${t}</button>`).join('')}</div>
      <div class="row" style="margin-top:8px"><label>Repetição</label><div class="slider"><input type="range" id="trep" min="0.25" max="16" step="0.25" value="${o.userData.texture?.scale || 2}"><output>${o.userData.texture?.scale || 2}</output></div></div>
      <button class="btn block" id="timg" style="margin-top:6px">${icon('upload', 15)} Importar imagem como textura</button>
    </div>`;
  const bind = (id, fn) => { const i = $('#' + id, el); if (!i) return; i.oninput = (e) => { fn(+e.target.value, e.target.value); const out = e.target.nextElementSibling; if (out?.tagName === 'OUTPUT') out.textContent = (+e.target.value).toFixed(2); m.needsUpdate = true; }; };
  bind('mc', (_, v) => { m.color.set(v); $('#mc', el).nextElementSibling.textContent = v; });
  bind('mm', (v) => (m.metalness = v)); bind('mr', (v) => (m.roughness = v));
  bind('mcc', (v) => (m.clearcoat = v)); bind('mt', (v) => { m.transmission = v; m.thickness = 0.5; });
  bind('mo', (v) => { m.opacity = v; m.transparent = v < 1; });
  bind('me', (_, v) => m.emissive.set(v)); bind('mei', (v) => (m.emissiveIntensity = v));
  // Miniaturas das texturas (geradas uma vez e cacheadas pelo gerador)
  el.querySelectorAll('[data-sw]').forEach((s) => { const t = s.dataset.sw; if (t === 'none') { s.style.background = 'var(--bg3)'; return; } s.style.backgroundImage = `url(${proceduralTexture(t).image.toDataURL()})`; });
  $('#texs', el).onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; applyTexture(o, b.dataset.t, +$('#trep', el).value); render(); };
  $('#trep', el).oninput = (e) => { const v = +e.target.value; e.target.nextElementSibling.textContent = v; ['map', 'normalMap'].forEach((k) => m[k]?.repeat.set(v, v)); if (o.userData.texture) o.userData.texture.scale = v; };
  $('#timg', el).onclick = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
    i.onchange = async () => { const t = await textureFromFile(i.files[0]); m.map = t; m.color.set('#ffffff'); m.needsUpdate = true; o.userData.texture = { name: 'imagem', scale: 1 }; toast('Textura aplicada'); render(); };
    i.click();
  };
}

function renderModifiers(el, o) {
  if (!o.isMesh || o.isPoints) { el.innerHTML = `<div class="empty">Modificadores se aplicam a malhas.</div>`; return; }
  const MODS = [
    ['array', 'Array', 'Cópias em sequência', { count: 4, offset: [1.2, 0, 0] }],
    ['mirror', 'Espelhar', 'Duplica no eixo X', { axis: 'x', amount: 0 }],
    ['subdivide', 'Subdividir', 'Mais polígonos', { amount: 0.12 }],
    ['decimate', 'Decimar', 'Reduz 50% dos vértices', { amount: 0.5 }],
    ['twist', 'Torcer', '90° ao longo de Y', { amount: 90 }],
    ['bend', 'Dobrar', '45° ao longo de Y', { amount: 45 }],
  ];
  el.innerHTML = `<div class="sec"><div class="sec-h">Aplicar modificador</div>
    ${MODS.map(([id, n, d]) => `<button class="btn block" data-m="${id}" style="justify-content:space-between;margin-bottom:4px"><span>${n}</span><span class="lbl" style="color:var(--mute)">${d}</span></button>`).join('')}
    </div><div class="empty" style="padding-top:0">Modificadores são aplicados direto na geometria. Ctrl+Z desfaz.</div>`;
  el.onclick = (e) => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    const mod = MODS.find((m) => m[0] === b.dataset.m);
    try { applyModifier(o, mod[0], mod[3]); toast(mod[1] + ' aplicado'); bus.emit('scene:changed'); render(); } catch (err) { toast(err.message, { kind: 'error' }); }
  };
}

function renderMotion(el, o) {
  const P = [['pop_in', 'Pop in'], ['slide_up', 'Subir'], ['slide_left', 'Deslizar'], ['spin', 'Girar'], ['bounce', 'Quicar'], ['drop', 'Cair'], ['float', 'Flutuar'], ['pulse', 'Pulsar'], ['orbit', 'Orbitar'], ['fade_out', 'Sumir']];
  const keys = anim.tracks.get(o.userData.id) || [];
  el.innerHTML = `<div class="sec"><div class="sec-h"><span>Motion presets</span><span>no playhead</span></div>
    <div class="grid-btns" id="mp">${P.map(([id, n]) => `<button class="chip" data-p="${id}">${n}</button>`).join('')}</div>
    <div class="row" style="margin-top:8px"><label>Duração</label><div class="slider"><input type="range" id="md" min="0.2" max="5" step="0.1" value="1"><output>1.0s</output></div></div></div>
    <div class="sec"><div class="sec-h"><span>Keyframes</span><span>${keys.length}</span></div>
      <button class="btn block" id="ik">${icon('key', 14)} Inserir keyframe (I)</button>
      <div style="margin-top:6px;font:11px var(--mono);color:var(--text2)">${keys.map((k) => `◆ ${k.t.toFixed(2)}s · ${k.ease}`).join('<br>') || ''}</div>
    </div>`;
  $('#md', el).oninput = (e) => (e.target.nextElementSibling.textContent = (+e.target.value).toFixed(1) + 's');
  $('#mp', el).onclick = (e) => { const b = e.target.closest('[data-p]'); if (!b) return; motionPreset(o, b.dataset.p, state.time, +$('#md', el).value); toast('Motion aplicado'); render(); };
  $('#ik', el).onclick = () => { insertKey(o, state.time); render(); };
}

function renderWorld(el) {
  const e = state.env;
  const SK = ['none', 'studio', 'sunset', 'night', 'overcast'];
  el.innerHTML = `<div class="sec"><div class="sec-h">Céu</div><div class="grid-btns" id="sky">${SK.map((s) => `<button class="chip ${e.sky === s ? 'on' : ''}" data-s="${s}">${{ none: 'Sólido', studio: 'Estúdio', sunset: 'Pôr do sol', night: 'Noite', overcast: 'Nublado' }[s]}</button>`).join('')}</div></div>
    <div class="sec"><div class="sec-h">Ambiente</div>
      <div class="row"><label>Fundo</label><div class="color"><input type="color" id="bg" value="${e.background}"></div></div>
      <div class="row"><label>Névoa</label><div class="slider"><input type="range" id="fog" min="0" max="0.2" step="0.005" value="${e.fog}"><output>${e.fog}</output></div></div>
      <div class="row"><label>Bloom</label><div class="slider"><input type="range" id="bl" min="0" max="3" step="0.05" value="${e.bloom}"><output>${e.bloom}</output></div></div>
      <div class="row"><label>Exposição</label><div class="slider"><input type="range" id="ex" min="0.2" max="3" step="0.05" value="${e.exposure}"><output>${e.exposure}</output></div></div>
    </div>`;
  $('#sky', el).onclick = (ev) => { const b = ev.target.closest('[data-s]'); if (b) { applyEnvironment({ sky: b.dataset.s }); renderWorld(el); } };
  $('#bg', el).oninput = (ev) => applyEnvironment({ background: ev.target.value, sky: 'none' });
  for (const [id, k] of [['fog', 'fog'], ['bl', 'bloom'], ['ex', 'exposure']]) $('#' + id, el).oninput = (ev) => { applyEnvironment({ [k]: +ev.target.value }); ev.target.nextElementSibling.textContent = ev.target.value; };
}

function renderClip(c) {
  const el = $('#props');
  if (!c) { el.innerHTML = `<div class="empty">Selecione um clipe na timeline de vídeo.<br><br>Use os botões da barra para adicionar Cena 3D, Título, Cor ou Mídia.</div>`; return; }
  el.innerHTML = `<div class="sec"><div class="sec-h"><span>Clipe</span><span>${c.kind}</span></div>
    ${c.kind === 'title' ? `<div class="row"><label>Texto</label><input class="field" id="ct" value="${esc(c.text)}"></div>` : ''}
    ${c.kind === 'title' || c.kind === 'color' ? `<div class="row"><label>Cor</label><div class="color"><input type="color" id="cc" value="${c.color}"></div></div>` : ''}
    <div class="row"><label>Transição</label><select class="field" id="ctr">${['none', 'fade', 'slide', 'zoom'].map((t) => `<option ${t === c.transition ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="row"><label>Início</label><input class="field" id="cs" type="number" step="0.1" value="${c.start}"></div>
    <div class="row"><label>Duração</label><input class="field" id="cd" type="number" step="0.1" value="${c.duration.toFixed(2)}"></div>
    ${c.kind === 'scene' ? `<div class="row"><label>Offset cena</label><input class="field" id="co" type="number" step="0.1" value="${c.offset}"></div>` : ''}
  </div>`;
  const on = (id, k, num) => { const i = $('#' + id, el); if (!i) return; i.onkeydown = (e) => e.stopPropagation(); i.onchange = i.oninput = () => updateClip(c.id, { [k]: num ? +i.value : i.value }); };
  on('ct', 'text'); on('cc', 'color'); on('ctr', 'transition'); on('cs', 'start', 1); on('cd', 'duration', 1); on('co', 'offset', 1);
}
