// Cena (outliner) + Inspetor com abas de ícones: Objeto, Malha, Material, UV/Pintura,
// Rig, Física, Animação, Mundo. Campos numéricos com arraste, expressão e valor exato.
import * as THREE from 'three';
import { content, DEG } from '../core/objects.js';
import { state, bus, select, precision } from '../core/state.js';
import { history } from '../core/history.js';
import { applyEnvironment, placePivot } from '../core/viewport.js';
import { applyModifier } from '../core/modifiers.js';
import { edit, ops, setSelectMode, selectedPoints } from '../core/editmode.js';
import { TEXTURES, applyTexture, proceduralTexture, textureFromFile } from '../fx/textures.js';
import { anim, motionPreset, insertKey } from '../anim/timeline.js';
import { updateClip, video } from '../video/editor.js';
import { unwrap, UNWRAPS, paint, paintCanvas, exportPaintTexture } from '../core/uv.js';
import { autoRig, togglePose, resetPose } from '../core/rig.js';
import { getPhys, physics, SHAPES, startSim, stopSim, bake, makeCloth, resetCloth, removeCloth } from '../core/physics.js';
import { runCommand } from '../core/commands.js';
import { getEditApi } from '../core/precision.js';
import { icon } from './icons.js';
import { toast } from './toast.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KIND_ICON = { mesh: 'cube', text: 'text', light: 'light', camera: 'camera', vfx: 'spark', import: 'layers', group: 'group', rigged: 'bone', bone: 'bone' };
const fmt = (v, d = precision.decimals) => (Math.abs(v) < 1e-9 ? '0' : (+v).toFixed(d).replace(/\.?0+$/, ''));

// ---------- Outliner ----------
export function initOutliner() {
  const el = $('#outliner'); const seen = new Set();
  $('#outliner-actions').innerHTML = `<button data-a="add" data-anchor="add" data-tip="Adicionar (Shift+A)">${icon('plus', 16)}</button><button data-a="del" data-tip="Excluir (X)">${icon('trash', 16)}</button>`;
  $('#outliner-actions').onclick = (e) => { const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'del') runCommand('delete'); if (a === 'add') runCommand('add-menu'); };
  const rows = [];
  const render = () => {
    rows.length = 0; content.children.forEach((o) => { rows.push([o, 0]); if (o.isGroup && !o.userData.vfx) o.children.forEach((c) => rows.push([c, 1])); });
    if (!rows.length) { el.innerHTML = `<div class="empty">${icon('layers', 30)}Cena vazia.<br>Shift+A para adicionar.</div>`; return; }
    el.innerHTML = rows.map(([o, d], i) => `
      <div class="ol-row ${d ? 'child' : ''} ${state.selection.includes(o) ? 'sel' : ''} ${o === state.selected ? 'active' : ''}" data-i="${i}" style="${seen.has(o.uuid) ? 'animation:none' : ''}">
        <span class="k">${icon(o.isSkinnedMesh ? 'bone' : KIND_ICON[o.userData.kind] || (o.isLight ? 'light' : o.isCamera ? 'camera' : 'cube'), 15)}</span>
        <span class="n">${esc(o.name)}</span>
        ${anim.tracks.has(o.userData.id) ? '<i class="anim-dot" title="Animado"></i>' : ''}
        <button class="lock ${o.userData.locked ? 'on' : ''}" data-lock="${i}" title="Travar">${icon(o.userData.locked ? 'lock' : 'unlock', 14)}</button>
        <button class="vis ${o.visible ? '' : 'off'}" data-vis="${i}" title="Visível">${icon(o.visible ? 'eye' : 'eyeoff', 14)}</button>
      </div>`).join('');
    rows.forEach(([o]) => seen.add(o.uuid));
  };
  el.onclick = (e) => {
    const vis = e.target.closest('[data-vis]'); if (vis) { const o = rows[+vis.dataset.vis][0]; o.visible = !o.visible; render(); return; }
    const lk = e.target.closest('[data-lock]'); if (lk) { const o = rows[+lk.dataset.lock][0]; o.userData.locked = !o.userData.locked; render(); return; }
    const row = e.target.closest('.ol-row'); if (row) select(rows[+row.dataset.i][0], { toggle: e.shiftKey || e.ctrlKey });
  };
  el.ondblclick = (e) => {
    const row = e.target.closest('.ol-row'); if (!row) return; const o = rows[+row.dataset.i][0];
    const n = row.querySelector('.n'); n.innerHTML = `<input class="field" value="${esc(o.name)}" style="height:22px">`;
    const inp = n.querySelector('input'); inp.focus(); inp.select();
    const done = () => { o.name = inp.value.trim() || o.name; render(); bus.emit('scene:changed'); };
    inp.onblur = done; inp.onkeydown = (ev) => { if (ev.key === 'Enter') inp.blur(); ev.stopPropagation(); };
  };
  ['scene:changed', 'selection', 'anim:changed'].forEach((e) => bus.on(e, render));
  render();
}

// ---------- Inspetor ----------
const TABS = [
  { id: 'object', label: 'Objeto', icon: 'object' }, { id: 'mesh', label: 'Malha', icon: 'mesh' }, { id: 'material', label: 'Material', icon: 'texture' },
  { id: 'uv', label: 'UV e Pintura', icon: 'uv' }, { id: 'rig', label: 'Rig', icon: 'bone' }, { id: 'physics', label: 'Física', icon: 'physics' },
  { id: 'motion', label: 'Animação', icon: 'key' }, { id: 'world', label: 'Mundo', icon: 'globe' },
];
let tab = 'object', lastClip = null;

