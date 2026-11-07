// Shell: navegação por páginas, dock de ferramentas contextual, comandos, atalhos,
// busca rápida (Ctrl+K), menu Adicionar e diálogos.
import { registerCommand, runCommand, commands, keyOf } from '../core/commands.js';
import { state, bus, select } from '../core/state.js';
import { history } from '../core/history.js';
import { content, createPrimitive, createText, createLight, createCamera, PRIMITIVES } from '../core/objects.js';
import { setTool, setShading, frameSelected, viewAxis, lookThrough, getRenderCamera, captureImage } from '../core/viewport.js';
import { toggleEditMode, selectAllVerts, extrude, deleteFaces, setSelectMode, edit } from '../core/editmode.js';
import { booleanOp } from '../core/boolean.js';
import { sculpt, BRUSHES, prepareForSculpt } from '../core/sculpt.js';
import { createVFX, VFX_TYPES } from '../fx/vfx.js';
import { insertKey, play } from '../anim/timeline.js';
import { videoPlay, splitAtPlayhead } from '../video/editor.js';
import { exportModel, importModel, saveProject, openProject, restoreAutosave, loadProject } from '../io/io.js';
import { IMPL } from '../core/tools.js';
import { settings, saveSettings } from '../core/settings.js';
import { renderHome } from './homePage.js';
import { renderSettings } from './settingsPage.js';
import { renderCommands } from './commandsPage.js';
import { renderStore } from '../store/storePage.js';
import { renderCodeLab } from '../code/codeLab.js';
import { renderEngines } from '../engines/enginesPage.js';
import { icon, LOGO } from './icons.js';
import { toast } from './toast.js';
import { askText } from './dialog.js';

const $ = (s, r = document) => r.querySelector(s);

// ---------- Páginas ----------
export const PAGES = [
  { id: 'home', label: 'Início', icon: 'home' },
  { id: 'model', label: 'Modelar', icon: 'cube', ws: 'model' },
  { id: 'sculpt', label: 'Esculpir', icon: 'brush', ws: 'sculpt' },
  { id: 'material', label: 'Materiais', icon: 'texture', ws: 'texture' },
  { id: 'animate', label: 'Animar', icon: 'key', ws: 'animate' },
  { id: 'vfx', label: 'Efeitos', icon: 'spark', ws: 'vfx' },
  { id: 'video', label: 'Vídeo', icon: 'film', ws: 'video' },
  '-',
  { id: 'code', label: 'Código', icon: 'code' },
  { id: 'store', label: 'Loja', icon: 'bag' },
  { id: 'engines', label: 'Engines', icon: 'engine' },
  { id: 'commands', label: 'Comandos', icon: 'list' },
  'flex',
  { id: 'settings', label: 'Ajustes', icon: 'gear' },
];
const RENDER = { home: renderHome, settings: renderSettings, commands: renderCommands, store: renderStore, code: renderCodeLab, engines: renderEngines };
let current = null;

export function navigate(id, section) {
  const p = PAGES.find((x) => x.id === id); if (!p) return;
  current = id;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('on', b.dataset.page === id));
  $('#crumb').innerHTML = `<b>${p.label}</b>`;
  const page = $('#page');
  if (p.ws) {
    page.classList.remove('on'); page.innerHTML = '';
    if (state.mode === 'edit' && p.ws !== 'model') toggleEditMode();
    state.workspace = p.ws;
    const bottom = { animate: '260px', vfx: '200px', video: '300px' }[p.ws];
    $('#center').classList.toggle('no-bottom', !bottom);
    if (bottom) document.documentElement.style.setProperty('--bottom-h', bottom);
    if (p.ws === 'sculpt') setTool('select');
    else if (state.tool === 'select' && p.ws !== 'video') setTool('move');
    bus.emit('workspace', p.ws);
    renderDock();
    window.dispatchEvent(new Event('resize'));
  } else {
    page.innerHTML = ''; page.classList.remove('on'); void page.offsetWidth; page.classList.add('on');
    RENDER[id](page, section);
  }
}
export const setWorkspace = (ws) => navigate(PAGES.find((p) => p.ws === ws)?.id || 'model');

