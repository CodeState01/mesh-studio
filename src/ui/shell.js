// Shell "canvas flutuante": barra superior, workspaces, barra de precisão, dock contextual,
// painel "ajustar última operação", folhas (páginas), comandos com ícones, atalhos e busca.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { registerCommand, runCommand, commands, keyOf } from '../core/commands.js';
import { state, bus, select, selectMany, precision } from '../core/state.js';
import { history } from '../core/history.js';
import { content, createPrimitive, createText, createLight, createCamera, PRIMITIVES } from '../core/objects.js';
import { setTool, setShading, frameSelected, viewAxis, lookThrough, getRenderCamera, captureImage, renderer } from '../core/viewport.js';
import { toggleEditMode, selectAllVerts, setSelectMode, edit, ops, EDIT_KEYS, invertSelection, selectLinked } from '../core/editmode.js';
import { startModal, isModal, cursorToSelection, cursorToOrigin, selectionToCursor, clearMeasures } from '../core/precision.js';
import { booleanOp } from '../core/boolean.js';
import { sculpt, BRUSHES, prepareForSculpt } from '../core/sculpt.js';
import { unwrap, paint, exportPaintTexture } from '../core/uv.js';
import { autoRig, togglePose, resetPose } from '../core/rig.js';
import { startSim, stopSim, bake, physics, makeCloth, resetCloth } from '../core/physics.js';
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

// ---------- Workspaces (3D) e folhas (páginas) ----------
export const WORKSPACES = [
  { id: 'model', label: 'Modelar', icon: 'cube' }, { id: 'sculpt', label: 'Esculpir', icon: 'brush' },
  { id: 'paint', label: 'Pintar', icon: 'paint' }, { id: 'animate', label: 'Animar', icon: 'key' },
  { id: 'vfx', label: 'Efeitos', icon: 'spark' }, { id: 'video', label: 'Vídeo', icon: 'film' },
];
export const SHEETS = [
  { id: 'home', label: 'Início', icon: 'home', render: renderHome }, { id: 'store', label: 'Loja', icon: 'bag', render: renderStore },
  { id: 'code', label: 'Code Lab', icon: 'code', render: renderCodeLab }, { id: 'engines', label: 'Engines', icon: 'engine', render: renderEngines },
  { id: 'commands', label: 'Comandos', icon: 'list', render: renderCommands }, { id: 'settings', label: 'Ajustes', icon: 'gear', render: renderSettings },
];
let sheetOpen = null;

export function navigate(id, section) {
  const sh = SHEETS.find((s) => s.id === id);
  if (sh) return openSheet(sh, section);
  const ws = WORKSPACES.find((w) => w.id === id) || WORKSPACES.find((w) => w.id === { texture: 'paint', material: 'paint' }[id]); if (!ws) return;
  closeSheet();
  if (state.mode === 'edit' && ws.id !== 'model') toggleEditMode();
  if (state.mode === 'pose' && ws.id !== 'animate') togglePose();
  state.workspace = ws.id;
  document.querySelectorAll('#workspaces [data-ws]').forEach((b) => b.classList.toggle('on', b.dataset.ws === ws.id));
  const showBottom = ['animate', 'vfx', 'video'].includes(ws.id);
  $('#bottom').classList.toggle('hidden', !showBottom);
  document.documentElement.style.setProperty('--bottom-h', ws.id === 'video' ? '290px' : '230px');
  if (ws.id === 'sculpt' || ws.id === 'paint') setTool('select'); else if (state.tool === 'select' && ws.id !== 'video') setTool('move');
  $('#crumb').innerHTML = `${icon(ws.icon, 14)}<b>${ws.label}</b>`;
  bus.emit('workspace', ws.id); renderDock(); renderPrecision();
}
export const setWorkspace = (ws) => navigate(ws);

function openSheet(sh, section) {
  sheetOpen = sh.id; const page = $('#page'); page.innerHTML = '';
  $('#sheet-title').innerHTML = `${icon(sh.icon, 18)}${sh.label}`;
  $('#sheet').classList.add('on'); sh.render(page, section);
  document.querySelectorAll('[data-sheet]').forEach((b) => b.classList.toggle('on', b.dataset.sheet === sh.id));
}
export function closeSheet() { if (!sheetOpen) return; sheetOpen = null; $('#sheet').classList.remove('on'); document.querySelectorAll('[data-sheet]').forEach((b) => b.classList.remove('on')); setTimeout(() => { if (!sheetOpen) $('#page').innerHTML = ''; }, 300); }