export function initProperties() {
  const tabs = $('#prop-tabs');
  tabs.innerHTML = TABS.map((t) => `<button class="tab" data-tab="${t.id}" data-tip="${t.label}">${icon(t.icon, 17)}</button>`).join('') + '<i class="bar"></i>';
  tabs.onclick = (e) => { const b = e.target.closest('.tab'); if (b) setTab(b.dataset.tab); };
  bus.on('selection', () => render());
  bus.on('object:transforming', () => syncTransform()); bus.on('object:transformed', () => syncTransform()); bus.on('history', () => syncTransform());
  bus.on('material:changed', () => tab === 'material' && render());
  bus.on('mode', (m) => { if (m === 'edit') setTab('mesh'); else render(); });
  bus.on('edit:selection', () => tab === 'mesh' && state.mode === 'edit' && syncEditFields());
  bus.on('edit:select-mode', () => tab === 'mesh' && state.mode === 'edit' && render());
  bus.on('uv:changed', () => tab === 'uv' && render());
  bus.on('physics', () => tab === 'physics' && render());
  bus.on('video:selection', (c) => { const same = c && lastClip && c.id === lastClip.id && $('#props').contains(document.activeElement); lastClip = c; if (state.workspace === 'video' && !same) renderClip(c); });
  bus.on('workspace', (ws) => { const map = { paint: 'uv', animate: 'motion', vfx: 'object', sculpt: 'mesh' }; if (map[ws]) setTab(map[ws]); else render(); });
  setTab('object');
}

export function setTab(t) {
  tab = t;
  document.querySelectorAll('#prop-tabs .tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  const on = $('#prop-tabs .tab.on'), bar = $('#prop-tabs .bar'); if (on) { bar.style.left = on.offsetLeft + 'px'; bar.style.width = on.offsetWidth + 'px'; }
  render();
}

function render() {
  const el = $('#props'); el.classList.remove('props-anim'); void el.offsetWidth; el.classList.add('props-anim');
  el.onclick = null; el.oninput = null; el.onchange = null; transformRows = [];
  if (state.workspace === 'video') { renderClip(lastClip && video.clips.includes(lastClip) ? lastClip : null); return; }
  const title = TABS.find((x) => x.id === tab);
  const o = state.selected;
  if (tab === 'world') return renderWorld(el);
  if (tab === 'mesh' && state.mode === 'edit') return renderEditMesh(el);
  if (!o) { el.innerHTML = `<div class="empty">${icon(title.icon, 30)}Nada selecionado.<br>Clique num objeto no viewport ou na lista da cena.</div>`; return; }
  ({ object: renderObject, mesh: renderMesh, material: renderMaterial, uv: renderUV, rig: renderRig, physics: renderPhysics, motion: renderMotion }[tab])(el, o);
}

// Campo numérico: arraste horizontal (Shift = fino, Ctrl = passo do snap), clique para digitar, aceita expressões (ex.: 2*3.5).
function numField(axis, value, onChange, step = 0.01, snapStep) {
  const w = document.createElement('div'); w.className = 'num'; w.dataset.axis = axis;
  const inp = document.createElement('input'); inp.value = fmt(value); w.appendChild(inp);
  let sx = 0, sv = 0, moved = false;
  w.addEventListener('pointerdown', (e) => {
    if (document.activeElement === inp) return;
    e.preventDefault(); sx = e.clientX; sv = parseFloat(inp.value) || 0; moved = false; w.setPointerCapture(e.pointerId);
    const mv = (ev) => {
      const d = ev.clientX - sx; if (Math.abs(d) > 2) moved = true; if (!moved) return;
      let v = sv + d * step * (ev.shiftKey ? 0.1 : 1); if (ev.ctrlKey && snapStep) v = Math.round(v / snapStep) * snapStep;
      inp.value = fmt(v); onChange(v, false);
    };
    const up = () => { w.removeEventListener('pointermove', mv); w.removeEventListener('pointerup', up); if (!moved) { inp.focus(); inp.select(); } else onChange(parseFloat(inp.value), true); };
    w.addEventListener('pointermove', mv); w.addEventListener('pointerup', up);
  });
  inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = fmt(value); inp.blur(); } };
  inp.onchange = () => { let v; try { v = Function(`"use strict";return (${inp.value.replace(/,/g, '.')})`)(); } catch { v = parseFloat(inp.value); } if (isFinite(v)) { onChange(v, true); value = v; } inp.value = fmt(value); };
  w.set = (v) => { if (document.activeElement !== inp) inp.value = fmt(v); };
  return w;
}

function vecRow(label, ic, get, set, step, snapStep, targets = () => [state.selected]) {
  const row = document.createElement('div'); row.className = 'row';
  row.innerHTML = `<label>${icon(ic, 14)}${label}</label><div class="vec"></div>`;
  const vec = row.querySelector('.vec'); const fields = []; let before = null;
  ['X', 'Y', 'Z'].forEach((ax, i) => {
    const f = numField(ax, get()[i], (v, commit) => {
      const ts = targets(); if (!before) before = ts.map((o) => [o, history.snapshot(o)]);
      const arr = get(); arr[i] = v; set(arr);
      if (commit) { const rec = before.map(([o, s]) => [o, s, history.snapshot(o)]); history.push({ label: 'Valor exato', undo: () => rec.forEach(([o, s]) => history.restore(o, s)), redo: () => rec.forEach(([o, , a]) => history.restore(o, a)) }); before = null; placePivot(); }
      bus.emit('object:transforming', state.selected);
    }, step, snapStep);
    fields.push(f); vec.appendChild(f);
  });
  row.sync = () => { const a = get(); fields.forEach((f, i) => f.set(a[i])); };
  return row;
}
let transformRows = [];
function syncTransform() { transformRows.forEach((r) => r.sync()); }