// ---------- Comandos ----------
function addWithUndo(obj, label) {
  content.add(obj); bus.emit('scene:changed'); select(obj);
  history.push({ label, undo: () => { content.remove(obj); select(null); bus.emit('scene:changed'); }, redo: () => { content.add(obj); bus.emit('scene:changed'); } });
}
const PRIM_LABEL = { cube: 'Cubo', sphere: 'Esfera', icosphere: 'Icoesfera', cylinder: 'Cilindro', cone: 'Cone', torus: 'Rosquinha (toro)', torusknot: 'Nó', plane: 'Plano', capsule: 'Cápsula', ring: 'Anel' };
const LIGHT_LABEL = { point: 'Lâmpada', spot: 'Holofote', directional: 'Sol', area: 'Painel de luz', hemisphere: 'Luz ambiente' };
const VFX_LABEL = { fire: 'Fogo', smoke: 'Fumaça', sparks: 'Faíscas', snow: 'Neve', magic: 'Magia', rain: 'Chuva', confetti: 'Confete', dust: 'Poeira' };

function registerAll() {
  const R = (id, label, run, keys, group, desc) => registerCommand({ id, label, run, keys, group, desc });
  // Ir para
  const goKeys = { model: 'Ctrl+1', sculpt: 'Ctrl+2', material: 'Ctrl+3', animate: 'Ctrl+4', vfx: 'Ctrl+5', video: 'Ctrl+6', code: 'Ctrl+7', store: 'Ctrl+8', engines: 'Ctrl+9', home: 'Ctrl+0', settings: 'Ctrl+,' };
  PAGES.filter((p) => p.id).forEach((p) => R('go-' + p.id, 'Ir para ' + p.label, () => navigate(p.id), goKeys[p.id], 'Ir'));
  // Arquivo
  R('new', 'Novo projeto', () => { if (confirm('Descartar a cena atual?')) loadProject({ version: 1, scene: { metadata: { version: 4.6, type: 'Object' }, object: { type: 'Group', uuid: crypto.randomUUID(), children: [] } } }); }, 'Ctrl+N', 'Arquivo');
  R('open', 'Abrir projeto…', openProject, 'Ctrl+O', 'Arquivo');
  R('save', 'Salvar projeto…', async () => { if (await saveProject()) toast('Projeto salvo'); }, 'Ctrl+S', 'Arquivo');
  R('import', 'Importar modelo (glTF, OBJ, FBX, STL)…', importModel, 'Ctrl+I', 'Arquivo');
  for (const f of ['glb', 'gltf', 'obj', 'stl']) R('export-' + f, `Exportar ${f.toUpperCase()}…`, () => exportModel(f), null, 'Arquivo');
  R('restore', 'Recuperar autosave', () => { if (!restoreAutosave()) toast('Nenhum autosave encontrado'); }, null, 'Arquivo');
  R('render', 'Renderizar imagem (Full HD)', () => renderImage(), 'F12', 'Render', 'Salva um PNG pela câmera da cena');
  R('render-4k', 'Renderizar imagem 4K', () => renderImage(3840, 2160), null, 'Render');
  // Editar
  R('undo', 'Desfazer', () => history.undo(), 'Ctrl+Z', 'Editar');
  R('redo', 'Refazer', () => history.redo(), 'Ctrl+Shift+Z', 'Editar');
  registerCommand({ id: 'redo2', label: 'Refazer', run: () => history.redo(), keys: 'Ctrl+Y' });
  R('delete', 'Excluir', () => { if (state.mode === 'edit') return deleteFaces(); if (state.selected) IMPL.delete_object({ target: state.selected }); }, 'X', 'Editar', 'No modo Face, exclui as faces');
  registerCommand({ id: 'delete2', label: 'Excluir', run: () => runCommand('delete'), keys: 'Delete' });
  R('duplicate', 'Duplicar', duplicate, 'Shift+D', 'Editar');
  // Adicionar
  PRIMITIVES.forEach((p) => R('add-' + p, PRIM_LABEL[p], () => addWithUndo(createPrimitive(p), 'Adicionar'), null, 'Adicionar'));
  R('add-text', 'Texto 3D', async () => { const t = await askText('Texto 3D', 'Argila'); if (t) addWithUndo(createText(t), 'Texto'); }, null, 'Adicionar');
  Object.keys(LIGHT_LABEL).forEach((l) => R('add-light-' + l, LIGHT_LABEL[l], () => addWithUndo(createLight(l), 'Luz'), null, 'Luz'));
  R('add-camera', 'Câmera', () => addWithUndo(createCamera(), 'Câmera'), null, 'Luz');
  VFX_TYPES.forEach((v) => R('add-vfx-' + v, VFX_LABEL[v], () => addWithUndo(createVFX(v, { position: [0, 0, 0] }), 'VFX'), null, 'VFX'));
  // Ferramentas
  R('tool-select', 'Selecionar', () => setTool('select'), 'W', 'Ferramentas');
  R('tool-move', 'Mover', () => setTool('move'), 'G', 'Ferramentas');
  R('tool-rotate', 'Girar', () => setTool('rotate'), 'R', 'Ferramentas');
  R('tool-scale', 'Escalar', () => setTool('scale'), 'S', 'Ferramentas');
  R('add-menu', 'Menu Adicionar', () => openAddMenu(lastMouse.x, lastMouse.y), 'Shift+A', 'Ferramentas');
  R('palette', 'Buscar comando', openPalette, 'Ctrl+K', 'Ferramentas');
  registerCommand({ id: 'palette2', label: 'Buscar comando', run: openPalette, keys: 'F3' });
  // Modelagem
  R('edit-mode', 'Editar malha (entrar/sair)', toggleEditMode, 'Tab', 'Modelagem', 'Vértices e faces');
  R('select-vertex', 'Selecionar vértices', () => state.mode === 'edit' && setSelectMode('vertex'), '1', 'Modelagem');
  R('select-face', 'Selecionar faces', () => state.mode === 'edit' && setSelectMode('face'), '2', 'Modelagem');
  R('select-all', 'Selecionar tudo / nada', () => (state.mode === 'edit' ? selectAllVerts() : select(state.selected ? null : content.children[0])), 'A', 'Modelagem');
  R('extrude', 'Extrudar faces', () => { if (state.mode !== 'edit') { toast('Entre no modo Editar (Tab) e selecione faces'); return; } extrude(); }, 'E', 'Modelagem', 'Puxa as faces selecionadas para fora');
  R('boolean', 'Booleana (unir / subtrair / interseção)…', openBoolean, 'Ctrl+Shift+B', 'Modelagem');
  // Escultura
  BRUSHES.forEach(([id, n]) => R('brush-' + id, 'Pincel: ' + n, () => { if (current !== 'sculpt') navigate('sculpt'); sculpt.brush = id; renderDock(); }, null, 'Escultura'));
  R('sculpt-prepare', 'Preparar malha para esculpir', () => prepareForSculpt(), null, 'Escultura', 'Subdivide para ter detalhe');
  // Exibir
  R('frame', 'Enquadrar seleção', frameSelected, 'F', 'Exibir');
  registerCommand({ id: 'frame2', label: 'Enquadrar seleção', run: frameSelected, keys: 'NumpadDecimal' });
  R('view-front', 'Vista frontal', () => viewAxis('front'), 'Numpad1', 'Exibir');
  R('view-right', 'Vista lateral', () => viewAxis('right'), 'Numpad3', 'Exibir');
  R('view-top', 'Vista de cima', () => viewAxis('top'), 'Numpad7', 'Exibir');
  R('look-through', 'Ver pela câmera', lookThroughToggle, 'Numpad0', 'Exibir');
  ['wire', 'solid', 'material', 'render'].forEach((m, i) => R('shade-' + m, 'Visual: ' + { wire: 'Arame', solid: 'Sólido', material: 'Material', render: 'Render' }[m], () => setShading(m), `Shift+${i + 1}`, 'Exibir'));
  R('toggle-ai', 'Mostrar/ocultar assistente', toggleAI, 'Ctrl+.', 'Exibir');
  // Animação / vídeo
  R('play', 'Play / Pausa', () => (state.workspace === 'video' ? videoPlay() : play()), 'Space', 'Animação');
  R('keyframe', 'Inserir keyframe', () => { if (state.selected) { insertKey(state.selected); toast('Keyframe em ' + state.time.toFixed(2) + 's'); } }, 'I', 'Animação');
  R('split', 'Cortar clipe no playhead', splitAtPlayhead, 'Ctrl+B', 'Vídeo');
  // Ajuda
  R('help', 'Ver todos os comandos', () => navigate('commands'), 'F1', 'Ajuda');
  R('mcp', 'Conectar outra IA via MCP', () => navigate('settings', 'mcp'), null, 'Ajuda');
  R('updates', 'Verificar atualizações', () => navigate('settings', 'updates'), null, 'Ajuda');
  bus.on('cmd', (id) => runCommand(id));
  bus.on('navigate', ({ page, section }) => navigate(page, section));
}