// ---------- Ajudantes ----------
function addWithUndo(obj, label) {
  content.add(obj); bus.emit('scene:changed'); select(obj);
  history.push({ label, undo: () => { content.remove(obj); select(null); bus.emit('scene:changed'); }, redo: () => { content.add(obj); bus.emit('scene:changed'); } });
}
function snapAll(label, fn) {
  const objs = state.selection.slice(); const before = objs.map((o) => history.snapshot(o)); fn(objs); const after = objs.map((o) => history.snapshot(o));
  history.push({ label, undo: () => objs.forEach((o, i) => history.restore(o, before[i])), redo: () => objs.forEach((o, i) => history.restore(o, after[i])) });
  bus.emit('object:transformed', state.selected); bus.emit('selection', state.selected);
}
export function alignSelection(axis, where) { // where: min | center | max
  const objs = state.selection; if (objs.length < 2) { toast('Selecione 2+ objetos (Shift+clique)'); return; }
  const ref = new THREE.Box3().setFromObject(state.selected); const k = 'xyz'.indexOf(axis);
  const target = where === 'min' ? ref.min.getComponent(k) : where === 'max' ? ref.max.getComponent(k) : ref.getCenter(new THREE.Vector3()).getComponent(k);
  snapAll('Alinhar', (os) => os.forEach((o) => { if (o === state.selected) return; const b = new THREE.Box3().setFromObject(o); const cur = where === 'min' ? b.min.getComponent(k) : where === 'max' ? b.max.getComponent(k) : b.getCenter(new THREE.Vector3()).getComponent(k); o.position.setComponent(k, o.position.getComponent(k) + target - cur); }));
}
export function distributeSelection(axis) {
  const objs = state.selection.slice(); if (objs.length < 3) { toast('Selecione 3+ objetos'); return; }
  const k = 'xyz'.indexOf(axis); objs.sort((a, b) => a.position.getComponent(k) - b.position.getComponent(k));
  const a = objs[0].position.getComponent(k), b = objs[objs.length - 1].position.getComponent(k);
  snapAll('Distribuir', () => objs.forEach((o, i) => o.position.setComponent(k, a + ((b - a) * i) / (objs.length - 1))));
}
function joinSelection() {
  const meshes = state.selection.filter((o) => o.isMesh && !o.isSkinnedMesh); if (meshes.length < 2) { toast('Selecione 2+ malhas'); return; }
  const active = state.selected.isMesh ? state.selected : meshes[0]; const inv = active.matrixWorld.clone().invert();
  const geos = meshes.map((m) => { m.updateMatrixWorld(); let g = m.geometry.clone(); if (g.index) g = g.toNonIndexed(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); });
  Promise.resolve({ mergeGeometries: BGU.mergeGeometries }).then(({ mergeGeometries }) => {
    const merged = mergeGeometries(geos); const old = active.geometry; const removed = meshes.filter((m) => m !== active);
    active.geometry = merged; delete active.__em; removed.forEach((m) => content.remove(m));
    history.push({ label: 'Juntar', undo: () => { active.geometry = old; removed.forEach((m) => content.add(m)); bus.emit('scene:changed'); }, redo: () => { active.geometry = merged; removed.forEach((m) => content.remove(m)); bus.emit('scene:changed'); } });
    select(active); bus.emit('scene:changed'); toast(`${meshes.length} malhas juntadas`);
  });
}
function groupSelection() {
  const objs = state.selection.slice(); if (!objs.length) return;
  const g = new THREE.Group(); g.name = 'Grupo'; g.userData = { id: 'grp' + Date.now().toString(36), kind: 'group' };
  const c = new THREE.Vector3(); objs.forEach((o) => c.add(o.position)); g.position.copy(c.divideScalar(objs.length));
  content.add(g); objs.forEach((o) => g.attach(o));
  history.push({ label: 'Agrupar', undo: () => { objs.forEach((o) => content.attach(o)); content.remove(g); bus.emit('scene:changed'); }, redo: () => { content.add(g); objs.forEach((o) => g.attach(o)); bus.emit('scene:changed'); } });
  select(g); bus.emit('scene:changed');
}
function ungroup() {
  const g = state.selected; if (!g?.isGroup || !g.children.length) { toast('Selecione um grupo'); return; }
  const kids = g.children.slice(); kids.forEach((o) => content.attach(o)); content.remove(g);
  history.push({ label: 'Desagrupar', undo: () => { content.add(g); kids.forEach((o) => g.attach(o)); bus.emit('scene:changed'); }, redo: () => { kids.forEach((o) => content.attach(o)); content.remove(g); bus.emit('scene:changed'); } });
  selectMany(kids); bus.emit('scene:changed');
}
function applyTransform() { // "aplica" escala/rotação na geometria (como Ctrl+A)
  const objs = state.selection.filter((o) => o.isMesh); if (!objs.length) return;
  const rec = objs.map((o) => [o, o.geometry, history.snapshot(o)]);
  objs.forEach((o) => { const m = new THREE.Matrix4().compose(new THREE.Vector3(), o.quaternion, o.scale); const g = o.geometry.clone().applyMatrix4(m); o.geometry = g; o.quaternion.identity(); o.scale.set(1, 1, 1); delete o.__em; });
  const after = objs.map((o) => [o.geometry, history.snapshot(o)]);
  history.push({ label: 'Aplicar rotação/escala', undo: () => rec.forEach(([o, g, s]) => { o.geometry = g; history.restore(o, s); delete o.__em; }), redo: () => objs.forEach((o, i) => { o.geometry = after[i][0]; history.restore(o, after[i][1]); delete o.__em; }) });
  bus.emit('object:transformed', state.selected); toast('Rotação e escala aplicadas');
}
function originToGeometry() {
  const o = state.selected; if (!o?.isMesh) return;
  o.geometry.computeBoundingBox(); const c = o.geometry.boundingBox.getCenter(new THREE.Vector3());
  const oldG = o.geometry, oldP = o.position.clone();
  const g = o.geometry.clone().translate(-c.x, -c.y, -c.z); const wc = c.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(), o.quaternion, o.scale));
  o.geometry = g; o.position.add(wc); delete o.__em; const newP = o.position.clone();
  history.push({ label: 'Origem → geometria', undo: () => { o.geometry = oldG; o.position.copy(oldP); }, redo: () => { o.geometry = g; o.position.copy(newP); } });
  bus.emit('object:transformed', o);
}

const PRIM_LABEL = { cube: 'Cubo', sphere: 'Esfera', icosphere: 'Icoesfera', cylinder: 'Cilindro', cone: 'Cone', torus: 'Rosquinha', torusknot: 'Nó', plane: 'Plano', capsule: 'Cápsula', ring: 'Anel' };
const LIGHT_LABEL = { point: 'Lâmpada', spot: 'Holofote', directional: 'Sol', area: 'Painel de luz', hemisphere: 'Luz ambiente' };
const VFX_LABEL = { fire: 'Fogo', smoke: 'Fumaça', sparks: 'Faíscas', snow: 'Neve', magic: 'Magia', rain: 'Chuva', confetti: 'Confete', dust: 'Poeira' };