const sec = (ic, title, right = '') => `<div class="sec-h">${icon(ic, 14)}<span>${title}</span>${right ? `<span class="r">${right}</span>` : ''}</div>`;

function renderObject(el, o) {
  const multi = state.selection.length > 1;
  el.innerHTML = `<div class="sec">${sec('move', multi ? `Transformação · ${state.selection.length} objetos` : 'Transformação', o.userData.kind || o.type)}<div id="tf"></div></div>`;
  const tf = $('#tf', el);
  const box = () => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
  transformRows = [
    vecRow('Posição', 'move', () => o.position.toArray(), (a) => o.position.fromArray(a), 0.01, precision.moveStep),
    vecRow('Rotação', 'rotate', () => [o.rotation.x / DEG, o.rotation.y / DEG, o.rotation.z / DEG], (a) => o.rotation.set(a[0] * DEG, a[1] * DEG, a[2] * DEG), 0.5, precision.rotateStep),
    vecRow('Escala', 'scale', () => o.scale.toArray(), (a) => o.scale.fromArray(a), 0.01, precision.scaleStep),
    // Dimensões reais (m): mudar aqui ajusta a escala para bater a medida exata
    vecRow('Dimensões', 'ruler', () => box().toArray(), (a) => { const b = box(); ['x', 'y', 'z'].forEach((k, i) => { if (b[k] > 1e-6) o.scale[k] *= a[i] / b[k]; }); }, 0.01, precision.moveStep),
  ];
  transformRows.forEach((r) => tf.appendChild(r));

  const extra = document.createElement('div');
  if (multi) {
    extra.innerHTML = `<div class="sec">${sec('align', 'Alinhar ao ativo')}
      ${['x', 'y', 'z'].map((a) => `<div class="row"><label style="color:var(--${a})">${a.toUpperCase()}</label><div class="grid-btns"><button class="chip" data-cmd="align-${a}-min">${icon('AlignStartVertical', 15)}Mín</button><button class="chip" data-cmd="align-${a}-center">${icon('AlignCenterVertical', 15)}Centro</button><button class="chip" data-cmd="align-${a}-max">${icon('AlignEndVertical', 15)}Máx</button></div></div>`).join('')}</div>
      <div class="sec">${sec('distribute', 'Distribuir igualmente')}<div class="grid-btns">${['x', 'y', 'z'].map((a) => `<button class="chip" data-cmd="distribute-${a}">${icon('distribute', 15)}${a.toUpperCase()}</button>`).join('')}</div></div>
      <div class="sec">${sec('layers', 'Combinar')}<div class="grid-btns"><button class="chip" data-cmd="join">${icon('merge', 15)}Juntar</button><button class="chip" data-cmd="group">${icon('group', 15)}Agrupar</button><button class="chip" data-cmd="boolean">${icon('boolean', 15)}Booleana</button></div></div>`;
  } else if (o.isLight) {
    extra.innerHTML = `<div class="sec">${sec('light', 'Luz')}
      <div class="row"><label>${icon('Palette', 14)}Cor</label><div class="color"><input type="color" id="lc" value="#${o.color.getHexString()}"></div></div>
      <div class="row"><label>${icon('sun', 14)}Potência</label><div class="slider"><input type="range" id="li" min="0" max="${o.isDirectionalLight || o.isHemisphereLight ? 10 : 200}" step="0.1" value="${o.intensity}"><input class="out" id="lio" value="${o.intensity.toFixed(1)}"></div></div>
      ${o.shadow ? `<div class="row"><label>${icon('Contrast', 14)}Sombras</label><label class="toggle"><input type="checkbox" id="ls" ${o.castShadow ? 'checked' : ''}><span></span></label></div>` : ''}</div>`;
  } else if (o.isCamera) {
    extra.innerHTML = `<div class="sec">${sec('camera', 'Câmera')}
      <div class="row"><label>${icon('Focus', 14)}FOV</label><div class="slider"><input type="range" id="fov" min="10" max="120" value="${o.fov}"><input class="out" id="fovo" value="${o.fov.toFixed(0)}"></div></div>
      <div class="row"><label>${icon('ScanLine', 14)}Lente</label><div class="slider"><input type="range" id="lens" min="12" max="200" value="${o.getFocalLength().toFixed(0)}"><input class="out" id="lenso" value="${o.getFocalLength().toFixed(0)}mm"></div></div>
      <button class="btn block" data-cmd="look-through">${icon('camera', 15)} Ver pela câmera <kbd>Num 0</kbd></button></div>`;
  }
  extra.insertAdjacentHTML('beforeend', `<div class="sec">${sec('sliders', 'Ações')}<div class="grid-btns">
    <button class="chip" data-cmd="duplicate">${icon('copy', 15)}Duplicar</button><button class="chip" data-cmd="apply-transform">${icon('check', 15)}Aplicar</button><button class="chip" data-cmd="origin-geometry">${icon('crosshair', 15)}Origem</button>
    <button class="chip" data-cmd="sel-to-cursor">${icon('pivot', 15)}→ Cursor</button><button class="chip" data-cmd="cursor-to-sel">${icon('cursor3d', 15)}Cursor →</button><button class="chip" data-cmd="frame">${icon('frame', 15)}Enquadrar</button></div></div>`);
  el.appendChild(extra);
  el.onclick = (e) => { const b = e.target.closest('[data-cmd]'); if (b) runCommand(b.dataset.cmd); };
  const bindPair = (r, o2, fn) => { const a = $('#' + r, el), b = $('#' + o2, el); if (!a) return; a.oninput = () => { fn(+a.value); b.value = a.value; }; b.onkeydown = (e) => e.stopPropagation(); b.onchange = () => { const v = parseFloat(b.value); if (isFinite(v)) { fn(v); a.value = v; } }; };
  if (o.isLight) { $('#lc', el).oninput = (e) => o.color.set(e.target.value); bindPair('li', 'lio', (v) => (o.intensity = v)); $('#ls', el)?.addEventListener('change', (e) => (o.castShadow = e.target.checked)); }
  if (o.isCamera) { bindPair('fov', 'fovo', (v) => { o.fov = v; o.updateProjectionMatrix(); }); bindPair('lens', 'lenso', (v) => { o.setFocalLength(v); o.updateProjectionMatrix(); }); }
}

