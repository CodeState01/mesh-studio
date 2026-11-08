// Recursos estilo Blender (blender.org/features) ligados ao app: workspace Desenhar, página de Rastreamento,
// comandos (Ctrl+K / menus / atalhos), dock e as ferramentas expostas à IA e ao MCP.
import { WORKSPACES, SHEETS, DOCKS, COMMAND_HOOKS, navigate, renderDock } from '../ui/shell.js';
import { IMPL } from '../core/tools.js';
import { state, bus, select } from '../core/state.js';
import { content, findTarget, describe } from '../core/objects.js';
import { history } from '../core/history.js';
import { setShading } from '../core/viewport.js';
import { toast } from '../ui/toast.js';
import { showHeat, clearHeat, heatWeights, initHeat, HEAT_MODES, heat } from './heatmap.js';
import { renderCyclesToFile, pt } from './pathtrace.js';
import { addGeoNodes, openNodeEditor, PRESETS } from './geonodes.js';
import { pencil, initPencil, addStroke, addFrame, pencilToMesh, createPencilObject } from './grease.js';
import { createCurve, CURVE_TYPES, enterCurveEdit, exitCurveEdit, isCurveEditing, curveToMesh, initCurves } from './curves.js';
import { addSimulation, toggleSims, resetSims, initSims, makeSoftBody, addHair } from './sims.js';
import { addConstraint, addIK, captureShapeKey, initAnimX } from './animx.js';
import { initCompositor, openCompositor, setEffect, EFFECTS } from './compositor.js';
import { renderTracking } from './tracking.js';
import { openPython } from './python.js';
import { addModifier, refresh } from '../core/modruntime.js';
import { MODIFIERS } from '../core/modstack.js';

WORKSPACES.splice(4, 0, { id: 'draw', label: 'Desenhar', icon: 'PenLine' });
SHEETS.splice(4, 0, { id: 'tracking', label: 'Rastrear', icon: 'ScanEye', render: renderTracking });

const addUndo = (obj, label) => { content.add(obj); bus.emit('scene:changed'); select(obj); history.push({ label, undo: () => { content.remove(obj); bus.emit('scene:changed'); }, redo: () => { content.add(obj); bus.emit('scene:changed'); } }); return obj; };

