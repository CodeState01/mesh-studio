// Shell da aplicação: comandos, barra de título, menus, workspaces, toolbar,
// atalhos estilo DCC, paleta de comandos, divisórias redimensionáveis e status.
import { registerCommand, runCommand, commands, keyOf } from '../core/commands.js';
import { state, bus, select } from '../core/state.js';
import { history } from '../core/history.js';
import { content, createPrimitive, createText, createLight, createCamera, PRIMITIVES, findTarget } from '../core/objects.js';
import { setTool, setShading, frameSelected, viewAxis, lookThrough, getRenderCamera, captureImage, camera, orbit } from '../core/viewport.js';
import { toggleEditMode, selectAllVerts } from '../core/editmode.js';
import { createVFX, VFX_TYPES } from '../fx/vfx.js';
import { insertKey, play } from '../anim/timeline.js';
import { videoPlay, splitAtPlayhead } from '../video/editor.js';
import { exportModel, importModel, saveProject, openProject, restoreAutosave, loadProject } from '../io/io.js';
import { IMPL } from '../core/tools.js';
import { openSettings } from './aiPanel.js';
import { icon, LOGO } from './icons.js';
import { toast } from './toast.js';
import { askText } from './dialog.js';

const $ = (s, r = document) => r.querySelector(s);

// ---------- Comandos ----------
function addWithUndo(obj, label) {
  content.add(obj); bus.emit('scene:changed'); select(obj);
  history.push({ label, undo: () => { content.remove(obj); select(null); bus.emit('scene:changed'); }, redo: () => { content.add(obj); bus.emit('scene:changed'); } });
}
const PRIM_LABEL = { cube: 'Cubo', sphere: 'Esfera UV', icosphere: 'Icoesfera', cylinder: 'Cilindro', cone: 'Cone', torus: 'Toro', torusknot: 'Nó toroidal', plane: 'Plano', capsule: 'Cápsula', ring: 'Anel' };
const LIGHT_LABEL = { point: 'Pontual', spot: 'Spot', directional: 'Sol', area: 'Área', hemisphere: 'Hemisfério' };
const VFX_LABEL = { fire: 'Fogo', smoke: 'Fumaça', sparks: 'Faíscas', snow: 'Neve', magic: 'Magia', rain: 'Chuva', confetti: 'Confete', dust: 'Poeira' };