function renderMesh(el, o) {
  if (!o.isMesh || o.isPoints) { el.innerHTML = `<div class="empty">${icon('mesh', 30)}Selecione uma malha.</div>`; return; }
  const g = o.geometry; const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
  const em = o.__em;
  el.innerHTML = `<div class="sec">${sec('info', 'Estatísticas')}<div class="info-grid"><div><b>${(em ? em.verts.length : g.attributes.position.count).toLocaleString()}</b><span>vértices</span></div><div><b>${(em ? em.faces.length : Math.round(tris)).toLocaleString()}</b><span>${em ? 'faces' : 'triângulos'}</span></div><div><b>${Math.round(tris).toLocaleString()}</b><span>tri</span></div></div></div>
    <div class="sec">${sec('mesh', 'Edição')}<button class="btn primary block" data-cmd="edit-mode">${icon('mesh', 15)} Editar vértices, arestas e faces <kbd>Tab</kbd></button>
      <div class="grid-btns two" style="margin-top:6px"><button class="chip" data-cmd="shade-smooth">${icon('smooth', 15)}Suave</button><button class="chip" data-cmd="shade-flat">${icon('face', 15)}Facetado</button></div></div>
    <div class="sec">${sec('modifiers', 'Modificadores')}<div class="grid-btns">
      ${[['array', 'Array', 'Copy'], ['mirror', 'Espelhar', 'FlipHorizontal2'], ['subdivide', 'Subdividir', 'Grid3x3'], ['decimate', 'Decimar', 'Minimize2'], ['twist', 'Torcer', 'RotateCw'], ['bend', 'Dobrar', 'Spline']].map(([id, n, ic]) => `<button class="chip" data-m="${id}">${icon(ic, 16)}${n}</button>`).join('')}</div></div>
    <div class="sec">${sec('boolean', 'Booleana')}<button class="btn block" data-cmd="boolean">${icon('boolean', 15)} Unir / Subtrair / Interseção…</button></div>`;
  const MODS = { array: { count: 4, offset: [1.2, 0, 0] }, mirror: { axis: 'x', amount: 0 }, subdivide: { amount: 0.12 }, decimate: { amount: 0.5 }, twist: { amount: 90 }, bend: { amount: 45 } };
  el.onclick = (e) => {
    const c = e.target.closest('[data-cmd]'); if (c) return runCommand(c.dataset.cmd);
    const b = e.target.closest('[data-m]'); if (!b) return;
    try { applyModifier(o, b.dataset.m, MODS[b.dataset.m]); delete o.__em; toast('Modificador aplicado'); bus.emit('scene:changed'); render(); } catch (err) { toast(err.message, { kind: 'error' }); }
  };
}