function registerAll() {
  const R = (id, label, run, keys, group, icn, desc) => registerCommand({ id, label, run, keys, group, icon: icn, desc });
  // Navegação
  WORKSPACES.forEach((w, i) => R('go-' + w.id, w.label, () => navigate(w.id), `Ctrl+${i + 1}`, 'Ir', w.icon));
  SHEETS.forEach((s) => R('go-' + s.id, s.label, () => navigate(s.id), { home: 'Ctrl+0', settings: 'Ctrl+,', commands: 'F1' }[s.id], 'Ir', s.icon));
  // Arquivo
  R('new', 'Novo projeto', () => { if (confirm('Descartar a cena atual?')) loadProject({ version: 1, scene: { metadata: { version: 4.6, type: 'Object' }, object: { type: 'Group', uuid: crypto.randomUUID(), children: [] } } }); }, 'Ctrl+N', 'Arquivo', 'file');
  R('open', 'Abrir projeto…', openProject, 'Ctrl+O', 'Arquivo', 'folder');
  R('save', 'Salvar projeto…', async () => { if (await saveProject()) toast('Projeto salvo'); }, 'Ctrl+S', 'Arquivo', 'save');
  R('import', 'Importar modelo…', importModel, 'Ctrl+I', 'Arquivo', 'upload', 'glTF, OBJ, FBX, STL');
  for (const f of ['glb', 'gltf', 'obj', 'stl']) R('export-' + f, `Exportar ${f.toUpperCase()}`, () => exportModel(f), null, 'Arquivo', 'download');
  R('restore', 'Recuperar autosave', () => { if (!restoreAutosave()) toast('Nenhum autosave encontrado'); }, null, 'Arquivo', 'refresh');
  R('render', 'Renderizar imagem (Full HD)', () => renderImage(), 'F12', 'Render', 'aperture');
  R('render-4k', 'Renderizar imagem 4K', () => renderImage(3840, 2160), null, 'Render', 'aperture');
  // Editar
  R('undo', 'Desfazer', () => history.undo(), 'Ctrl+Z', 'Editar', 'undo');
  R('redo', 'Refazer', () => history.redo(), 'Ctrl+Shift+Z', 'Editar', 'redo');
  registerCommand({ id: 'redo2', label: 'Refazer', run: () => history.redo(), keys: 'Ctrl+Y' });
  R('delete', 'Excluir', () => { if (state.mode === 'edit') return ops.remove(); state.selection.slice().forEach((o) => IMPL.delete_object({ target: o })); }, 'X', 'Editar', 'trash');
  registerCommand({ id: 'delete2', label: 'Excluir', run: () => runCommand('delete'), keys: 'Delete' });
  R('duplicate', 'Duplicar', duplicate, 'Shift+D', 'Editar', 'copy');
  R('select-all', 'Selecionar tudo / nada', () => (state.mode === 'edit' ? selectAllVerts() : state.selection.length === content.children.length ? select(null) : selectMany(content.children)), 'A', 'Editar', 'layers');
  R('select-invert', 'Inverter seleção', () => (state.mode === 'edit' ? invertSelection() : selectMany(content.children.filter((o) => !state.selection.includes(o)))), null, 'Editar', 'refresh', 'Ctrl+I no modo Editar');
  R('group', 'Agrupar', groupSelection, 'Ctrl+G', 'Editar', 'group');
  R('ungroup', 'Desagrupar', ungroup, 'Ctrl+Shift+G', 'Editar', 'ungroup');
  R('join', 'Juntar malhas', joinSelection, 'Ctrl+J', 'Editar', 'merge');
  R('apply-transform', 'Aplicar rotação e escala', applyTransform, 'Ctrl+A', 'Editar', 'check');
  R('origin-geometry', 'Origem no centro da geometria', originToGeometry, null, 'Editar', 'crosshair');
  // Adicionar
  PRIMITIVES.forEach((p) => R('add-' + p, PRIM_LABEL[p], () => addWithUndo(createPrimitive(p), 'Adicionar'), null, 'Adicionar', p));
  R('add-text', 'Texto 3D', async () => { const t = await askText('Texto 3D', 'Argila'); if (t) addWithUndo(createText(t), 'Texto'); }, null, 'Adicionar', 'text');
  Object.keys(LIGHT_LABEL).forEach((l) => R('add-light-' + l, LIGHT_LABEL[l], () => addWithUndo(createLight(l), 'Luz'), null, 'Luz', l));
  R('add-camera', 'Câmera', () => addWithUndo(createCamera(), 'Câmera'), null, 'Luz', 'camera');
  VFX_TYPES.forEach((v) => R('add-vfx-' + v, VFX_LABEL[v], () => addWithUndo(createVFX(v, { position: [0, 0, 0] }), 'VFX'), null, 'VFX', v));
  R('add-menu', 'Menu Adicionar', () => openAddMenu(lastMouse.x, lastMouse.y), 'Shift+A', 'Ferramentas', 'plus');
  // Ferramentas / transformação precisa
  R('tool-select', 'Selecionar', () => setTool('select'), 'W', 'Ferramentas', 'select');
  R('tool-move', 'Mover (preciso: G)', () => modalOrTool('move'), 'G', 'Ferramentas', 'move', 'G → X/Y/Z → número → Enter');
  R('tool-rotate', 'Girar (preciso: R)', () => modalOrTool('rotate'), 'R', 'Ferramentas', 'rotate');
  R('tool-scale', 'Escalar (preciso: S)', () => modalOrTool('scale'), 'S', 'Ferramentas', 'scale');
  R('tool-measure', 'Régua', () => setTool('measure'), 'Shift+M', 'Precisão', 'ruler', 'Clique em 2 pontos');
  R('tool-cursor', 'Posicionar cursor 3D', () => setTool('cursor'), null, 'Precisão', 'cursor3d', 'Ou Shift+botão direito');
  R('clear-measures', 'Limpar medidas', clearMeasures, null, 'Precisão', 'trash');
  R('snap-toggle', 'Liga/desliga snap', () => { precision.snap = !precision.snap; bus.emit('precision'); renderPrecision(); }, 'Shift+Tab', 'Precisão', 'magnet');
  R('proportional', 'Edição proporcional', () => { precision.proportional = !precision.proportional; bus.emit('precision'); renderPrecision(); }, 'O', 'Precisão', 'proportional');
  R('cursor-to-sel', 'Cursor 3D → seleção', cursorToSelection, null, 'Precisão', 'cursor3d');
  R('cursor-origin', 'Cursor 3D → origem', cursorToOrigin, null, 'Precisão', 'crosshair');
  R('sel-to-cursor', 'Seleção → cursor 3D', selectionToCursor, null, 'Precisão', 'pivot');
  ['x', 'y', 'z'].forEach((a) => ['min', 'center', 'max'].forEach((w) => R(`align-${a}-${w}`, `Alinhar ${a.toUpperCase()} (${{ min: 'mínimo', center: 'centro', max: 'máximo' }[w]})`, () => alignSelection(a, w), null, 'Precisão', 'align')));
  ['x', 'y', 'z'].forEach((a) => R(`distribute-${a}`, `Distribuir em ${a.toUpperCase()}`, () => distributeSelection(a), null, 'Precisão', 'distribute'));
  // Modelagem
  R('edit-mode', 'Editar malha', toggleEditMode, 'Tab', 'Modelagem', 'mesh');
  R('mode-vertex', 'Modo vértice', () => setSelectMode('vertex'), null, 'Modelagem', 'vertex');
  R('mode-edge', 'Modo aresta', () => setSelectMode('edge'), null, 'Modelagem', 'edge');
  R('mode-face', 'Modo face', () => setSelectMode('face'), null, 'Modelagem', 'face');
  R('extrude', 'Extrudar', () => (state.mode === 'edit' ? ops.extrude() : toast('Entre no modo Editar (Tab)')), null, 'Modelagem', 'extrude', 'E no modo Editar');
  R('inset', 'Inset', () => ops.inset(), null, 'Modelagem', 'inset', 'I no modo Editar');
  R('bevel', 'Bevel', () => ops.bevel(), null, 'Modelagem', 'bevel', 'Ctrl+B no modo Editar');
  R('loopcut', 'Loop Cut', () => ops.loopCut(lastMouse), null, 'Modelagem', 'loopcut', 'Ctrl+R no modo Editar');
  R('subdivide', 'Subdividir faces', () => ops.subdivide(), null, 'Modelagem', 'mesh');
  R('merge', 'Merge (unir vértices)', () => ops.merge(), null, 'Modelagem', 'merge', 'M');
  R('connect', 'Conectar vértices (faca)', () => ops.connect(), null, 'Modelagem', 'knife', 'J');
  R('fill', 'Preencher face', () => ops.fill(), null, 'Modelagem', 'face', 'F');
  R('flip', 'Inverter normais', () => ops.flip(), null, 'Modelagem', 'refresh');
  R('select-linked', 'Selecionar ligados', selectLinked, null, 'Modelagem', 'link', 'L');
  R('shade-smooth', 'Sombreamento suave', () => (state.mode === 'edit' ? ops.shade(true) : setSmooth(true)), null, 'Modelagem', 'smooth');
  R('shade-flat', 'Sombreamento facetado', () => (state.mode === 'edit' ? ops.shade(false) : setSmooth(false)), null, 'Modelagem', 'face');
  R('boolean', 'Booleana…', openBoolean, 'Ctrl+Shift+B', 'Modelagem', 'boolean');
  // Escultura / pintura / UV
  BRUSHES.forEach(([id, n]) => R('brush-' + id, 'Pincel: ' + n, () => { navigate('sculpt'); sculpt.brush = id; renderDock(); }, null, 'Escultura', { inflate: 'inflate', deflate: 'dig', grab: 'grab', smooth: 'smooth', flatten: 'flatten' }[id]));
  R('sculpt-prepare', 'Mais detalhe para esculpir', () => prepareForSculpt(), null, 'Escultura', 'mesh');
  [['smart', 'Inteligente'], ['box', 'Caixa'], ['planar', 'Planar'], ['sphere', 'Esférico'], ['cylinder', 'Cilíndrico']].forEach(([m, n]) => R('uv-' + m, 'Desdobrar UV: ' + n, () => unwrap(state.selected, m), m === 'smart' ? 'U' : null, 'UV e Pintura', 'uv'));
  R('paint-export', 'Exportar textura pintada', exportPaintTexture, null, 'UV e Pintura', 'download');
  // Rig e física
  R('autorig', 'Auto-rig (criar esqueleto)', () => autoRig(state.selected, 4), null, 'Rig e Física', 'bone');
  R('pose-mode', 'Modo Pose', togglePose, 'Ctrl+Tab', 'Rig e Física', 'pose');
  R('pose-reset', 'Resetar pose', resetPose, null, 'Rig e Física', 'refresh');
  R('sim-start', 'Simular física', () => (physics.running ? stopSim() : startSim()), 'Shift+Space', 'Rig e Física', 'physics');
  R('sim-bake', 'Assar física em keyframes', () => bake(), null, 'Rig e Física', 'bake');
  R('cloth-make', 'Transformar em tecido', () => makeCloth(), null, 'Rig e Física', 'cloth');
  R('cloth-reset', 'Resetar tecido', resetCloth, null, 'Rig e Física', 'refresh');
  // Exibir
  R('frame', 'Enquadrar seleção', frameSelected, 'F', 'Exibir', 'frame');
  registerCommand({ id: 'frame2', label: 'Enquadrar seleção', run: frameSelected, keys: 'NumpadDecimal' });
  R('view-front', 'Vista frontal', () => viewAxis('front'), 'Numpad1', 'Exibir', 'axis');
  R('view-right', 'Vista lateral', () => viewAxis('right'), 'Numpad3', 'Exibir', 'axis');
  R('view-top', 'Vista de cima', () => viewAxis('top'), 'Numpad7', 'Exibir', 'axis');
  R('look-through', 'Ver pela câmera', lookThroughToggle, 'Numpad0', 'Exibir', 'camera');
  [['wire', 'Arame', 'wire'], ['solid', 'Sólido', 'solid'], ['material', 'Material', 'material'], ['render', 'Render', 'render']].forEach(([m, n, ic], i) => R('shade-' + m, 'Visual: ' + n, () => setShading(m), `Shift+${i + 1}`, 'Exibir', ic));
  R('toggle-ai', 'Assistente de IA', toggleAI, 'Ctrl+.', 'Exibir', 'bot');
  R('toggle-panels', 'Mostrar/ocultar painéis', togglePanels, 'Ctrl+Space', 'Exibir', 'expand');
  // Animação / vídeo
  R('play', 'Play / Pausa', () => (state.workspace === 'video' ? videoPlay() : play()), 'Space', 'Animação', 'play');
  R('keyframe', 'Inserir keyframe', () => { if (state.selected) { state.selection.forEach((o) => insertKey(o)); toast('Keyframe em ' + state.time.toFixed(2) + 's'); } }, 'I', 'Animação', 'key');
  R('split', 'Cortar clipe no playhead', splitAtPlayhead, 'Ctrl+B', 'Vídeo', 'scissors');
  R('palette', 'Buscar comando', openPalette, 'Ctrl+K', 'Ajuda', 'search');
  registerCommand({ id: 'palette2', label: 'Buscar comando', run: openPalette, keys: 'F3' });
  R('mcp', 'Conectar outra IA via MCP', () => navigate('settings', 'mcp'), null, 'Ajuda', 'plug');
  bus.on('cmd', (id) => runCommand(id));
  bus.on('navigate', ({ page, section }) => navigate(page, section));
}