function toggleAI() { const m = $('#main'); m.classList.toggle('ai-hidden'); settings.prefs.aiOpen = !m.classList.contains('ai-hidden'); saveSettings(); drawStatus(); window.dispatchEvent(new Event('resize')); }

function duplicate() {
  const o = state.selected; if (!o) return;
  if (o.userData.vfx) return addWithUndo(createVFX(o.userData.vfx.type, { ...o.userData.vfx, position: o.position.toArray() }), 'Duplicar');
  const c = o.clone(); c.traverse((x) => { if (x.material) x.material = x.material.clone(); });
  c.userData = { ...o.userData, id: o.userData.id + 'd' + Date.now().toString(36) };
  c.name = o.name + '.cópia'; c.position.x += 0.6;
  addWithUndo(c, 'Duplicar'); setTool('move');
}

function lookThroughToggle() {
  if (getRenderCamera()) { lookThrough(null); return; }
  let cam = state.selected?.isCamera ? state.selected : null;
  if (!cam) content.traverse((o) => { if (!cam && o.isCamera) cam = o; });
  if (!cam) { toast('Adicione uma câmera primeiro'); return; }
  lookThrough(cam);
}
bus.on('camera:view', (c) => $('#cam-badge').classList.toggle('on', !!c));

async function renderImage(w = 1920, h = 1080) {
  let cam = getRenderCamera(); if (!cam) content.traverse((o) => { if (!cam && o.isCamera) cam = o; });
  const url = captureImage(w, h, cam || undefined);
  const data = Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0));
  if (window.argila?.file) { const p = await window.argila.file.save({ name: 'render.png', data, binary: true, filters: [{ name: 'PNG', extensions: ['png'] }] }); if (p) toast('Render salvo'); }
  else { const a = document.createElement('a'); a.href = url; a.download = 'render.png'; a.click(); }
}