// Modo de edição: modos, operações e a POSIÇÃO EXATA da seleção (mediana dos vértices)
let editFields = null;
function renderEditMesh(el) {
  el.innerHTML = `<div class="sec">${sec('select', 'Selecionar')}<div class="seg" id="esm">${[['vertex', 'vertex', 'Vértice', '1'], ['edge', 'edge', 'Aresta', '2'], ['face', 'face', 'Face', '3']].map(([m, ic, n, k]) => `<button data-sm="${m}" class="${edit.select === m ? 'on' : ''}" style="flex:1;justify-content:center">${icon(ic, 15)}${n}</button>`).join('')}</div>
      <p class="muted" id="esel" style="font-size:11.5px;margin-top:8px"></p>
      <p class="muted" style="font-size:11px;margin-top:4px">Shift+clique soma · Alt+clique seleciona loop · arraste no vazio seleciona por área</p></div>
    <div class="sec">${sec('crosshair', 'Posição da seleção (mediana)', precision.unit)}<div id="emed"></div></div>
    <div class="sec">${sec('modifier', 'Operações')}<div class="grid-btns">
      ${[['extrude', 'extrude', 'Extrudar', 'E'], ['inset', 'inset', 'Inset', 'I'], ['bevel', 'bevel', 'Bevel', '⌃B'], ['loopcut', 'loopcut', 'Loop Cut', '⌃R'], ['subdivide', 'mesh', 'Subdividir', ''], ['merge', 'merge', 'Merge', 'M'], ['connect', 'knife', 'Conectar', 'J'], ['fill', 'face', 'Preencher', 'F'], ['flip', 'refresh', 'Inverter', '⌥N'], ['select-linked', 'link', 'Ligados', 'L'], ['shade-smooth', 'smooth', 'Suave', ''], ['delete', 'trash', 'Excluir', 'X']].map(([c, ic, n, k]) => `<button class="chip" data-cmd="${c}">${icon(ic, 16)}${n}${k ? `<kbd>${k}</kbd>` : ''}</button>`).join('')}</div></div>
    <button class="btn block" data-cmd="edit-mode">${icon('check', 15)} Concluir edição <kbd>Tab</kbd></button>`;
  $('#esm', el).onclick = (e) => { const b = e.target.closest('[data-sm]'); if (b) { setSelectMode(b.dataset.sm); renderEditMesh(el); } };
  el.onclick = (e) => { const b = e.target.closest('[data-cmd]'); if (b) runCommand(b.dataset.cmd); };
  // Campo XYZ que move a seleção para uma posição exata (em coordenadas do mundo)
  const med = () => { const t = editTargetPoints(); if (!t.length) return [0, 0, 0]; const c = new THREE.Vector3(); t.forEach((p) => c.add(p)); return c.divideScalar(t.length).toArray(); };
  editFields = document.createElement('div'); editFields.className = 'vec'; const fields = [];
  ['X', 'Y', 'Z'].forEach((ax, i) => {
    const f = numField(ax, med()[i], (v, commit) => {
      if (!commit) return; // aplica só ao confirmar (Enter / fim do arraste) → 1 passo de desfazer
      const cur = med(); const d = new THREE.Vector3(); d.setComponent(i, v - cur[i]);
      const api = editApiBegin(); if (!api) return;
      api.applyMatrix(new THREE.Matrix4().makeTranslation(d.x, d.y, d.z)); api.commit('Posição exata');
    }, 0.01, precision.moveStep);
    fields.push(f); editFields.appendChild(f);
  });
  editFields.sync = () => { const m = med(); fields.forEach((f, i) => f.set(m[i])); };
  $('#emed', el).appendChild(editFields); syncEditFields();
}
function syncEditFields() {
  const e = $('#esel'); if (!e) return; editFields?.sync();
  const em = edit.em; if (!em) return;
  e.textContent = `${em.verts.length} vértices · ${em.faces.length} faces · seleção atual no modo ${{ vertex: 'vértice', edge: 'aresta', face: 'face' }[edit.select]}`;
}
// Acesso às posições da seleção de edição (API registrada pelo modo de edição no precision.js)
function editApiBegin() { return getEditApi()?.begin(); }
function editTargetPoints() { return selectedPoints(); }

function renderMaterial(el, o) {
  const m = o.material;
  if (!m || o.isPoints || !m.color) { el.innerHTML = `<div class="empty">${icon('texture', 30)}Este objeto não tem material editável.</div>`; return; }
  const sl = (id, ic, label, v, min = 0, max = 1, step = 0.01) => `<div class="row"><label>${icon(ic, 14)}${label}</label><div class="slider"><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"><input class="out" data-for="${id}" value="${(+v).toFixed(2)}"></div></div>`;
  const tex = o.userData.texture?.name || 'none';
  el.innerHTML = `
    <div class="sec">${sec('texture', 'Superfície PBR')}
      <div class="row"><label>${icon('Palette', 14)}Cor base</label><div class="color"><input type="color" id="mc" value="#${m.color.getHexString()}"><input class="field" id="mch" value="#${m.color.getHexString()}" style="height:28px;font-family:var(--mono);font-size:12px"></div></div>
      ${sl('metalness', 'Magnet', 'Metálico', m.metalness)}${sl('roughness', 'Waves', 'Rugosidade', m.roughness)}
      ${m.clearcoat !== undefined ? sl('clearcoat', 'Sparkle', 'Verniz', m.clearcoat) : ''}
      ${m.transmission !== undefined ? sl('transmission', 'GlassWater', 'Transmissão', m.transmission) : ''}
      ${m.ior !== undefined ? sl('ior', 'Diamond', 'IOR', m.ior, 1, 2.4, 0.01) : ''}
      ${sl('opacity', 'Blend', 'Opacidade', m.opacity)}
    </div>
    <div class="sec">${sec('sun', 'Emissão')}
      <div class="row"><label>${icon('Palette', 14)}Cor</label><div class="color"><input type="color" id="me" value="#${m.emissive.getHexString()}"></div></div>
      ${sl('emissiveIntensity', 'Zap', 'Força', m.emissiveIntensity, 0, 10, 0.05)}
    </div>
    <div class="sec">${sec('image', 'Textura', tex)}
      <div class="grid-btns four" id="texs">${TEXTURES.map((t) => `<button class="chip ${t === tex ? 'on' : ''}" data-t="${t}" data-tip="${t}"><span class="tex-swatch" data-sw="${t}"></span></button>`).join('')}</div>
      <div class="row" style="margin-top:8px"><label>${icon('Repeat', 14)}Repetição</label><div class="slider"><input type="range" id="trep" min="0.25" max="16" step="0.25" value="${o.userData.texture?.scale || 2}"><input class="out" data-for="trep" value="${o.userData.texture?.scale || 2}"></div></div>
      <button class="btn block" id="timg" style="margin-top:6px">${icon('upload', 15)} Importar imagem</button>
    </div>`;
  el.querySelectorAll('input[type=range]').forEach((r) => {
    const out = el.querySelector(`[data-for="${r.id}"]`); const key = r.id;
    const apply = (v) => { if (key === 'trep') { ['map', 'normalMap', 'roughnessMap'].forEach((k) => m[k]?.repeat.set(v, v)); if (o.userData.texture) o.userData.texture.scale = v; return; } m[key] = v; if (key === 'opacity') m.transparent = v < 1; if (key === 'transmission') m.thickness = 0.5; m.needsUpdate = true; };
    r.oninput = () => { apply(+r.value); out.value = (+r.value).toFixed(2); };
    out.onkeydown = (e) => e.stopPropagation(); out.onchange = () => { const v = parseFloat(out.value); if (isFinite(v)) { apply(v); r.value = v; } };
  });
  $('#mc', el).oninput = (e) => { m.color.set(e.target.value); $('#mch', el).value = e.target.value; };
  $('#mch', el).onkeydown = (e) => e.stopPropagation(); $('#mch', el).onchange = (e) => { try { m.color.set(e.target.value); $('#mc', el).value = '#' + m.color.getHexString(); } catch {} };
  $('#me', el).oninput = (e) => m.emissive.set(e.target.value);
  el.querySelectorAll('[data-sw]').forEach((s) => { const t = s.dataset.sw; if (t === 'none') { s.innerHTML = icon('close', 16); s.style.cssText += 'display:grid;place-items:center;background:var(--bg3)'; return; } s.style.backgroundImage = `url(${proceduralTexture(t).image.toDataURL()})`; });
  $('#texs', el).onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; applyTexture(o, b.dataset.t, +$('#trep', el).value); render(); };
  $('#timg', el).onclick = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
    i.onchange = async () => { const t = await textureFromFile(i.files[0]); m.map = t; m.color.set('#ffffff'); m.needsUpdate = true; o.userData.texture = { name: 'imagem', scale: 1 }; toast('Textura aplicada'); render(); };
    i.click();
  };
}