function setSmooth(on) {
  const ms = state.selection.filter((o) => o.isMesh); ms.forEach((m) => { m.userData.smooth = on; if (m.__em) { m.__em.smooth = on; m.geometry = m.__em.toGeometry(); } else { if (on) m.geometry.computeVertexNormals(); else { m.geometry = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry; m.geometry.computeVertexNormals(); } } });
  toast(on ? 'Sombreamento suave' : 'Facetado');
}
function modalOrTool(kind) {
  const r = renderer.domElement.getBoundingClientRect(); const over = lastMouse.x > r.left && lastMouse.x < r.right && lastMouse.y > r.top && lastMouse.y < r.bottom;
  if (over && (state.selection.length || state.mode === 'edit') && state.workspace !== 'sculpt') startModal(kind, new THREE.Vector2(lastMouse.x, lastMouse.y));
  else setTool(kind);
}
function toggleAI() { const on = !document.body.classList.contains('ai-open'); document.body.classList.toggle('ai-open', on); $('#ai').classList.toggle('hidden', !on); settings.prefs.aiOpen = on; saveSettings(); drawStatus(); }
let panelsHidden = false;
function togglePanels() { panelsHidden = !panelsHidden; ['#left-panel', '#right-panel', '#precision-bar', '#view-tools'].forEach((s) => $(s).classList.toggle('hidden', panelsHidden)); }
function duplicate() {
  const out = state.selection.map((o) => {
    if (o.userData.vfx) return createVFX(o.userData.vfx.type, { ...o.userData.vfx, position: o.position.toArray() });
    const c = o.clone(); c.traverse((x) => { if (x.material) x.material = x.material.clone(); });
    c.userData = { ...o.userData, id: (o.userData.id || 'obj') + 'd' + Math.random().toString(36).slice(2, 6) }; c.name = o.name + '.cópia'; if (o.__em) c.__em = o.__em.clone(); return c;
  });
  out.forEach((c) => content.add(c));
  history.push({ label: 'Duplicar', undo: () => { out.forEach((c) => content.remove(c)); bus.emit('scene:changed'); }, redo: () => { out.forEach((c) => content.add(c)); bus.emit('scene:changed'); } });
  selectMany(out); bus.emit('scene:changed'); modalOrTool('move');
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
  const url = captureImage(w, h, cam || undefined); const data = Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0));
  if (window.argila?.file) { const p = await window.argila.file.save({ name: 'render.png', data, binary: true, filters: [{ name: 'PNG', extensions: ['png'] }] }); if (p) toast('Render salvo'); }
  else { const a = document.createElement('a'); a.href = url; a.download = 'render.png'; a.click(); }
}