// ---------- Booleana ----------
function openBoolean() {
  const a = state.selected;
  if (!a?.isMesh) { toast('Selecione a malha principal primeiro'); return; }
  const others = content.children.filter((o) => o.isMesh && o !== a && !o.userData.vfx);
  if (!others.length) { toast('Adicione outra malha para combinar'); return; }
  let b = others[0], op = 'subtract';
  const root = $('#modal-root');
  const draw = () => {
    root.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(460px,92vw)"><div class="modal-h">Booleana em “${a.name}”</div><div class="modal-b">
      <div class="seg" id="bop">${[['union', 'Unir'], ['subtract', 'Subtrair'], ['intersect', 'Interseção']].map(([k, n]) => `<button data-o="${k}" class="${k === op ? 'on' : ''}">${n}</button>`).join('')}</div>
      <p class="muted" style="margin-top:12px">Com qual objeto? (ele será consumido)</p>
      <div class="bool-list">${others.map((o, i) => `<button data-i="${i}" class="${o === b ? 'on' : ''}">${o.name}</button>`).join('')}</div></div>
      <div class="modal-f"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Aplicar</button></div></div></div>`;
    root.querySelector('#bop').onclick = (e) => { const x = e.target.closest('[data-o]'); if (x) { op = x.dataset.o; draw(); } };
    root.querySelector('.bool-list').onclick = (e) => { const x = e.target.closest('[data-i]'); if (x) { b = others[+x.dataset.i]; draw(); } };
    root.querySelector('[data-x]').onclick = () => (root.innerHTML = '');
    root.querySelector('[data-ok]').onclick = () => {
      root.innerHTML = '';
      try { const r = booleanOp(a, b, op); toast(`Booleana aplicada · ${Math.round(r.triangles).toLocaleString()} triângulos`); } catch (e) { toast(e.message, { kind: 'error' }); }
    };
  };
  draw();
}

// ---------- Menu Adicionar ----------
let openPop = null;
function closePop() { openPop?.remove(); openPop = null; }
function showPop(html, x, y) {
  closePop(); const p = document.createElement('div'); p.className = 'menu-pop'; p.innerHTML = html; document.body.appendChild(p);
  const r = p.getBoundingClientRect();
  p.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px'; p.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  p.onclick = (e) => { const b = e.target.closest('[data-cmd]'); if (b) { closePop(); runCommand(b.dataset.cmd); } };
  openPop = p;
}
function menuHTML(items) {
  return items.map((id) => {
    if (id === '-') return '<hr>';
    if (id.startsWith('#')) return `<div class="sub-h">${id.slice(1)}</div>`;
    const c = commands.get(id); return c ? `<button data-cmd="${id}">${c.label}${c.keys ? `<kbd>${c.keys}</kbd>` : ''}</button>` : '';
  }).join('');
}
function openAddMenu(x, y) {
  const base = ['#Formas', ...PRIMITIVES.map((p) => 'add-' + p), 'add-text', '#Luz e câmera', ...Object.keys(LIGHT_LABEL).map((l) => 'add-light-' + l), 'add-camera', '#Efeitos', ...VFX_TYPES.map((v) => 'add-vfx-' + v)];
  const extra = [...commands.keys()].filter((k) => k.startsWith('add-') && !base.includes(k) && k !== 'add-menu');
  showPop(menuHTML([...base, ...(extra.length ? ['#Plugins', ...extra] : []), '-', 'import']), x, y);
}
document.addEventListener('pointerdown', (e) => { if (openPop && !openPop.contains(e.target) && !e.target.closest('[data-anchor=add]')) closePop(); });

// ---------- Busca rápida (Ctrl+K) ----------
function openPalette() {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-bg" style="place-items:start center;padding-top:14vh"><div class="modal palette"><input placeholder="O que você quer fazer?" id="pal-in"><div class="palette-list" id="pal-list"></div></div></div>`;
  const list = [...commands.values()].filter((c) => c.group);
  let idx = 0, shown = list;
  const draw = () => { $('#pal-list').innerHTML = shown.slice(0, 80).map((c, i) => `<button class="${i === idx ? 'on' : ''}" data-cmd="${c.id}"><span style="opacity:.55;width:84px;flex:none">${c.group}</span>${c.label}${c.keys ? `<kbd>${c.keys}</kbd>` : ''}</button>`).join(''); };
  const inp = $('#pal-in'); inp.focus(); draw();
  const close = () => (root.innerHTML = '');
  inp.oninput = () => { const q = inp.value.toLowerCase(); shown = list.filter((c) => (c.label + ' ' + c.group + ' ' + (c.desc || '')).toLowerCase().includes(q)); idx = 0; draw(); };
  inp.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') { idx = Math.min(shown.length - 1, idx + 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); draw(); e.preventDefault(); }
    if (e.key === 'Enter' && shown[idx]) { close(); runCommand(shown[idx].id); }
    if (e.key === 'Escape') close();
  };
  root.querySelector('.modal-bg').onclick = (e) => { const b = e.target.closest('[data-cmd]'); if (b) { close(); runCommand(b.dataset.cmd); } else if (e.target.classList.contains('modal-bg')) close(); };
}

