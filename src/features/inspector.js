// Aba "Recursos" do inspetor: controles contextuais das features estilo Blender para o objeto ativo.
import { state, bus } from '../core/state.js';
import { content } from '../core/objects.js';
import { runCommand } from '../core/commands.js';
import { icon } from '../ui/icons.js';
import { heat, HEAT_MODES, showHeat, clearHeat } from './heatmap.js';
import { curveOf, setCurve, enterCurveEdit, curveToMesh, isCurveEditing, addCurvePoint, removeCurvePoint } from './curves.js';
import { openNodeEditor, addGeoNodes, removeGeoNodes, PRESET_LABEL } from './geonodes.js';
import { CONSTRAINTS, addConstraint, removeConstraint, captureShapeKey, setShapeKey, clearShapeKeys } from './animx.js';
import { sims, toggleSims, resetSims } from './sims.js';
import { pencil, PLANES, addFrame, pencilToMesh } from './grease.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sec = (ic, t, right = '') => `<div class="sec-h">${icon(ic, 14)}<span>${t}</span>${right ? `<span class="r">${right}</span>` : ''}</div>`;
const num = (k, v, step = 0.01) => `<input class="field sm" type="number" data-k="${k}" value="${+(+v).toFixed(4)}" step="${step}">`;
const objNames = (except) => { const n = []; content.traverse((x) => { if (x.userData.id && x !== except && !x.userData.proxy && !x.isBone) n.push(x.name); }); return n; };