function openBoolean() {
  const a = state.selected; if (!a?.isMesh) { toast('Selecione a malha principal primeiro'); return; }
  const others = state.selection.length > 1 ? state.selection.filter((o) => o !== a && o.isMesh) : content.children.filter((o) => o.isMesh && o !== a && !o.userData.vfx);
  if (!others.length) { toast('Adicione outra malha para combinar'); return; }
  let b = others[0], op = 'subtract'; const root = $('#modal-root');
  const draw = () => {
    root.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(460px,92vw)"><div class="modal-h">${icon('boolean')} Booleana em “${a.name}”</div><div class="modal-b">
      <div class="seg" id="bop">${[['union', 'Unir', 'SquaresUnite'], ['subtract', 'Subtrair', 'SquaresSubtract'], ['intersect', 'Interseção', 'SquaresIntersect']].map(([k, n, ic]) => `<button data-o="${k}" class="${k === op ? 'on' : ''}">${icon(ic, 15)} ${n}</button>`).join('')}</div>
      <p class="muted" style="margin:12px 0 0">Com qual objeto? (ele será consumido)</p>
      <div class="bool-list">${others.map((o, i) => `<button data-i="${i}" class="${o === b ? 'on' : ''}">${icon('cube', 15)} ${o.name}</button>`).join('')}</div></div>
      <div class="modal-f"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>${icon('check', 15)} Aplicar</button></div></div></div>`;
    root.querySelector('#bop').onclick = (e) => { const x = e.target.closest('[data-o]'); if (x) { op = x.dataset.o; draw(); } };
    root.querySelector('.bool-list').onclick = (e) => { const x = e.target.closest('[data-i]'); if (x) { b = others[+x.dataset.i]; draw(); } };
    root.querySelector('[data-x]').onclick = () => (root.innerHTML = '');
    root.querySelector('[data-ok]').onclick = () => { root.innerHTML = ''; try { const r = booleanOp(a, b, op); delete a.__em; toast(`Booleana aplicada · ${Math.round(r.triangles).toLocaleString()} triângulos`); } catch (e) { toast(e.message, { kind: 'error' }); } };
  };
  draw();
}

// ---------- Menus ----------
let openPop = null;
function closePop() { openPop?.remove(); openPop = null; }
function showPop(html, x, y, onRender) {
  closePop(); const p = document.createElement('div'); p.className = 'menu-pop'; p.innerHTML = html; document.body.appendChild(p);
  const r = p.getBoundingClientRect(); p.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px'; p.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  p.onclick = (e) => { const b = e.target.closest('[data-cmd]'); if (b) { closePop(); runCommand(b.dataset.cmd); } };
  openPop = p; onRender?.(p); return p;
}
const menuHTML = (items) => items.map((id) => {
  if (id === '-') return '<hr>'; if (id.startsWith('#')) return `<div class="sub-h">${id.slice(1)}</div>`;
  const c = commands.get(id); return c ? `<button data-cmd="${id}">${icon(c.icon || 'dot', 16)}<span>${c.label}</span>${c.keys ? `<kbd>${c.keys}</kbd>` : ''}</button>` : '';
}).join('');
function openAddMenu(x, y) {
  const base = ['#Formas', ...PRIMITIVES.map((p) => 'add-' + p), 'add-text', '#Luz e câmera', ...Object.keys(LIGHT_LABEL).map((l) => 'add-light-' + l), 'add-camera', '#Efeitos', ...VFX_TYPES.map((v) => 'add-vfx-' + v)];
  const extra = [...commands.keys()].filter((k) => k.startsWith('add-') && !base.includes(k) && k !== 'add-menu');
  showPop(menuHTML([...base, ...(extra.length ? ['#Plugins', ...extra] : []), '-', 'import']), x, y);
}
function openAppMenu(x, y) {
  showPop(menuHTML(['#Arquivo', 'new', 'open', 'save', 'import', 'export-glb', 'export-gltf', 'export-obj', 'export-stl', 'restore', '#Render', 'render', 'render-4k', '#Editar', 'undo', 'redo', 'group', 'ungroup', 'join', 'apply-transform', 'origin-geometry', '#Ajuda', 'go-commands', 'go-settings', 'mcp']), x, y);
}
document.addEventListener('pointerdown', (e) => { if (openPop && !openPop.contains(e.target) && !e.target.closest('[data-anchor=add],#brand,.prov-picker,.pb-pop')) closePop(); });
export { showPop, closePop };

// ---------- Busca rápida (Ctrl+K) ----------
function openPalette() {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-bg" style="place-items:start center;padding-top:14vh"><div class="modal palette"><div class="pal-in">${icon('search', 18)}<input placeholder="O que você quer fazer?" id="pal-in"></div><div class="palette-list" id="pal-list"></div></div></div>`;
  const list = [...commands.values()].filter((c) => c.group); let idx = 0, shown = list;
  const draw = () => { $('#pal-list').innerHTML = shown.slice(0, 80).map((c, i) => `<button class="${i === idx ? 'on' : ''}" data-cmd="${c.id}"><small>${c.group}</small>${icon(c.icon || 'dot', 16)}<span>${c.label}</span>${c.keys ? `<kbd>${c.keys}</kbd>` : ''}</button>`).join(''); $('#pal-list .on')?.scrollIntoView({ block: 'nearest' }); };
  const inp = $('#pal-in'); inp.focus(); draw(); const close = () => (root.innerHTML = '');
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

// ---------- Barra de precisão ----------
export function renderPrecision() {
  const p = precision; const el = $('#precision-bar');
  const sel = (id, opts, val) => `<select class="pb-select" data-p="${id}">${opts.map(([v, n]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  el.innerHTML = `
    <button class="pb-btn ${p.snap ? 'on' : ''}" data-a="snap" data-tip="Snap (Shift+Tab) — Ctrl inverte">${icon('magnet', 16)}</button>
    ${sel('snapTarget', [['increment', 'Incremento'], ['grid', 'Grade'], ['vertex', 'Vértice']], p.snapTarget)}
    <label class="pb-num" data-tip="Passo de movimento">${icon('move', 13)}<input data-n="moveStep" value="${p.moveStep}">m</label>
    <label class="pb-num" data-tip="Passo de rotação">${icon('rotate', 13)}<input data-n="rotateStep" value="${p.rotateStep}">°</label>
    <label class="pb-num" data-tip="Passo de escala">${icon('scale', 13)}<input data-n="scaleStep" value="${p.scaleStep}"></label>
    <i class="pb-sep"></i>
    <span data-tip="Pivô de rotação/escala">${sel('pivot', [['median', '◉ Mediana'], ['active', '◎ Ativo'], ['individual', '⁘ Individual'], ['cursor', '⊕ Cursor 3D']], p.pivot)}</span>
    <button class="pb-btn ${p.orientation === 'local' ? 'on' : ''}" data-a="orient" data-tip="Orientação: global/local">${icon(p.orientation === 'local' ? 'local' : 'world', 16)}${p.orientation === 'local' ? 'Local' : 'Global'}</button>
    <i class="pb-sep"></i>
    <button class="pb-btn ${p.proportional ? 'on' : ''}" data-a="prop" data-tip="Edição proporcional (O)">${icon('proportional', 16)}</button>
    ${p.proportional ? `<label class="pb-num" data-tip="Raio proporcional">R<input data-n="propRadius" value="${p.propRadius}">m</label>${sel('propFalloff', [['smooth', 'Suave'], ['linear', 'Linear'], ['sharp', 'Agudo'], ['sphere', 'Esfera']], p.propFalloff)}` : ''}
    <i class="pb-sep"></i>
    <button class="pb-btn ${state.tool === 'cursor' ? 'on' : ''}" data-a="cursor" data-tip="Cursor 3D (Shift+botão direito)">${icon('cursor3d', 16)}</button>
    <button class="pb-btn ${state.tool === 'measure' ? 'on' : ''}" data-a="measure" data-tip="Régua (Shift+M)">${icon('ruler', 16)}</button>`;
  el.onclick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'snap') p.snap = !p.snap; if (a === 'prop') p.proportional = !p.proportional;
    if (a === 'orient') p.orientation = p.orientation === 'local' ? 'global' : 'local';
    if (a === 'cursor') setTool(state.tool === 'cursor' ? 'move' : 'cursor');
    if (a === 'measure') { if (state.tool === 'measure') { setTool('move'); } else setTool('measure'); }
    bus.emit('precision'); renderPrecision();
  };
  el.onchange = (e) => { const k = e.target.dataset.p || e.target.dataset.n; if (!k) return; p[k] = e.target.dataset.n ? Math.max(0.0001, parseFloat(e.target.value) || p[k]) : e.target.value; bus.emit('precision'); renderPrecision(); };
  el.querySelectorAll('input').forEach((i) => (i.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); }));
  el.classList.toggle('hidden', ['video', 'paint'].includes(state.workspace) || panelsHidden);
}

// ---------- Dock contextual ----------
const T = (tool, ic, label, key) => ({ tool, ic, label, key });
const C = (cmd, ic, label, key) => ({ cmd, ic, label, key });
function dockItems() {
  const transform = [T('select', 'select', 'Selecionar', 'W'), T('move', 'move', 'Mover', 'G'), T('rotate', 'rotate', 'Girar', 'R'), T('scale', 'scale', 'Escalar', 'S')];
  if (state.mode === 'edit') return [
    { mode: 'vertex', ic: 'vertex', label: 'Vértice', key: '1' }, { mode: 'edge', ic: 'edge', label: 'Aresta', key: '2' }, { mode: 'face', ic: 'face', label: 'Face', key: '3' }, '|',
    C('extrude', 'extrude', 'Extrudar', 'E'), C('inset', 'inset', 'Inset', 'I'), C('bevel', 'bevel', 'Bevel', '⌃B'), C('loopcut', 'loopcut', 'Loop Cut', '⌃R'),
    C('subdivide', 'mesh', 'Subdividir'), C('merge', 'merge', 'Merge', 'M'), C('connect', 'knife', 'Conectar', 'J'), C('fill', 'face', 'Preencher', 'F'), C('delete', 'trash', 'Excluir', 'X'), '|',
    C('edit-mode', 'check', 'Concluir', 'Tab'),
  ];
  if (state.mode === 'pose') return [T('rotate', 'rotate', 'Girar osso', 'R'), T('move', 'move', 'Mover'), '|', C('keyframe', 'key', 'Keyframe', 'I'), C('pose-reset', 'refresh', 'Resetar'), '|', C('pose-mode', 'check', 'Sair do Pose')];
  switch (state.workspace) {
    case 'model': return [...transform, '|', C('add-menu', 'plus', 'Adicionar', '⇧A'), C('add-text', 'text', 'Texto'), '|', C('edit-mode', 'mesh', 'Editar', 'Tab'), C('boolean', 'boolean', 'Booleana'), C('join', 'merge', 'Juntar', '⌃J'), C('duplicate', 'copy', 'Duplicar', '⇧D'), C('delete', 'trash', 'Excluir', 'X')];
    case 'sculpt': return [...BRUSHES.map(([id, n]) => ({ brush: id, ic: { inflate: 'inflate', deflate: 'dig', grab: 'grab', smooth: 'smooth', flatten: 'flatten' }[id], label: n })), '|', { slider: 'radius', obj: sculpt, label: 'Raio', min: 0.05, max: 1.5, step: 0.01 }, { slider: 'strength', obj: sculpt, label: 'Força', min: 0.05, max: 1, step: 0.01 }, '|', C('sculpt-prepare', 'mesh', 'Mais detalhe')];
    case 'paint': return [{ ptool: 'brush', ic: 'paint', label: 'Pincel' }, { ptool: 'eraser', ic: 'Eraser', label: 'Borracha' }, { ptool: 'fill', ic: 'PaintBucket', label: 'Balde' }, '|', { color: true }, { slider: 'size', obj: paint, label: 'Tamanho', min: 2, max: 120, step: 1 }, { slider: 'opacity', obj: paint, label: 'Opacidade', min: 0.05, max: 1, step: 0.01 }, { slider: 'hardness', obj: paint, label: 'Dureza', min: 0, max: 0.95, step: 0.01 }, '|', C('uv-smart', 'uv', 'Desdobrar', 'U'), C('paint-export', 'download', 'Exportar')];
    case 'animate': return [...transform, '|', C('keyframe', 'key', 'Keyframe', 'I'), C('play', 'play', 'Play', '␣'), '|', C('pose-mode', 'pose', 'Pose', '⌃Tab'), C('sim-start', 'physics', physics.running ? 'Parar física' : 'Simular'), C('sim-bake', 'bake', 'Assar')];
    case 'vfx': return [T('move', 'move', 'Mover', 'G'), '|', ...VFX_TYPES.map((v) => C('add-vfx-' + v, v, VFX_LABEL[v]))];
    default: return [];
  }
}
export function renderDock() {
  const dock = $('#tool-dock'); const items = dockItems();
  dock.innerHTML = items.map((it, i) => {
    if (it === '|') return '<i class="sep"></i>';
    if (it.color) return `<input type="color" class="dock-color" data-color value="${paint.color}" data-tip-up data-tip="Cor">`;
    if (it.slider) return `<label class="dock-slider">${it.label} <input type="range" data-slider="${i}" min="${it.min}" max="${it.max}" step="${it.step}" value="${it.obj[it.slider]}"></label>`;
    const on = (it.tool && it.tool === state.tool) || (it.brush && it.brush === sculpt.brush) || (it.mode && it.mode === edit.select) || (it.ptool && it.ptool === paint.tool);
    return `<button class="dock-btn ${on ? 'on' : ''}" data-i="${i}" ${it.cmd === 'add-menu' ? 'data-anchor="add"' : ''} ${it.cmd === 'add-text' ? 'data-anchor="tool-text"' : ''}>${icon(it.ic, 19)}<span>${it.label}</span>${it.key ? `<kbd>${it.key}</kbd>` : ''}</button>`;
  }).join('');
  dock.onclick = (e) => {
    const b = e.target.closest('[data-i]'); if (!b) return; const it = items[+b.dataset.i];
    if (it.tool) setTool(it.tool);
    if (it.cmd === 'add-menu') { const r = b.getBoundingClientRect(); openAddMenu(r.left, r.top - 560); return; }
    if (it.cmd) runCommand(it.cmd); if (it.brush) sculpt.brush = it.brush; if (it.mode) setSelectMode(it.mode); if (it.ptool) paint.tool = it.ptool;
    renderDock();
  };
  dock.oninput = (e) => { if (e.target.dataset.color !== undefined) paint.color = e.target.value; const s = e.target.dataset.slider; if (s !== undefined) { const it = items[+s]; it.obj[it.slider] = +e.target.value; } };
}

// ---------- Ajustar última operação ----------
function renderOpPanel(op) {
  const el = $('#op-panel');
  if (!op || !Object.keys(op.params).length) { el.innerHTML = ''; return; }
  const LABEL = { distance: ['Distância', 'm', 0.01], amount: ['Quantidade', '', 0.01], width: ['Largura', 'm', 0.005], position: ['Posição', '', 0.01] };
  el.innerHTML = `<h4>${icon('sliders', 15)} ${op.label}</h4>${Object.entries(op.params).map(([k, v]) => `<div class="row"><label>${LABEL[k]?.[0] || k}</label><div class="num" data-axis=""><input data-k="${k}" value="${v}"></div></div>`).join('')}
    <p class="muted" style="font-size:11px;margin-top:6px">Digite o valor exato e pressione Enter.</p>`;
  el.querySelectorAll('input').forEach((i) => {
    i.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); };
    i.onchange = () => { const v = parseFloat(i.value); if (!isFinite(v)) return; op.rerun({ ...op.params, [i.dataset.k]: v }); renderOpPanel(op); };
  });
}

// ---------- Construção ----------
const lastMouse = { x: 300, y: 200 };
let mcpN = 0, upd = null;
function drawStatus() {
  const aiOn = document.body.classList.contains('ai-open');
  $('#tb-status').innerHTML = `${upd?.status === 'ready' ? `<button class="update-chip" id="upd">${icon('download', 15)} ${upd.version}</button>` : ''}
    <button id="b-undo" data-tip="Desfazer (Ctrl+Z)">${icon('undo', 17)}</button><button id="b-redo" data-tip="Refazer (Ctrl+Shift+Z)">${icon('redo', 17)}</button>
    ${SHEETS.map((s) => `<button data-sheet="${s.id}" class="${sheetOpen === s.id ? 'on' : ''}" data-tip="${s.label}">${icon(s.icon, 17)}</button>`).join('')}
    <button id="mcp-st" class="${mcpN ? 'dot-ok' : ''}" data-tip="MCP: ${mcpN ? mcpN + ' IA(s) conectada(s)' : 'nenhuma IA externa'}">${icon('plug', 17)}</button>
    <button id="ai-tg" class="${aiOn ? 'on' : ''}" data-tip="Assistente (Ctrl+.)">${icon('bot', 17)}</button>`;
  $('#upd')?.addEventListener('click', () => window.argila.update.install());
  $('#b-undo').onclick = () => history.undo(); $('#b-redo').onclick = () => history.redo();
  $('#tb-status').querySelectorAll('[data-sheet]').forEach((b) => (b.onclick = () => (sheetOpen === b.dataset.sheet ? closeSheet() : navigate(b.dataset.sheet))));
  $('#mcp-st').onclick = () => navigate('settings', 'mcp'); $('#ai-tg').onclick = toggleAI;
}

export function initShell() {
  registerAll();
  $('#brand').innerHTML = `${LOGO(24)}<span>Argila</span>${icon('chevron', 14)}`;
  $('#brand').onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); openAppMenu(r.left, r.bottom + 8); };
  $('#search-pill').innerHTML = `${icon('search', 15)}<span>Buscar…</span><kbd>Ctrl K</kbd>`; $('#search-pill').onclick = openPalette;
  $('#workspaces').innerHTML = WORKSPACES.map((w) => `<button data-ws="${w.id}" data-tip="${w.label} (Ctrl+${WORKSPACES.indexOf(w) + 1})">${icon(w.icon, 16)}<span>${w.label}</span></button>`).join('');
  $('#workspaces').onclick = (e) => { const b = e.target.closest('[data-ws]'); if (b) navigate(b.dataset.ws); };
  $('#sheet-close').innerHTML = icon('close', 18); $('#sheet-close').onclick = closeSheet;
  $('#sheet').onclick = (e) => { if (e.target.id === 'sheet') closeSheet(); };

  $('#mode-seg').innerHTML = `<button data-m="object" class="on" data-tip="Modo Objeto">${icon('object', 15)}Objeto</button><button data-m="edit" data-tip="Editar malha (Tab)">${icon('mesh', 15)}Editar</button>`;
  $('#mode-seg').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b && b.dataset.m !== state.mode) toggleEditMode(); };
  bus.on('mode', (m) => { document.querySelectorAll('#mode-seg button').forEach((b) => b.classList.toggle('on', b.dataset.m === m)); renderDock(); });
  bus.on('edit:select-mode', renderDock); bus.on('tool', () => { renderDock(); renderPrecision(); }); bus.on('physics', renderDock);
  bus.on('edit:op', renderOpPanel); bus.on('mode', (m) => m !== 'edit' && renderOpPanel(null));

  $('#shading-seg').innerHTML = [['wire', 'wire', 'Arame'], ['solid', 'solid', 'Sólido'], ['material', 'material', 'Material'], ['render', 'render', 'Render']].map(([m, ic, n], i) => `<button data-s="${m}" data-tip="${n} (Shift+${i + 1})">${icon(ic, 16)}</button>`).join('');
  $('#shading-seg').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) setShading(b.dataset.s); };
  bus.on('shading', (m) => document.querySelectorAll('#shading-seg button').forEach((b) => b.classList.toggle('on', b.dataset.s === m)));
  $('#vp-hint').innerHTML = 'Meio: girar · Shift+meio: mover · Roda: zoom · G/R/S + X/Y/Z + número: transformação exata';

  if (settings.prefs.aiOpen) document.body.classList.add('ai-open'); else $('#ai').classList.add('hidden');
  window.argila?.mcp?.onStatus((d) => { mcpN = d.connected; drawStatus(); if (d.connected) toast('Uma IA externa se conectou via MCP'); });
  window.argila?.update?.on((d) => { upd = d; drawStatus(); if (d.status === 'ready') toast(`Versão ${d.version} pronta`, { ms: 8000, action: { label: 'Reiniciar', run: () => window.argila.update.install() } }); });
  drawStatus(); renderPrecision();
  setupKeys();
  window.addEventListener('pointermove', (e) => { lastMouse.x = e.clientX; lastMouse.y = e.clientY; });
}

function setupKeys() {
  window.addEventListener('keydown', (e) => {
    if (isModal()) return;
    if (e.target?.closest?.('input, textarea, select, .cm-editor')) return;
    if ($('#modal-root').children.length) { if (e.key === 'Escape') $('#modal-root').innerHTML = ''; return; }
    if (e.key === 'Escape') { if (sheetOpen) return closeSheet(); closePop(); if (state.mode === 'edit') toggleEditMode(); else if (state.mode === 'pose') togglePose(); return; }
    const k = keyOf(e);
    if (sheetOpen && !/^(Ctrl|F\d)/.test(k)) return;
    if (state.mode === 'edit' && EDIT_KEYS[k]) { e.preventDefault(); EDIT_KEYS[k](lastMouse); return; }
    const cmd = [...commands.values()].find((c) => c.keys === k);
    if (cmd) { e.preventDefault(); runCommand(cmd.id); }
  });
}