function renderUV(el, o) {
  if (!o.isMesh) { el.innerHTML = `<div class="empty">${icon('uv', 30)}Selecione uma malha.</div>`; return; }
  el.innerHTML = `<div class="sec">${sec('uv', 'Mapa UV')}<canvas class="uv-canvas" id="uvc" width="512" height="512"></canvas></div>
    <div class="sec">${sec('scissors', 'Desdobrar')}<div class="grid-btns">${UNWRAPS.map(([m, n]) => `<button class="chip" data-uw="${m}">${icon({ smart: 'sparkle', box: 'cube', planar: 'plane', sphere: 'sphere', cylinder: 'cylinder' }[m], 16)}${n.split(' ')[0]}</button>`).join('')}</div></div>
    <div class="sec">${sec('paint', 'Pintura de textura')}
      <div class="row"><label>${icon('Palette', 14)}Cor</label><div class="color"><input type="color" id="pc" value="${paint.color}"></div></div>
      <div class="row"><label>${icon('Circle', 14)}Tamanho</label><div class="slider"><input type="range" id="ps" min="2" max="120" value="${paint.size}"><input class="out" value="${paint.size}" data-for="ps"></div></div>
      <div class="grid-btns two"><button class="btn" data-go="paint">${icon('paint', 15)} Ir para Pintar</button><button class="btn" id="pex">${icon('download', 15)} Exportar PNG</button></div></div>`;
  // Desenha as ilhas UV por cima da textura (se houver)
  const cv = $('#uvc', el); const g = cv.getContext('2d'); const W = cv.width;
  const tex = paintCanvas() || o.material?.map?.image; g.fillStyle = '#0d0e10'; g.fillRect(0, 0, W, W);
  if (tex) try { g.globalAlpha = 0.55; g.drawImage(tex, 0, 0, W, W); g.globalAlpha = 1; } catch {}
  const uv = o.geometry.attributes.uv;
  if (uv) { g.strokeStyle = '#e2703f'; g.lineWidth = 1; g.beginPath(); for (let i = 0; i < uv.count; i += 3) { for (let k = 0; k < 3; k++) { const x = uv.getX(i + k) * W, y = (1 - uv.getY(i + k)) * W; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); } g.stroke(); }
  el.onclick = (e) => { const b = e.target.closest('[data-uw]'); if (b) unwrap(o, b.dataset.uw); const go = e.target.closest('[data-go]'); if (go) bus.emit('navigate', { page: go.dataset.go }); };
  $('#pc', el).oninput = (e) => (paint.color = e.target.value);
  $('#ps', el).oninput = (e) => { paint.size = +e.target.value; el.querySelector('[data-for=ps]').value = paint.size; };
  $('#pex', el).onclick = exportPaintTexture;
}

function renderRig(el, o) {
  const sk = o.isSkinnedMesh ? o : null;
  el.innerHTML = sk ? `<div class="sec">${sec('bone', 'Esqueleto', sk.skeleton.bones.length + ' ossos')}
      <div class="grid-btns two"><button class="btn ${state.mode === 'pose' ? 'primary' : ''}" data-cmd="pose-mode">${icon('pose', 15)} ${state.mode === 'pose' ? 'Sair do Pose' : 'Modo Pose'}</button><button class="btn" data-cmd="pose-reset">${icon('refresh', 15)} Resetar</button></div>
      <p class="muted" style="font-size:11.5px;margin-top:8px">No modo Pose, clique num osso e gire. Pressione I para gravar um keyframe da pose.</p></div>
      <div class="sec">${sec('list', 'Ossos')}${sk.skeleton.bones.map((b) => `<div class="ol-row" data-bone="${b.uuid}" style="animation:none">${icon('bone', 14)}<span class="n">${b.name}</span></div>`).join('')}</div>`
    : `<div class="sec">${sec('bone', 'Criar esqueleto')}<p class="muted" style="margin-bottom:10px">Cria uma cadeia de ossos ao longo do maior eixo do modelo e calcula os pesos automaticamente.</p>
      <div class="row"><label>${icon('bone', 14)}Ossos</label><div class="slider"><input type="range" id="bc" min="2" max="12" value="4"><output>4</output></div></div>
      <button class="btn primary block" id="rig">${icon('bone', 15)} Auto-rig</button></div>`;
  el.onclick = (e) => {
    const c = e.target.closest('[data-cmd]'); if (c) { runCommand(c.dataset.cmd); setTimeout(render, 50); }
    if (e.target.closest('#rig')) autoRig(o, +$('#bc', el).value);
    const b = e.target.closest('[data-bone]'); if (b && sk) { const bone = sk.skeleton.bones.find((x) => x.uuid === b.dataset.bone); if (state.mode !== 'pose') runCommand('pose-mode'); select(bone); }
  };
  const bc = $('#bc', el); if (bc) bc.oninput = () => (bc.nextElementSibling.textContent = bc.value);
}