function registerAll() {
  const R = (id, label, run, keys, group) => registerCommand({ id, label, run, keys, group });
  // Arquivo
  R('new', 'Novo projeto', () => { if (confirm('Descartar a cena atual?')) loadProject({ version: 1, scene: { metadata: { version: 4.6, type: 'Object' }, object: { type: 'Group', uuid: crypto.randomUUID(), children: [] } } }); }, 'Ctrl+N', 'Arquivo');
  R('open', 'Abrir projeto…', openProject, 'Ctrl+O', 'Arquivo');
  R('save', 'Salvar projeto…', async () => { if (await saveProject()) toast('Projeto salvo'); }, 'Ctrl+S', 'Arquivo');
  R('import', 'Importar modelo (glTF, OBJ, FBX, STL)…', importModel, 'Ctrl+I', 'Arquivo');
  for (const f of ['glb', 'gltf', 'obj', 'stl']) R('export-' + f, `Exportar ${f.toUpperCase()}…`, () => exportModel(f), null, 'Arquivo');
  R('restore', 'Recuperar autosave', () => { if (!restoreAutosave()) toast('Nenhum autosave encontrado'); }, null, 'Arquivo');
  R('render', 'Renderizar imagem (1920×1080)', renderImage, 'F12', 'Render');
  R('render-4k', 'Renderizar imagem 4K', () => renderImage(3840, 2160), null, 'Render');
  // Editar
  R('undo', 'Desfazer', () => history.undo(), 'Ctrl+Z', 'Editar');
  R('redo', 'Refazer', () => history.redo(), 'Ctrl+Shift+Z', 'Editar');
  R('redo2', 'Refazer', () => history.redo(), 'Ctrl+Y');
  R('delete', 'Excluir selecionado', () => { if (state.selected) IMPL.delete_object({ target: state.selected }); }, 'X', 'Editar');
  R('delete2', 'Excluir selecionado', () => runCommand('delete'), 'Delete');
  R('duplicate', 'Duplicar', duplicate, 'Shift+D', 'Editar');
  R('settings', 'Configurações…', () => openSettings(), 'Ctrl+,', 'Editar');
  // Adicionar
  PRIMITIVES.forEach((p) => R('add-' + p, PRIM_LABEL[p], () => addWithUndo(createPrimitive(p), 'Adicionar'), null, 'Adicionar'));
  R('add-text', 'Texto 3D', async () => { const t = await askText('Texto 3D', 'Orbe'); if (t) addWithUndo(createText(t), 'Texto'); }, null, 'Adicionar');
  Object.keys(LIGHT_LABEL).forEach((l) => R('add-light-' + l, 'Luz ' + LIGHT_LABEL[l], () => addWithUndo(createLight(l), 'Luz'), null, 'Luz'));
  R('add-camera', 'Câmera', () => addWithUndo(createCamera(), 'Câmera'), null, 'Luz');
  VFX_TYPES.forEach((v) => R('add-vfx-' + v, 'VFX ' + VFX_LABEL[v], () => addWithUndo(createVFX(v, { position: [0, 0, 0] }), 'VFX'), null, 'VFX'));
  // Ferramentas
  R('tool-select', 'Selecionar', () => setTool('select'), 'W', 'Ferramentas');
  R('tool-move', 'Mover', () => setTool('move'), 'G', 'Ferramentas');
  R('tool-rotate', 'Girar', () => setTool('rotate'), 'R', 'Ferramentas');
  R('tool-scale', 'Escalar', () => setTool('scale'), 'S', 'Ferramentas');
  R('edit-mode', 'Alternar modo de edição', toggleEditMode, 'Tab', 'Ferramentas');
  R('select-all', 'Selecionar tudo / nada', () => (state.mode === 'edit' ? selectAllVerts() : select(state.selected ? null : content.children[0])), 'A', 'Ferramentas');
  R('add-menu', 'Menu Adicionar', () => openAddMenu(lastMouse.x, lastMouse.y), 'Shift+A', 'Ferramentas');
  R('palette', 'Paleta de comandos', openPalette, 'Ctrl+K', 'Ferramentas');
  R('palette2', 'Paleta de comandos', openPalette, 'F3');
  // Exibir
  R('frame', 'Enquadrar seleção', frameSelected, 'NumpadDecimal', 'Exibir');
  R('frame2', 'Enquadrar seleção', frameSelected, 'F');
  R('view-front', 'Vista frontal', () => viewAxis('front'), 'Numpad1', 'Exibir');
  R('view-right', 'Vista direita', () => viewAxis('right'), 'Numpad3', 'Exibir');
  R('view-top', 'Vista de cima', () => viewAxis('top'), 'Numpad7', 'Exibir');
  R('look-through', 'Ver pela câmera ativa', lookThroughToggle, 'Numpad0', 'Exibir');
  ['wire', 'solid', 'material', 'render'].forEach((m, i) => R('shade-' + m, 'Sombreamento: ' + { wire: 'Wireframe', solid: 'Sólido', material: 'Material', render: 'Render' }[m], () => setShading(m), `Shift+${i + 1}`, 'Exibir'));
  R('toggle-ai', 'Mostrar/ocultar assistente', () => $('#main').classList.toggle('ai-hidden'), 'Ctrl+.', 'Exibir');
  // Animação
  R('play', 'Play / Pausa', () => (state.workspace === 'video' ? videoPlay() : play()), 'Space', 'Animação');
  R('keyframe', 'Inserir keyframe', () => { if (state.selected) { insertKey(state.selected); toast('Keyframe ' + state.time.toFixed(2) + 's'); } }, 'I', 'Animação');
  R('split', 'Cortar clipe', splitAtPlayhead, 'Ctrl+B', 'Vídeo');
  // Ajuda
  R('help', 'Atalhos de teclado', showShortcuts, 'F1', 'Ajuda');
  R('mcp', 'Conectar cliente MCP…', () => openSettings('mcp'), null, 'Ajuda');
  R('updates', 'Verificar atualizações', () => openSettings('upd'), null, 'Ajuda');
  bus.on('cmd', (id) => runCommand(id));
}