// ---------- Dock de ferramentas (muda conforme a página) ----------
const T = (tool, ic, label) => ({ tool, ic, label });
const C = (cmd, ic, label) => ({ cmd, ic, label });
function dockItems() {
  const transform = [T('select', 'select', 'Selecionar'), T('move', 'move', 'Mover'), T('rotate', 'rotate', 'Girar'), T('scale', 'scale', 'Escalar')];
  if (state.mode === 'edit') return [
    { mode: 'vertex', ic: 'vertex', label: 'Vértice' }, { mode: 'face', ic: 'face', label: 'Face' }, '|',
    C('extrude', 'extrude', 'Extrudar'), C('delete', 'trash', 'Excluir'), C('select-all', 'layers', 'Tudo'), '|', C('edit-mode', 'check', 'Concluir'),
  ];
  switch (state.workspace) {
    case 'model': return [...transform, '|', C('add-menu', 'plus', 'Adicionar'), C('add-text', 'text', 'Texto'), '|', C('edit-mode', 'mesh', 'Editar'), C('boolean', 'boolean', 'Booleana'), C('duplicate', 'copy', 'Duplicar'), C('delete', 'trash', 'Excluir')];
    case 'sculpt': return [...BRUSHES.map(([id, n]) => ({ brush: id, ic: 'brush', label: n })), '|', { slider: 'radius', label: 'Raio', min: 0.05, max: 1.5, step: 0.01 }, { slider: 'strength', label: 'Força', min: 0.05, max: 1, step: 0.01 }, '|', C('sculpt-prepare', 'mesh', 'Mais detalhe')];
    case 'texture': return [T('move', 'move', 'Mover'), T('rotate', 'rotate', 'Girar'), '|', { go: 'store', ic: 'bag', label: 'Materiais prontos' }, C('import', 'upload', 'Importar')];
    case 'animate': return [...transform, '|', C('keyframe', 'key', 'Keyframe'), C('play', 'play', 'Play')];
    case 'vfx': return [T('move', 'move', 'Mover'), '|', ...VFX_TYPES.map((v) => C('add-vfx-' + v, 'spark', VFX_LABEL[v]))];
    default: return [];
  }
}
function renderDock() {
  const dock = $('#tool-dock');
  dock.innerHTML = dockItems().map((it, i) => {
    if (it === '|') return '<i class="sep"></i>';
    if (it.slider) return `<label class="dock-slider">${it.label} <input type="range" data-slider="${it.slider}" min="${it.min}" max="${it.max}" step="${it.step}" value="${sculpt[it.slider]}"></label>`;
    const on = (it.tool && it.tool === state.tool) || (it.brush && it.brush === sculpt.brush) || (it.mode && it.mode === edit.select);
    return `<button class="dock-btn ${on ? 'on' : ''}" data-i="${i}" ${it.cmd === 'add-menu' ? 'data-anchor="add"' : ''} ${it.cmd === 'add-text' ? 'data-anchor="tool-text"' : ''}>${icon(it.ic, 19)}<span>${it.label}</span></button>`;
  }).join('');
  const items = dockItems();
  dock.onclick = (e) => {
    const b = e.target.closest('[data-i]'); if (!b) return; const it = items[+b.dataset.i];
    if (it.tool) setTool(it.tool);
    if (it.cmd === 'add-menu') { const r = b.getBoundingClientRect(); openAddMenu(r.left, r.top - 420); return; }
    if (it.cmd) runCommand(it.cmd);
    if (it.brush) sculpt.brush = it.brush;
    if (it.mode) setSelectMode(it.mode);
    if (it.go) navigate(it.go);
    renderDock();
  };
  dock.oninput = (e) => { const s = e.target.dataset.slider; if (s) sculpt[s] = +e.target.value; };
}