function renderPhysics(el, o) {
  const p = getPhys(o);
  el.innerHTML = `<div class="sec">${sec('physics', 'Corpo rígido')}
      <div class="seg" id="ptype">${[['none', 'Nenhum', 'Ban'], ['dynamic', 'Dinâmico', 'Activity'], ['static', 'Estático', 'Anchor']].map(([v, n, ic]) => `<button data-v="${v}" class="${p.type === v ? 'on' : ''}" style="flex:1;justify-content:center">${icon(ic, 14)}${n}</button>`).join('')}</div>
      ${p.type !== 'none' ? `
      <div class="row" style="margin-top:10px"><label>${icon('cube', 14)}Forma</label><select class="field" id="pshape">${SHAPES.map(([v, n]) => `<option value="${v}" ${p.shape === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      ${[['mass', 'weight', 'Massa (kg)', 0.1, 100, 0.1], ['friction', 'Hand', 'Atrito', 0, 1, 0.01], ['restitution', 'ArrowUpDown', 'Quique', 0, 1, 0.01]].map(([k, ic, n, mi, ma, st]) => `<div class="row"><label>${icon(ic, 14)}${n}</label><div class="slider"><input type="range" data-k="${k}" min="${mi}" max="${ma}" step="${st}" value="${p[k]}"><input class="out" data-o="${k}" value="${p[k]}"></div></div>`).join('')}` : ''}</div>
    <div class="sec">${sec('globe', 'Mundo físico')}
      <div class="row"><label>${icon('ArrowDown', 14)}Gravidade</label><div class="slider"><input type="range" id="grav" min="-30" max="0" step="0.1" value="${physics.gravity}"><input class="out" id="gravo" value="${physics.gravity}"></div></div>
      <div class="row"><label>${icon('plane', 14)}Chão</label><label class="toggle"><input type="checkbox" id="pground" ${physics.ground ? 'checked' : ''}><span></span></label></div>
      <div class="grid-btns" style="margin-top:6px"><button class="chip ${physics.running ? 'on' : ''}" id="psim">${icon(physics.running ? 'stop' : 'play', 16)}${physics.running ? 'Parar' : 'Simular'}</button><button class="chip" id="preset">${icon('refresh', 16)}Resetar</button><button class="chip" id="pbake">${icon('bake', 16)}Assar</button></div></div>
    <div class="sec">${sec('cloth', 'Tecido')}<div class="grid-btns">
      <button class="chip ${o.userData.cloth ? 'on' : ''}" id="cmake">${icon('cloth', 16)}${o.userData.cloth ? 'É tecido' : 'Virar tecido'}</button><button class="chip" id="creset">${icon('refresh', 16)}Resetar</button><button class="chip" id="cremove">${icon('close', 16)}Remover</button></div>
      <p class="muted" style="font-size:11.5px;margin-top:8px">Use um Plano subdividido. A borda de cima fica presa. Dê Play para simular.</p></div>`;
  $('#ptype', el).onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) { p.type = b.dataset.v; render(); } };
  $('#pshape', el)?.addEventListener('change', (e) => (p.shape = e.target.value));
  el.querySelectorAll('[data-k]').forEach((r) => { const out = el.querySelector(`[data-o=${r.dataset.k}]`); r.oninput = () => { p[r.dataset.k] = +r.value; out.value = r.value; }; out.onkeydown = (e) => e.stopPropagation(); out.onchange = () => { p[r.dataset.k] = +out.value; r.value = out.value; }; });
  $('#grav', el).oninput = (e) => { physics.gravity = +e.target.value; $('#gravo', el).value = e.target.value; };
  $('#pground', el).onchange = (e) => (physics.ground = e.target.checked);
  $('#psim', el).onclick = () => { physics.running ? stopSim(false) : startSim(); render(); };
  $('#preset', el).onclick = () => { stopSim(true); render(); };
  $('#pbake', el).onclick = () => bake();
  $('#cmake', el).onclick = () => { if (!o.userData.cloth) makeCloth(o); render(); };
  $('#creset', el).onclick = resetCloth; $('#cremove', el).onclick = () => { removeCloth(o); render(); };
}

function renderMotion(el, o) {
  const P = [['pop_in', 'Pop in', 'ZoomIn'], ['slide_up', 'Subir', 'ArrowUp'], ['slide_left', 'Deslizar', 'ArrowLeft'], ['spin', 'Girar', 'RotateCw'], ['bounce', 'Quicar', 'ArrowDownToLine'], ['drop', 'Cair', 'ArrowDown'], ['float', 'Flutuar', 'Waves'], ['pulse', 'Pulsar', 'HeartPulse'], ['orbit', 'Orbitar', 'Orbit'], ['fade_out', 'Sumir', 'EyeOff']];
  const keys = anim.tracks.get(o.userData.id) || [];
  el.innerHTML = `<div class="sec">${sec('sparkle', 'Motion pronto', 'no playhead')}
    <div class="grid-btns" id="mp">${P.map(([id, n, ic]) => `<button class="chip" data-p="${id}">${icon(ic, 16)}${n}</button>`).join('')}</div>
    <div class="row" style="margin-top:8px"><label>${icon('Timer', 14)}Duração</label><div class="slider"><input type="range" id="md" min="0.2" max="5" step="0.1" value="1"><output>1.0s</output></div></div></div>
    <div class="sec">${sec('key', 'Keyframes', keys.length)}
      <button class="btn block" id="ik">${icon('key', 15)} Inserir keyframe <kbd>I</kbd></button>
      <div style="margin-top:8px">${keys.map((k, i) => `<div class="row" style="grid-template-columns:1fr auto"><span class="mono" style="font-size:11.5px">◆ ${k.t.toFixed(2)}s · ${k.ease}</span><button class="icon-btn" data-dk="${i}" title="Excluir">${icon('trash', 14)}</button></div>`).join('')}</div>
    </div>`;
  $('#md', el).oninput = (e) => (e.target.nextElementSibling.textContent = (+e.target.value).toFixed(1) + 's');
  $('#mp', el).onclick = (e) => { const b = e.target.closest('[data-p]'); if (!b) return; motionPreset(o, b.dataset.p, state.time, +$('#md', el).value); toast('Motion aplicado'); render(); };
  $('#ik', el).onclick = () => { insertKey(o, state.time); render(); };
  el.querySelectorAll('[data-dk]').forEach((b) => (b.onclick = () => { keys.splice(+b.dataset.dk, 1); if (!keys.length) anim.tracks.delete(o.userData.id); bus.emit('anim:changed'); render(); }));
}

function renderWorld(el) {
  const e = state.env; const SK = [['none', 'Sólido', 'Square'], ['studio', 'Estúdio', 'Lamp'], ['sunset', 'Pôr do sol', 'Sunset'], ['night', 'Noite', 'Moon'], ['overcast', 'Nublado', 'Cloud']];
  el.innerHTML = `<div class="sec">${sec('globe', 'Céu')}<div class="grid-btns" id="sky">${SK.map(([s, n, ic]) => `<button class="chip ${e.sky === s ? 'on' : ''}" data-s="${s}">${icon(ic, 16)}${n}</button>`).join('')}</div></div>
    <div class="sec">${sec('sun', 'Ambiente')}
      <div class="row"><label>${icon('Palette', 14)}Fundo</label><div class="color"><input type="color" id="bg" value="${e.background}"></div></div>
      ${[['fog', 'CloudFog', 'Névoa', 0, 0.2, 0.005], ['bloom', 'Sparkles', 'Bloom', 0, 3, 0.01], ['exposure', 'SunMedium', 'Exposição', 0.2, 3, 0.05]].map(([k, ic, n, mi, ma, st]) => `<div class="row"><label>${icon(ic, 14)}${n}</label><div class="slider"><input type="range" data-k="${k}" min="${mi}" max="${ma}" step="${st}" value="${e[k]}"><input class="out" data-o="${k}" value="${e[k]}"></div></div>`).join('')}
    </div>`;
  $('#sky', el).onclick = (ev) => { const b = ev.target.closest('[data-s]'); if (b) { applyEnvironment({ sky: b.dataset.s }); renderWorld(el); } };
  $('#bg', el).oninput = (ev) => applyEnvironment({ background: ev.target.value, sky: 'none' });
  el.querySelectorAll('[data-k]').forEach((r) => { const out = el.querySelector(`[data-o=${r.dataset.k}]`); r.oninput = () => { applyEnvironment({ [r.dataset.k]: +r.value }); out.value = r.value; }; out.onkeydown = (ev) => ev.stopPropagation(); out.onchange = () => { applyEnvironment({ [r.dataset.k]: +out.value }); r.value = out.value; }; });
}

function renderClip(c) {
  const el = $('#props');
  if (!c) { el.innerHTML = `<div class="empty">${icon('film', 30)}Selecione um clipe na timeline de vídeo.</div>`; return; }
  el.innerHTML = `<div class="sec">${sec('film', 'Clipe', c.kind)}
    ${c.kind === 'title' ? `<div class="row"><label>${icon('text', 14)}Texto</label><input class="field" id="ct" value="${esc(c.text)}"></div>` : ''}
    ${c.kind === 'title' || c.kind === 'color' ? `<div class="row"><label>${icon('Palette', 14)}Cor</label><div class="color"><input type="color" id="cc" value="${c.color}"></div></div>` : ''}
    <div class="row"><label>${icon('Blend', 14)}Transição</label><select class="field" id="ctr">${['none', 'fade', 'slide', 'zoom'].map((t) => `<option ${t === c.transition ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="row"><label>${icon('Timer', 14)}Início</label><input class="field" id="cs" type="number" step="0.1" value="${c.start}"></div>
    <div class="row"><label>${icon('Hourglass', 14)}Duração</label><input class="field" id="cd" type="number" step="0.1" value="${c.duration.toFixed(2)}"></div>
    ${c.kind === 'scene' ? `<div class="row"><label>${icon('SkipForward', 14)}Offset</label><input class="field" id="co" type="number" step="0.1" value="${c.offset}"></div>` : ''}</div>`;
  const on = (id, k, num) => { const i = $('#' + id, el); if (!i) return; i.onkeydown = (e) => e.stopPropagation(); i.onchange = i.oninput = () => updateClip(c.id, { [k]: num ? +i.value : i.value }); };
  on('ct', 'text'); on('cc', 'color'); on('ctr', 'transition'); on('cs', 'start', 1); on('cd', 'duration', 1); on('co', 'offset', 1);
}
export { ops };