function duplicate() {
  const o = state.selected; if (!o) return;
  const c = o.clone(); if (o.material) c.material = o.material.clone();
  c.userData = { ...o.userData, id: o.userData.id + 'd' + Date.now().toString(36) };
  c.name = o.name + '.dup'; c.position.x += 0.5;
  if (o.userData.vfx) return addWithUndo(createVFX(o.userData.vfx.type, { ...o.userData.vfx, position: c.position.toArray() }), 'Duplicar');
  addWithUndo(c, 'Duplicar'); setTool('move');
}

function lookThroughToggle() {
  if (getRenderCamera()) { lookThrough(null); return; }
  let cam = state.selected?.isCamera ? state.selected : null;
  if (!cam) content.traverse((o) => { if (!cam && o.isCamera) cam = o; });
  if (!cam) { toast('Adicione uma câmera (Shift+A)'); return; }
  lookThrough(cam);
}
bus.on('camera:view', (c) => $('#cam-badge').classList.toggle('on', !!c));

async function renderImage(w = 1920, h = 1080) {
  let cam = getRenderCamera(); if (!cam) content.traverse((o) => { if (!cam && o.isCamera) cam = o; });
  const url = captureImage(w, h, cam || undefined);
  const data = Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0));
  if (window.orbe?.file) { const p = await window.orbe.file.save({ name: 'render.png', data, binary: true, filters: [{ name: 'PNG', extensions: ['png'] }] }); if (p) toast('Render salvo'); }
  else { const a = document.createElement('a'); a.href = url; a.download = 'render.png'; a.click(); }
}

// ---------- Menus ----------
const MENUS = {
  Arquivo: ['new', 'open', 'save', '-', 'import', '#Exportar', 'export-glb', 'export-gltf', 'export-obj', 'export-stl', '-', 'restore'],
  Editar: ['undo', 'redo', '-', 'duplicate', 'delete', '-', 'palette', 'settings'],
  Adicionar: ['#Malha', ...PRIMITIVES.map((p) => 'add-' + p), 'add-text', '#Luz e câmera', ...Object.keys(LIGHT_LABEL).map((l) => 'add-light-' + l), 'add-camera', '#Efeitos', ...VFX_TYPES.map((v) => 'add-vfx-' + v)],
  Render: ['render', 'render-4k', '-', 'look-through', 'shade-render'],
  Exibir: ['frame', 'view-front', 'view-right', 'view-top', '-', 'shade-wire', 'shade-solid', 'shade-material', 'shade-render', '-', 'toggle-ai'],
  Ajuda: ['help', 'mcp', 'updates'],
};

function menuHTML(items) {
  return items.map((id) => {
    if (id === '-') return '<hr>';
    if (id.startsWith('#')) return `<div class="sub-h">${id.slice(1)}</div>`;
    const c = commands.get(id); if (!c) return '';
    return `<button data-cmd="${id}">${c.label}${c.keys ? `<kbd>${c.keys.replace('Numpad', 'Num ')}</kbd>` : ''}</button>`;
  }).join('');
}

let openPop = null;
function closePop() { openPop?.remove(); openPop = null; document.querySelectorAll('.menus > button').forEach((b) => b.classList.remove('open')); }
function showPop(html, x, y) {
  closePop(); const p = document.createElement('div'); p.className = 'menu-pop'; p.innerHTML = html; document.body.appendChild(p);
  const r = p.getBoundingClientRect();
  p.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'; p.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  p.onclick = (e) => { const b = e.target.closest('[data-cmd]'); if (b) { closePop(); runCommand(b.dataset.cmd); } };
  openPop = p; return p;
}
function openAddMenu(x, y) {
  const extra = [...commands.keys()].filter((k) => k.startsWith('add-') && !MENUS.Adicionar.includes(k) && !k.startsWith('add-menu'));
  showPop(menuHTML([...MENUS.Adicionar, ...(extra.length ? ['#Plugins', ...extra] : [])]), x, y);
}
document.addEventListener('pointerdown', (e) => { if (openPop && !openPop.contains(e.target) && !e.target.closest('.menus,[data-anchor=add]')) closePop(); });