// ---------- Construção ----------
const lastMouse = { x: 300, y: 200 };
let mcpN = 0, upd = null;
function drawStatus() {
  const aiOn = !$('#main').classList.contains('ai-hidden');
  $('#tb-status').innerHTML = `${upd?.status === 'ready' ? `<button class="update-chip" id="upd">Atualizar para ${upd.version}</button>` : upd?.status === 'downloading' ? `<span>Baixando ${upd.percent}%</span>` : ''}
    <button id="mcp-st" title="Clientes MCP conectados"><i class="dot ${mcpN ? 'ok' : ''}"></i>MCP${mcpN ? ' ' + mcpN : ''}</button>
    <button id="ai-tg" class="${aiOn ? 'on' : ''}" title="Assistente (Ctrl+.)">${icon('chat', 16)} Assistente</button>`;
  $('#upd')?.addEventListener('click', () => window.argila.update.install());
  $('#mcp-st').onclick = () => navigate('settings', 'mcp');
  $('#ai-tg').onclick = toggleAI;
}

export function initShell() {
  registerAll();
  $('#brand').innerHTML = `${LOGO(24)}<span>Argila</span><small>studio</small>`;
  $('#search-pill').innerHTML = `${icon('search', 15)}<span>Buscar comandos, ferramentas…</span><kbd>Ctrl</kbd><kbd>K</kbd>`;
  $('#search-pill').onclick = openPalette;

  $('#nav').innerHTML = PAGES.map((p) => p === '-' ? '<hr>' : p === 'flex' ? '<div style="flex:1"></div>' : `<button class="nav-btn" data-page="${p.id}" title="${p.label}">${icon(p.icon, 21)}<span>${p.label}</span></button>`).join('');
  $('#nav').onclick = (e) => { const b = e.target.closest('[data-page]'); if (b) navigate(b.dataset.page); };

  $('#mode-seg').innerHTML = `<button data-m="object" class="on">${icon('cube', 14)} Objeto</button><button data-m="edit">${icon('mesh', 14)} Editar</button>`;
  $('#mode-seg').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b && b.dataset.m !== state.mode) toggleEditMode(); };
  bus.on('mode', (m) => { document.querySelectorAll('#mode-seg button').forEach((b) => b.classList.toggle('on', b.dataset.m === m)); renderDock(); });
  bus.on('edit:select-mode', renderDock);
  bus.on('tool', renderDock);
  $('#vp-add').innerHTML = `<button data-anchor="add">${icon('plus', 15)} Adicionar</button>`;
  $('#vp-add').onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); openAddMenu(r.left, r.bottom + 6); };
  $('#shading-seg').innerHTML = [['wire', 'Arame'], ['solid', 'Sólido'], ['material', 'Material'], ['render', 'Render']].map(([m, n], i) => `<button data-s="${m}" title="Shift+${i + 1}">${n}</button>`).join('');
  $('#shading-seg').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) setShading(b.dataset.s); };
  bus.on('shading', (m) => document.querySelectorAll('#shading-seg button').forEach((b) => b.classList.toggle('on', b.dataset.s === m)));
  $('#vp-hint').innerHTML = 'Botão do meio: girar vista · Shift+meio: mover vista · Roda: zoom';
  $('#sc-toggle').onclick = () => $('#scene-card').classList.toggle('collapsed');

  if (!settings.prefs.aiOpen) $('#main').classList.add('ai-hidden');
  window.argila?.mcp?.onStatus((d) => { mcpN = d.connected; drawStatus(); if (d.connected) toast('Uma IA externa se conectou via MCP'); });
  window.argila?.update?.on((d) => { upd = d; drawStatus(); if (d.status === 'ready') toast(`Versão ${d.version} pronta`, { ms: 8000, action: { label: 'Reiniciar', run: () => window.argila.update.install() } }); });
  drawStatus();

  setupKeys(); setupSplitter();
  window.addEventListener('pointermove', (e) => { lastMouse.x = e.clientX; lastMouse.y = e.clientY; });
}

