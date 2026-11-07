// Barramento de eventos + estado global mínimo. Módulos conversam por eventos,
// o que permite plugins futuros se acoplarem sem editar o núcleo.
const listeners = new Map();

export const bus = {
  on(evt, fn) { (listeners.get(evt) || listeners.set(evt, new Set()).get(evt)).add(fn); return () => listeners.get(evt)?.delete(fn); },
  emit(evt, data) { listeners.get(evt)?.forEach((fn) => { try { fn(data); } catch (e) { console.error(evt, e); } }); },
};

export const state = {
  selected: null,          // THREE.Object3D selecionado
  mode: 'object',          // 'object' | 'edit'
  tool: 'move',            // select | move | rotate | scale
  workspace: 'model',      // model | animate | vfx | texture | video
  shading: 'material',     // wire | solid | material | render
  time: 0, duration: 8, fps: 30, playing: false,
  env: { background: '#16181c', fog: 0, bloom: 0.12, exposure: 0.85, sky: 'studio' },
};

export function select(obj) {
  state.selected = obj || null;
  bus.emit('selection', state.selected);
}

let uid = 0;
export const nextId = (prefix = 'obj') => `${prefix}_${(++uid).toString(36)}${Date.now().toString(36).slice(-3)}`;