// ---------- Paleta de comandos ----------
function openPalette() {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-bg" style="place-items:start center;padding-top:14vh"><div class="modal palette"><input placeholder="Buscar comando…" id="pal-in"><div class="palette-list" id="pal-list"></div></div></div>`;
  const list = [...commands.values()].filter((c) => c.group);
  let idx = 0, shown = list;
  const draw = () => { $('#pal-list').innerHTML = shown.slice(0, 60).map((c, i) => `<button class="${i === idx ? 'on' : ''}" data-cmd="${c.id}"><span style="opacity:.55;width:74px">${c.group}</span>${c.label}${c.keys ? `<kbd>${c.keys}</kbd>` : ''}</button>`).join(''); };
  const inp = $('#pal-in'); inp.focus(); draw();
  const close = () => (root.innerHTML = '');
  inp.oninput = () => { const q = inp.value.toLowerCase(); shown = list.filter((c) => (c.label + ' ' + c.group).toLowerCase().includes(q)); idx = 0; draw(); };
  inp.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') { idx = Math.min(shown.length - 1, idx + 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); draw(); e.preventDefault(); }
    if (e.key === 'Enter' && shown[idx]) { close(); runCommand(shown[idx].id); }
    if (e.key === 'Escape') close();
  };
  root.querySelector('.modal-bg').onclick = (e) => { const b = e.target.closest('[data-cmd]'); if (b) { close(); runCommand(b.dataset.cmd); } else if (e.target.classList.contains('modal-bg')) close(); };
}

function showShortcuts() {
  const rows = [...commands.values()].filter((c) => c.keys && c.group).map((c) => `<div class="row"><label style="font:11px var(--mono);color:var(--accent)">${c.keys}</label><span>${c.label}</span></div>`).join('');
  $('#modal-root').innerHTML = `<div class="modal-bg"><div class="modal"><div class="modal-h">Atalhos<button class="icon-btn" data-x>✕</button></div><div class="modal-b" style="columns:2;column-gap:24px">${rows}
    <div class="row"><label style="font:11px var(--mono);color:var(--accent)">Botão do meio</label><span>Orbitar (Shift: pan)</span></div>
    <div class="row"><label style="font:11px var(--mono);color:var(--accent)">Alt+Esquerdo</label><span>Orbitar</span></div></div></div></div>`;
  $('#modal-root').onclick = (e) => { if (e.target.closest('[data-x]') || e.target.classList.contains('modal-bg')) $('#modal-root').innerHTML = ''; };
}

// ---------- Construção da UI ----------
const WORKSPACES = [['model', 'Modelagem'], ['texture', 'Texturas'], ['animate', 'Animação'], ['vfx', 'VFX'], ['video', 'Vídeo']];
const lastMouse = { x: 300, y: 200 };