COMMAND_HOOKS.push((R) => {
  // Render
  R('render-cycles', 'Renderizar com Ciclos (path tracing)', () => renderCyclesToFile({ samples: 256 }), 'F11', 'Render', 'Sparkles', 'Luz indireta física, reflexos e sombras macias');
  R('shade-cycles-toggle', 'Viewport em Ciclos (path tracing)', () => setShading(state.shading === 'cycles' ? 'material' : 'cycles'), 'Shift+Z', 'Render', 'Sparkles');
  R('compositor', 'Compositor (pós-processamento)…', openCompositor, null, 'Render', 'SlidersHorizontal', 'Cor, vinheta, DOF, AO, grão, lente…');
  R('render-passes', 'Passes de render: profundidade', () => setShading('depth'), null, 'Render', 'Layers');
  // Pontos de calor
  HEAT_MODES.forEach(([id, n]) => R('heat-' + id, 'Pontos de calor: ' + n, () => { try { showHeat(state.selected, id); } catch (e) { toast(e.message, { kind: 'error' }); } }, null, 'Análise', 'Flame'));
  R('heat-off', 'Desligar pontos de calor', clearHeat, null, 'Análise', 'eyeoff');
  R('heat-weights', 'Pesos por calor (difusão)', () => heatWeights(state.selected), null, 'Rig e Física', 'Flame', 'Pesos automáticos como o Bone Heat do Blender');
  R('weight-paint', 'Pintar pesos (Weight Paint)', () => { try { showHeat(state.selected, 'weights'); } catch (e) { toast(e.message, { kind: 'error' }); return; } heat.paint = true; state.blockPick = true; toast('Pinte pesos: arraste na malha · Shift subtrai · escolha o osso na aba Recursos'); }, null, 'Rig e Física', 'Paintbrush');
  bus.on('heat', (h) => { if (!h.paint) state.blockPick = false; });
  // Nós de geometria
  R('geonodes', 'Nós de geometria…', () => openNodeEditor(state.selected), 'Shift+N', 'Modelagem', 'Workflow', 'Geometry Nodes: espalhar, instanciar, ruído…');
  Object.keys(PRESETS).filter((k) => k !== 'basic').forEach((k) => R('geonodes-' + k, 'Nós: ' + { rocks: 'espalhar pedras', grass: 'grama', cubegrid: 'grade de cubos', organic: 'forma orgânica' }[k], () => addGeoNodes(state.selected, k), null, 'Modelagem', 'Workflow'));
  // Retopologia
  R('remesh', 'Remesh voxel (quads)', () => addModifier(state.selected, 'remesh'), null, 'Modelagem', 'Box', 'Refaz a malha em quads uniformes');
  R('decimate-mod', 'Decimar (modificador)', () => addModifier(state.selected, 'decimate'), null, 'Modelagem', 'Minimize2');
  R('shrinkwrap', 'Shrinkwrap (encolher sobre outro objeto)', () => addModifier(state.selected, 'shrinkwrap'), null, 'Modelagem', 'Magnet');
  // Curvas
  Object.entries(CURVE_TYPES).forEach(([k, n]) => R('add-curve-' + k, n, () => addUndo(createCurve(k), 'Curva'), null, 'Adicionar', 'Spline'));
  R('curve-edit', 'Editar pontos da curva', () => (isCurveEditing() ? exitCurveEdit() : enterCurveEdit(state.selected)), null, 'Modelagem', 'PenTool');
  R('curve-to-mesh', 'Curva → malha', () => curveToMesh(state.selected), null, 'Modelagem', 'mesh');
  // Desenho (Grease Pencil)
  R('add-pencil', 'Desenho (lápis 3D)', () => { addUndo(createPencilObject(), 'Desenho'); navigate('draw'); }, null, 'Adicionar', 'PenLine');
  R('pencil-draw', 'Lápis', () => { pencil.tool = 'draw'; renderDock(); }, 'D', null, 'PenLine');
  R('pencil-erase', 'Borracha de traços', () => { pencil.tool = 'erase'; renderDock(); }, null, 'Desenho', 'Eraser');
  R('pencil-fill', 'Preenchimento (liga/desliga)', () => { pencil.fill = !pencil.fill; renderDock(); }, null, 'Desenho', 'PaintBucket');
  R('pencil-frame', 'Novo quadro de desenho', () => addFrame(false), null, 'Desenho', 'key');
  R('pencil-frame-copy', 'Duplicar quadro de desenho', () => addFrame(true), null, 'Desenho', 'copy');
  R('pencil-mesh', 'Desenho → malha', () => pencilToMesh(state.selected), null, 'Desenho', 'mesh');
  // Simulações
  [['fluid', 'Líquido', 'Droplets'], ['smoke', 'Fumaça (volume)', 'CloudFog'], ['fire', 'Fogo (volume)', 'Flame'], ['ocean', 'Oceano', 'Waves']].forEach(([k, n, ic]) => R('add-sim-' + k, n, () => addSimulation(k), null, 'Simulação', ic));
  R('softbody', 'Transformar em corpo mole', () => makeSoftBody(state.selected), null, 'Simulação', 'Circle');
  R('hair', 'Adicionar cabelo/pelo', () => addHair(state.selected), null, 'Simulação', 'Brush');
  R('sim-effects', 'Simular efeitos (líquido, fumaça, corpo mole, cabelo)', () => toggleSims(), 'Shift+Alt+Space', 'Simulação', 'Atom');
  R('sim-reset', 'Reiniciar simulações', resetSims, null, 'Simulação', 'refresh');
  // Animação e rigging
  R('add-ik', 'Adicionar IK (cinemática inversa)', () => addIK(state.selected), null, 'Rig e Física', 'bone');
  R('shape-key', 'Capturar shape key', () => captureShapeKey(state.selected), null, 'Animação', 'Blend');
  R('track-to', 'Restrição: olhar para o ativo', () => { const t = state.selected; const others = state.selection.filter((o) => o !== t); if (!t || !others.length) { toast('Selecione os objetos e, por último, o alvo'); return; } others.forEach((o) => addConstraint(o, 'track', { target: t.name })); }, null, 'Animação', 'Eye');
  // VFX / script
  R('go-tracking', 'Rastreamento de movimento', () => navigate('tracking'), null, 'VFX', 'ScanEye');
  R('python', 'Console Python', openPython, 'Shift+F4', 'Script', 'terminal', 'Python 3 com o módulo mesh (todas as ferramentas)');
});

