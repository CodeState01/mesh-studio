// Executor das ferramentas declaradas em mcp/toolspec.mjs.
// Usado por: servidor MCP externo (via ponte), agente interno e modo demo.
import * as THREE from 'three';
import { TOOLS } from '../../mcp/toolspec.mjs';
import { content, createPrimitive, createText, createLight, createCamera, addToScene, findTarget, describe, DEG } from './objects.js';
import { state, bus, select } from './state.js';
import { history } from './history.js';
import { applyEnvironment, captureImage, lookThrough, worldToScreen } from './viewport.js';
import { applyModifier } from './modifiers.js';
import { applyTexture } from '../fx/textures.js';
import { createVFX } from '../fx/vfx.js';
import { insertKey, motionPreset, addSFX, setTime, play, anim } from '../anim/timeline.js';
import { addClip, video, clipCenter } from '../video/editor.js';

export { TOOLS };

function need(t) { const o = findTarget(t); if (!o) throw new Error(`Objeto não encontrado: ${t}`); return o; }

function addWithUndo(obj, label) {
  addToScene(obj);
  history.push({ label, undo: () => { content.remove(obj); select(null); bus.emit('scene:changed'); }, redo: () => { content.add(obj); bus.emit('scene:changed'); } });
  return describe(obj);
}

export const IMPL = {
  scene_info() {
    return {
      objects: content.children.map(describe),
      timeline: { duration: state.duration, fps: state.fps, time: state.time, animated: [...anim.tracks.keys()].length, sfx: anim.sfx.length },
      video: { clips: video.clips.map(({ id, kind, track, start, duration, text }) => ({ id, kind, track, start, duration, text })) },
      environment: state.env,
    };
  },
  add_primitive(a) { return addWithUndo(createPrimitive(a.type, a), 'Adicionar ' + a.type); },
  add_text(a) { return addWithUndo(createText(a.text, a), 'Texto'); },
  add_light(a) { return addWithUndo(createLight(a.type, a), 'Luz'); },
  add_camera(a) { const c = createCamera(a); const r = addWithUndo(c, 'Câmera'); if (a.active) lookThrough(c); return r; },
  transform(a) {
    const o = need(a.target); const before = history.snapshot(o);
    if (a.position) o.position.fromArray(a.position);
    if (a.rotation) o.rotation.set(a.rotation[0] * DEG, a.rotation[1] * DEG, a.rotation[2] * DEG);
    if (a.scale) o.scale.fromArray(a.scale);
    history.transform(o, before); bus.emit('object:transformed', o); return describe(o);
  },
  set_material(a) {
    const o = need(a.target); const m = o.material; if (!m) throw new Error('Objeto sem material');
    const prev = m.clone(); const prevTex = o.userData.texture;
    if (a.texture !== undefined) applyTexture(o, a.texture, a.texture_scale ?? 2);
    if (a.color) m.color?.set(a.color);
    if (a.metalness !== undefined) m.metalness = a.metalness;
    if (a.roughness !== undefined) m.roughness = a.roughness;
    if (a.emissive) m.emissive?.set(a.emissive);
    if (a.emissive_intensity !== undefined) m.emissiveIntensity = a.emissive_intensity;
    if (a.opacity !== undefined) { m.opacity = a.opacity; m.transparent = a.opacity < 1; }
    if (a.wireframe !== undefined) m.wireframe = a.wireframe;
    m.needsUpdate = true;
    const next = m.clone();
    history.push({ label: 'Material', undo: () => { o.material = prev; o.userData.texture = prevTex; }, redo: () => { o.material = next; } });
    bus.emit('material:changed', o); return { ok: true, target: o.name };
  },
  add_modifier(a) { const r = applyModifier(need(a.target), a.type, a); bus.emit('scene:changed'); return r; },
  delete_object(a) {
    const o = need(a.target); const parent = o.parent; parent.remove(o); if (state.selected === o) select(null);
    history.push({ label: 'Excluir', undo: () => { parent.add(o); bus.emit('scene:changed'); }, redo: () => { parent.remove(o); bus.emit('scene:changed'); } });
    bus.emit('scene:changed'); return { deleted: o.name };
  },
  add_keyframe(a) {
    const o = need(a.target);
    if (a.time > state.duration) state.duration = Math.ceil(a.time);
    insertKey(o, a.time, a, a.ease || 'easeInOut'); return { ok: true, target: o.name, time: a.time };
  },
  motion_preset(a) { const o = need(a.target); motionPreset(o, a.preset, a.start ?? 0, a.duration ?? 1); return { ok: true }; },
  set_timeline(a) {
    if (a.duration) state.duration = a.duration; if (a.fps) state.fps = a.fps;
    if (a.time !== undefined) setTime(a.time); if (a.play !== undefined) play(a.play);
    bus.emit('anim:changed'); return { duration: state.duration, fps: state.fps };
  },
  add_vfx(a) { const v = createVFX(a.type, a); return addWithUndo(v, 'VFX ' + a.type); },
  add_sfx(a) { const e = addSFX(a.preset, a.time ?? state.time, a.volume ?? 1); return { id: e.id, time: e.t }; },
  set_environment(a) { applyEnvironment(a); return state.env; },
  video_add_clip(a) { const c = addClip({ ...a, track: a.track ?? (a.kind === 'title' ? 2 : 1) }); return { id: c.id, start: c.start, duration: c.duration }; },
  screenshot(a) {
    const url = captureImage(a.width || 1280, a.height || 720);
    return { __image: url.split(',')[1] };
  },
};