export function initShell() {
  registerAll();
  $('#brand').innerHTML = `${LOGO(20)}<span>orbe</span><small>studio</small>`;
  const menus = $('#menus');
  menus.innerHTML = Object.keys(MENUS).map((m) => `<button data-menu="${m}" ${m === 'Adicionar' ? 'data-anchor="add"' : ''}>${m}</button>`).join('');
  menus.onclick = (e) => {
    const b = e.target.closest('[data-menu]'); if (!b) return;
    if (b.classList.contains('open')) return closePop();
    const r = b.getBoundingClientRect(); const m = b.dataset.menu;
    if (m === 'Adicionar') openAddMenu(r.left, r.bottom + 4); else showPop(menuHTML(MENUS[m]), r.left, r.bottom + 4);
    b.classList.add('open');
  };
  menus.onpointerover = (e) => { const b = e.target.closest('[data-menu]'); if (b && openPop && !b.classList.contains('open')) b.click(); };

  // Workspaces com "pílula" deslizante
  const ws = $('#workspaces');
  ws.innerHTML = WORKSPACES.map(([id, n]) => `<button data-ws="${id}">${n}</button>`).join('') + '<i class="pill"></i>';
  ws.onclick = (e) => { const b = e.target.closest('[data-ws]'); if (b) setWorkspace(b.dataset.ws); };

  // Toolbar
  const tools = [['select', 'select', 'Selecionar (W)'], ['move', 'move', 'Mover (G)'], ['rotate', 'rotate', 'Girar (R)'], ['scale', 'scale', 'Escalar (S)']];
  $('#toolbar').innerHTML = tools.map(([id, ic, tip]) => `<button class="tbtn" data-tool="${id}" data-tip="${tip}">${icon(ic)}</button>`).join('') +
    `<hr><button class="tbtn" data-cmd="edit-mode" data-tip="Modo edição (Tab)">${icon('mesh')}</button>
    <button class="tbtn" data-cmd="add-text" data-anchor="tool-text" data-tip="Texto 3D">${icon('text')}</button>
    <button class="tbtn" data-cmd="add-light-point" data-tip="Luz">${icon('light')}</button>
    <button class="tbtn" data-cmd="add-camera" data-tip="Câmera">${icon('camera')}</button>
    <button class="tbtn" data-cmd="add-vfx-magic" data-tip="VFX">${icon('spark')}</button>
    <hr><button class="tbtn" data-cmd="frame" data-tip="Enquadrar (F)">${icon('frame')}</button>
    <button class="tbtn" data-cmd="render" data-anchor="render" data-tip="Renderizar (F12)">${icon('aperture')}</button>
    <div style="flex:1"></div>
    <button class="tbtn" data-cmd="palette" data-tip="Comandos (Ctrl+K)">${icon('sliders')}</button>
    <button class="tbtn" data-cmd="settings" data-tip="Configurações">${icon('gear')}</button>`;
  $('#toolbar').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.tool) setTool(b.dataset.tool); if (b.dataset.cmd) runCommand(b.dataset.cmd); };
  bus.on('tool', (t) => document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t)));

  // Sobreposições do viewport
  $('#mode-seg').innerHTML = `<button data-m="object" class="on">${icon('cube', 14)} Objeto</button><button data-m="edit">${icon('mesh', 14)} Edição</button>`;
  $('#mode-seg').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b && b.dataset.m !== state.mode) toggleEditMode(); };
  bus.on('mode', (m) => document.querySelectorAll('#mode-seg button').forEach((b) => b.classList.toggle('on', b.dataset.m === m)));
  $('#vp-add').innerHTML = `<button>${icon('plus', 14)} Adicionar</button>`;
  $('#vp-add').onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); openAddMenu(r.left, r.bottom + 4); };
  $('#shading-seg').innerHTML = [['wire', 'Wire'], ['solid', 'Sólido'], ['material', 'Material'], ['render', 'Render']].map(([m, n]) => `<button data-s="${m}" title="Shift+${['wire', 'solid', 'material', 'render'].indexOf(m) + 1}">${n}</button>`).join('');
  $('#shading-seg').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) setShading(b.dataset.s); };
  bus.on('shading', (m) => document.querySelectorAll('#shading-seg button').forEach((b) => b.classList.toggle('on', b.dataset.s === m)));
  $('#vp-hint').textContent = 'Meio: orbitar · Shift+Meio: pan · Roda: zoom · Shift+A: adicionar · Ctrl+K: comandos';

  // Status bar
  const sb = $('#statusbar');
  const drawStatus = () => {
    let tris = 0, objs = 0; content.traverse((o) => { if (o.isMesh && !o.userData.proxy) { objs++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
    sb.innerHTML = `<span>${state.selected ? state.selected.name : 'Nenhuma seleção'}</span><span>${objs} malhas · ${Math.round(tris).toLocaleString()} tri</span><span id="hist-lbl"></span>
      <span class="r"><span><kbd>Shift A</kbd> adicionar</span><span><kbd>G R S</kbd> transformar</span><span><kbd>Tab</kbd> edição</span><span><kbd>I</kbd> keyframe</span></span>`;
  };
  ['scene:changed', 'selection'].forEach((e) => bus.on(e, drawStatus)); drawStatus();
  bus.on('history', ({ label }) => { const h = $('#hist-lbl'); if (h) { h.textContent = label; h.style.color = 'var(--text2)'; } });

  // Status MCP + atualização na barra de título
  const st = $('#tb-status'); let mcpN = 0, upd = null;
  const drawTB = () => {
    st.innerHTML = `${upd?.status === 'ready' ? `<button class="update-chip" id="upd">Atualizar para ${upd.version}</button>` : upd?.status === 'downloading' ? `<span>Baixando ${upd.percent}%</span>` : ''}
      <span title="Clientes MCP conectados"><i class="dot ${mcpN ? 'ok' : ''}"></i>MCP ${mcpN ? mcpN : ''}</span>`;
    $('#upd')?.addEventListener('click', () => window.orbe.update.install());
  };
  window.orbe?.mcp?.onStatus((d) => { mcpN = d.connected; drawTB(); if (d.connected) toast('Cliente MCP conectado'); });
  window.orbe?.update?.on((d) => { upd = d; drawTB(); if (d.status === 'ready') toast(`Versão ${d.version} pronta`, { ms: 8000, action: { label: 'Reiniciar', run: () => window.orbe.update.install() } }); });
  drawTB();

  setupKeys(); setupSplitters();
  window.addEventListener('pointermove', (e) => { lastMouse.x = e.clientX; lastMouse.y = e.clientY; });
}

export function setWorkspace(id) {
  state.workspace = id;
  document.querySelectorAll('[data-ws]').forEach((b) => b.classList.toggle('on', b.dataset.ws === id));
  const on = $(`[data-ws="${id}"]`), pill = $('#workspaces .pill');
  pill.style.left = on.offsetLeft + 'px'; pill.style.width = on.offsetWidth + 'px';
  document.documentElement.style.setProperty('--bottom-h', { video: '300px', animate: '280px' }[id] || '220px');
  if (id === 'vfx') state.pauseVfxWhenStopped = false;
  bus.emit('workspace', id);
}

function setupKeys() {
  const map = new Map(); commands.forEach((c) => c.keys && map.set(c.keys, c.id));
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if ($('#modal-root').children.length && e.key === 'Escape') { $('#modal-root').innerHTML = ''; return; }
    if (e.key === 'Escape') { closePop(); if (state.mode === 'edit') toggleEditMode(); return; }
    const k = keyOf(e);
    // Atalhos de plugins registrados depois também valem
    const id = map.get(k) || [...commands.values()].find((c) => c.keys === k)?.id;
    if (id) { e.preventDefault(); runCommand(id); }
  });
}

function setupSplitters() {
  const drag = (el, onMove) => el.addEventListener('pointerdown', (e) => {
    el.classList.add('drag'); el.setPointerCapture(e.pointerId);
    const mv = (ev) => onMove(ev); const up = () => { el.classList.remove('drag'); el.removeEventListener('pointermove', mv); };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up, { once: true });
  });
  drag($('#splitter-h'), (e) => { const r = $('#center').getBoundingClientRect(); document.documentElement.style.setProperty('--bottom-h', Math.max(120, Math.min(r.height - 160, r.bottom - e.clientY)) + 'px'); });
  drag($('#splitter-v'), (e) => { const aiW = $('#main').classList.contains('ai-hidden') ? 0 : $('#ai').offsetWidth; document.documentElement.style.setProperty('--side-w', Math.max(240, Math.min(520, innerWidth - e.clientX - aiW)) + 'px'); });
}