export function renderFeatures(el, o) {
  const parts = [];
  // ---- Pontos de calor ----
  if (o.isMesh) parts.push(`<div class="sec">${sec('Flame', 'Pontos de calor', heat.target === o ? 'ativo' : '')}
    <div class="grid-btns">${HEAT_MODES.map(([id, n]) => `<button class="chip ${heat.target === o && heat.mode === id ? 'on' : ''}" data-heat="${id}" title="${esc(n)}">${esc(n.split(' (')[0])}</button>`).join('')}</div>
    ${heat.target === o ? `<button class="btn sm block" data-heat-off style="margin-top:6px">${icon('eyeoff', 14)} Desligar mapa</button>` : ''}
    ${heat.target === o && heat.mode === 'weights' ? `<div class="row"><label>Osso</label><select class="field sm" data-bone>${o.skeleton.bones.map((b, i) => `<option value="${i}" ${i === heat.bone ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
      <div class="row"><label>Pintar pesos</label><label class="toggle"><input type="checkbox" data-wpaint ${heat.paint ? 'checked' : ''}><span></span></label></div>
      <div class="row"><label>Raio</label><input type="range" data-wr min="0.02" max="1.5" step="0.01" value="${heat.radius}"></div><div class="row"><label>Força</label><input type="range" data-ws min="0.01" max="1" step="0.01" value="${heat.strength}"></div>
      <button class="chip" data-cmd="heat-weights">${icon('Flame', 14)} Recalcular pesos por calor</button>` : ''}</div>`);
  // ---- Curva ----
  const c = curveOf(o);
  if (c) parts.push(`<div class="sec">${sec('Spline', 'Curva', c.points.length + ' pontos')}
    <div class="row"><label>Chanfro (raio)</label>${num('bevel', c.bevel, 0.005)}</div><div class="row"><label>Resolução</label>${num('resolution', c.resolution, 1)}</div>
    <div class="row"><label>Lados do tubo</label>${num('sides', c.sides ?? 8, 1)}</div><div class="row"><label>Tensão</label>${num('tension', c.tension ?? 0.5, 0.05)}</div>
    <div class="row"><label>Fechada</label><label class="toggle"><input type="checkbox" data-closed ${c.closed ? 'checked' : ''}><span></span></label></div>
    <div class="grid-btns two"><button class="chip ${isCurveEditing() ? 'on' : ''}" data-curve-edit>${icon('PenTool', 14)} ${isCurveEditing() ? 'Concluir' : 'Editar pontos'}</button><button class="chip" data-curve-mesh>${icon('mesh', 14)} Converter em malha</button>
    ${isCurveEditing() ? `<button class="chip" data-curve-add>${icon('plus', 14)} Ponto (E)</button><button class="chip" data-curve-del>${icon('trash', 14)} Remover (X)</button>` : ''}</div></div>`);
  // ---- Nós de geometria ----
  if (o.isMesh && !o.isSkinnedMesh && !c) parts.push(`<div class="sec">${sec('Workflow', 'Nós de geometria', o.userData.geonodes ? o.userData.geonodes.nodes.length + ' nós' : '')}
    <button class="btn primary block" data-gn-open>${icon('Workflow', 15)} ${o.userData.geonodes ? 'Abrir editor de nós' : 'Adicionar nós de geometria'}</button>
    <div class="grid-btns" style="margin-top:6px">${Object.entries(PRESET_LABEL).filter(([k]) => k !== 'basic').map(([k, n]) => `<button class="chip" data-gn-preset="${k}">${esc(n)}</button>`).join('')}</div>
    ${o.userData.geonodes ? `<button class="btn sm block" data-gn-remove style="margin-top:6px">${icon('trash', 14)} Remover nós</button>` : ''}</div>`);
  // ---- Desenho (lápis 3D) ----
  if (o.userData.kind === 'gpencil') { const frames = Object.keys(o.userData.gp.frames).length; parts.push(`<div class="sec">${sec('PenLine', 'Desenho (lápis 3D)', frames + ' quadro(s)')}
    <div class="row"><label>Plano</label><select class="field sm" data-plane>${PLANES.map(([v, n]) => `<option value="${v}" ${pencil.plane === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="row"><label>Papel-cebola</label><label class="toggle"><input type="checkbox" data-onion ${pencil.onion ? 'checked' : ''}><span></span></label></div>
    <div class="grid-btns two"><button class="chip" data-gp-frame>${icon('key', 14)} Novo quadro</button><button class="chip" data-gp-copy>${icon('copy', 14)} Duplicar quadro</button><button class="chip" data-gp-mesh>${icon('mesh', 14)} Converter em malha</button><button class="chip" data-cmd="go-draw">${icon('PenLine', 14)} Ir para Desenhar</button></div></div>`); }
  // ---- Simulação ----
  const s = o.userData.sim;
  if (s || o.userData.hair) parts.push(`<div class="sec">${sec('Atom', 'Simulação', sims.running ? 'rodando' : 'pausada')}
    ${s?.type === 'fluid' ? `<div class="row"><label>Viscosidade</label>${num('sim.viscosity', s.viscosity, 0.01)}</div>` : ''}
    ${s?.type === 'gas' ? `<div class="row"><label>Densidade</label>${num('sim.density', s.density, 0.1)}</div><div class="row"><label>Empuxo</label>${num('sim.buoyancy', s.buoyancy, 0.1)}</div>` : ''}
    ${s?.type === 'soft' ? `<div class="row"><label>Rigidez</label>${num('sim.stiffness', s.stiffness, 0.05)}</div><div class="row"><label>Pressão</label>${num('sim.pressure', s.pressure, 0.05)}</div>` : ''}
    ${s?.type === 'ocean' ? `<div class="row"><label>Altura das ondas</label>${num('sim.height', s.height, 0.05)}</div><div class="row"><label>Agitação</label>${num('sim.choppy', s.choppy, 0.05)}</div><div class="row"><label>Velocidade</label>${num('sim.speed', s.speed, 0.1)}</div>` : ''}
    ${o.userData.hair ? `<div class="row"><label>Rigidez do cabelo</label>${num('hair.stiffness', o.userData.hair.stiffness, 0.05)}</div>` : ''}
    <div class="grid-btns two"><button class="chip ${sims.running ? 'on' : ''}" data-sim-toggle>${icon(sims.running ? 'pause' : 'play', 14)} ${sims.running ? 'Pausar' : 'Simular'}</button><button class="chip" data-sim-reset>${icon('refresh', 14)} Reiniciar</button></div></div>`);
  else if (o.isMesh) parts.push(`<div class="sec">${sec('Atom', 'Simulação')}<div class="grid-btns two"><button class="chip" data-cmd="softbody">${icon('Circle', 14)} Corpo mole</button><button class="chip" data-cmd="hair">${icon('Brush', 14)} Cabelo/pelo</button></div></div>`);
  // ---- Shape keys ----
  if (o.isMesh && !c) { const keys = o.userData.shapeKeys || []; parts.push(`<div class="sec">${sec('Blend', 'Shape keys', o.userData.shapeBasis ? keys.length + ' forma(s)' : '')}
    ${keys.map((k, i) => `<div class="row"><label>${esc(k.name)}</label><input type="range" data-sk="${i}" min="0" max="1" step="0.01" value="${k.value}"></div>`).join('')}
    <div class="grid-btns two"><button class="chip" data-sk-cap>${icon('Camera', 14)} ${o.userData.shapeBasis ? 'Capturar forma' : 'Salvar base'}</button>${o.userData.shapeBasis ? `<button class="chip" data-sk-clear>${icon('trash', 14)} Limpar</button>` : ''}</div>
    <p class="muted" style="font-size:11px;margin-top:4px">Salve a base, esculpa/deforme e capture: cada captura vira um controle 0–1.</p></div>`); }
  // ---- Restrições ----
  const cons = o.userData.constraints || []; const names = objNames(o);
  parts.push(`<div class="sec">${sec('Link', 'Restrições', cons.length || '')}
    ${cons.map((cn, i) => `<div class="mod-card"><div class="mod-h">${icon(CONSTRAINTS[cn.type].icon, 14)}<b>${CONSTRAINTS[cn.type].label}</b><span class="spacer"></span><button class="icon-btn" data-cdel="${i}">${icon('trash', 14)}</button></div>
      ${Object.entries(cn.params).map(([k, v]) => k === 'target' ? `<div class="row"><label>Alvo</label><select class="field sm" data-cp="${i}" data-k="${k}"><option value="">—</option>${names.map((n) => `<option ${n === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>` : k === 'up' ? '' : `<div class="row"><label>${k}</label><input class="field sm" type="number" step="0.01" data-cp="${i}" data-k="${k}" value="${v}"></div>`).join('')}</div>`).join('')}
    <select class="field sm" data-cadd style="width:100%;margin-top:4px"><option value="">+ Adicionar restrição…</option>${Object.entries(CONSTRAINTS).map(([k, d]) => `<option value="${k}">${d.label}</option>`).join('')}</select>
    ${o.isSkinnedMesh ? `<button class="chip" data-cmd="add-ik" style="margin-top:6px">${icon('bone', 14)} Adicionar IK (cinemática inversa)</button>` : ''}</div>`);

  el.innerHTML = parts.join('');
  el.querySelectorAll('input,select').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
  const rerender = () => renderFeatures(el, o);
  el.onclick = (e) => {
    const t = (s2) => e.target.closest(s2);
    if (t('[data-cmd]')) return runCommand(t('[data-cmd]').dataset.cmd);
    if (t('[data-heat]')) { try { showHeat(o, t('[data-heat]').dataset.heat); } catch (err) { import('../ui/toast.js').then(({ toast }) => toast(err.message, { kind: 'error' })); } return rerender(); }
    if (t('[data-heat-off]')) { clearHeat(); return rerender(); }
    if (t('[data-curve-edit]')) { isCurveEditing() ? runCommand('curve-edit') : enterCurveEdit(o); return rerender(); }
    if (t('[data-curve-mesh]')) { curveToMesh(o); return rerender(); }
    if (t('[data-curve-add]')) { addCurvePoint(); return rerender(); }
    if (t('[data-curve-del]')) { removeCurvePoint(); return rerender(); }
    if (t('[data-gn-open]')) return openNodeEditor(o);
    if (t('[data-gn-preset]')) { addGeoNodes(o, t('[data-gn-preset]').dataset.gnPreset); return rerender(); }
    if (t('[data-gn-remove]')) { removeGeoNodes(o); return rerender(); }
    if (t('[data-gp-frame]')) { addFrame(false); return rerender(); }
    if (t('[data-gp-copy]')) { addFrame(true); return rerender(); }
    if (t('[data-gp-mesh]')) return pencilToMesh(o);
    if (t('[data-sim-toggle]')) { toggleSims(); return rerender(); }
    if (t('[data-sim-reset]')) { resetSims(); return rerender(); }
    if (t('[data-sk-cap]')) { captureShapeKey(o); return rerender(); }
    if (t('[data-sk-clear]')) { clearShapeKeys(o); return rerender(); }
    if (t('[data-cdel]')) { removeConstraint(o, +t('[data-cdel]').dataset.cdel); return rerender(); }
  };
  el.oninput = (e) => {
    const d = e.target.dataset;
    if (d.sk !== undefined) setShapeKey(o, +d.sk, +e.target.value);
    if (d.wr !== undefined) heat.radius = +e.target.value; if (d.ws !== undefined) heat.strength = +e.target.value;
  };
  el.onchange = (e) => {
    const d = e.target.dataset; const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (d.bone !== undefined) { heat.bone = +v; showHeat(o, 'weights'); }
    if (d.wpaint !== undefined) { heat.paint = v; state.blockPick = v; showHeat(o, 'weights'); }
    if (d.closed !== undefined) setCurve(o, { closed: v });
    if (d.k && c && !d.cp && ['bevel', 'resolution', 'sides', 'tension'].includes(d.k)) setCurve(o, { [d.k]: Math.max(d.k === 'bevel' ? 0.002 : 0, +v) });
    if (d.k?.startsWith('sim.')) o.userData.sim[d.k.slice(4)] = +v;
    if (d.k?.startsWith('hair.')) o.userData.hair[d.k.slice(5)] = +v;
    if (d.plane !== undefined) pencil.plane = v; if (d.onion !== undefined) { pencil.onion = v; bus.emit('time'); }
    if (d.cadd !== undefined && v) { addConstraint(o, v); return rerender(); }
    if (d.cp !== undefined) { const cn = o.userData.constraints[+d.cp]; cn.params[d.k] = d.k === 'target' ? v : +v; }
  };
}