export async function runTool(name, args = {}) {
  const fn = IMPL[name]; if (!fn) throw new Error('Ferramenta desconhecida: ' + name);
  const r = await fn(args); bus.emit('tool:ran', { name, args }); return r;
}

// ---------- Para onde o cursor da IA deve ir antes/depois de cada ferramenta ----------
const el = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); if (!r.width) return null; return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
const viewportCenter = () => el('#viewport');

export function anchorBefore(name, args) {
  const spec = TOOLS.find((t) => t.name === name); const ui = spec?.ui;
  const map = {
    add: '[data-anchor="add"]', text: '[data-anchor="tool-text"]', material: '[data-tab="material"]',
    modifiers: '[data-tab="modifiers"]', timeline: '#timeline', vfx: '[data-anchor="add"]',
    audio: '#timeline', world: '[data-tab="world"]', video: '#timeline', render: '[data-anchor="render"]', outliner: '#outliner',
  };
  if (args?.target) { const o = findTarget(args.target); if (o) return worldToScreen(o.getWorldPosition(new THREE.Vector3())); }
  return el(map[ui]) || viewportCenter();
}

export function anchorAfter(name, args, result) {
  if (result?.id && name === 'video_add_clip') return clipCenter(result.id);
  const id = result?.id || args?.target; const o = id && findTarget(id);
  if (o) return worldToScreen(o.getWorldPosition(new THREE.Vector3()));
  if (args?.position) return worldToScreen(new THREE.Vector3(...args.position));
  return null;
}

export const VERB = {
  scene_info: 'lendo a cena', add_primitive: 'modelando', add_text: 'criando texto', add_light: 'iluminando',
  add_camera: 'posicionando câmera', transform: 'transformando', set_material: 'aplicando material',
  add_modifier: 'modificando malha', delete_object: 'removendo', add_keyframe: 'animando', motion_preset: 'criando motion',
  set_timeline: 'ajustando timeline', add_vfx: 'criando VFX', add_sfx: 'criando SFX', set_environment: 'ajustando mundo',
  video_add_clip: 'editando vídeo', screenshot: 'renderizando',
  heatmap: 'analisando a malha', heat_weights: 'calculando pesos', render_cycles: 'renderizando (Ciclos)', viewport_cycles: 'ligando path tracing',
  geometry_nodes: 'montando nós', add_curve: 'traçando curva', draw_stroke: 'desenhando', add_simulation: 'criando simulação', simulate: 'simulando',
  add_constraint: 'ligando restrição', add_ik: 'criando IK', add_modifier_stack: 'modificando malha', compositor: 'compondo a imagem',
};