function setupKeys() {
  window.addEventListener('keydown', (e) => {
    if (e.target?.closest?.('input, textarea, select, .cm-editor')) return;
    if ($('#modal-root').children.length) { if (e.key === 'Escape') $('#modal-root').innerHTML = ''; return; }
    if (e.key === 'Escape') { closePop(); if (state.mode === 'edit') toggleEditMode(); return; }
    const k = keyOf(e);
    const cmd = [...commands.values()].find((c) => c.keys === k);
    if (!cmd) return;
    // Em páginas sem 3D, só atalhos globais (Ctrl+…, F-keys) valem.
    if ($('#page').classList.contains('on') && !/^(Ctrl|F\d)/.test(k)) return;
    e.preventDefault(); runCommand(cmd.id);
  });
}

function setupSplitter() {
  const el = $('#splitter-h');
  el.addEventListener('pointerdown', (e) => {
    el.classList.add('drag'); el.setPointerCapture(e.pointerId);
    const mv = (ev) => { const r = $('#center').getBoundingClientRect(); document.documentElement.style.setProperty('--bottom-h', Math.max(120, Math.min(r.height - 160, r.bottom - ev.clientY)) + 'px'); };
    el.addEventListener('pointermove', mv);
    el.addEventListener('pointerup', () => { el.classList.remove('drag'); el.removeEventListener('pointermove', mv); }, { once: true });
  });
}