DOCKS.draw = () => [
  { cmd: 'pencil-draw', ic: 'PenLine', label: 'Lápis', key: 'D', on: pencil.tool === 'draw' }, { cmd: 'pencil-erase', ic: 'Eraser', label: 'Borracha', on: pencil.tool === 'erase' }, { cmd: 'pencil-fill', ic: 'PaintBucket', label: pencil.fill ? 'Preencher ✓' : 'Preencher' }, '|',
  { color: true, obj: pencil, key: 'color' }, { slider: 'width', obj: pencil, label: 'Espessura', min: 0.004, max: 0.25, step: 0.002 }, '|',
  { cmd: 'pencil-frame', ic: 'key', label: 'Quadro' }, { cmd: 'pencil-frame-copy', ic: 'copy', label: 'Duplicar' }, { cmd: 'pencil-mesh', ic: 'mesh', label: '→ Malha' },
];

// ---------- Ferramentas para a IA (agente interno + MCP) ----------
const need = (t) => { const o = findTarget(t); if (!o) throw new Error('Objeto não encontrado: ' + t); return o; };
Object.assign(IMPL, {
  heatmap(a) { if (a.mode === 'off') { clearHeat(); return { ok: true }; } return showHeat(need(a.target), a.mode || 'curvature'); },
  heat_weights(a) { return heatWeights(need(a.target)); },
  render_cycles(a) { return renderCyclesToFile({ samples: a.samples ?? 128, width: a.width ?? 1920, height: a.height ?? 1080 }); },
  viewport_cycles(a) { setShading(a.enabled === false ? 'material' : 'cycles'); if (a.bounces) pt.bounces = a.bounces; return { shading: state.shading }; },
  geometry_nodes(a) { return addGeoNodes(need(a.target), a.preset || 'rocks'); },
  add_curve(a) { const c = addUndo(createCurve(a.type || 'bezier', a), 'Curva'); return describe(c); },
  draw_stroke(a) { return addStroke(a.points, a); },
  add_simulation(a) { return addSimulation(a.type, { ...a, target: a.target ? need(a.target) : state.selected }); },
  simulate(a) { if (a.reset) resetSims(); else toggleSims(a.running ?? true); return { running: a.running ?? true }; },
  add_constraint(a) { return addConstraint(need(a.target), a.type, a.to ? { target: a.to, ...(a.params || {}) } : a.params || {}); },
  add_ik(a) { return addIK(need(a.target)); },
  add_modifier_stack(a) { const o = need(a.target); if (!MODIFIERS[a.type]) throw new Error('Modificador desconhecido'); addModifier(o, a.type); if (a.params) { const i = o.userData.modifiers.length - 1; Object.assign(o.userData.modifiers[i].params, a.params); refresh(o); } return { target: o.name, modifiers: o.userData.modifiers.map((m) => m.type) }; },
  compositor(a) { if (!EFFECTS[a.effect]) throw new Error('Efeito desconhecido'); return setEffect(a.effect, { enabled: a.enabled ?? true, ...(a.params || {}) }); },
});

export function initFeatures() { initHeat(); initPencil(); initCurves(); initSims(); initAnimX(); initCompositor(); }
