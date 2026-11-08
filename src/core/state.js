// Barramento de eventos + estado global. Módulos conversam por eventos,
// o que permite plugins futuros se acoplarem sem editar o núcleo.
const listeners = new Map();

export const bus = {
  on(evt, fn) { (listeners.get(evt) || listeners.set(evt, new Set()).get(evt)).add(fn); return () => listeners.get(evt)?.delete(fn); },
  emit(evt, data) { listeners.get(evt)?.forEach((fn) => { try { fn(data); } catch (e) { console.error(evt, e); } }); },
};

export const state = {
  selected: null,          // objeto ATIVO (último selecionado)
  selection: [],           // todos os selecionados (seleção múltipla)
  mode: 'object',          // 'object' | 'edit' | 'pose'
  tool: 'move',            // select | move | rotate | scale | measure | cursor
  workspace: 'model',
  shading: 'material',     // wire | solid | material | render
  time: 0, duration: 8, fps: 30, playing: false,
  env: { background: '#16181c', fog: 0, bloom: 0.12, exposure: 0.85, sky: 'studio' },
};

// Precisão: snap, pivô, orientação, edição proporcional, unidades.
export const precision = {
  snap: false,               // liga/desliga (Ctrl inverte temporariamente)
  snapTarget: 'increment',   // increment | grid | vertex
  moveStep: 0.25,            // m
  rotateStep: 15,            // graus
  scaleStep: 0.1,
  pivot: 'median',           // median | active | cursor | individual
  orientation: 'global',     // global | local
  proportional: false, propRadius: 1, propFalloff: 'smooth', // smooth | linear | sharp | sphere
  unit: 'm', decimals: 3, gridSize: 1,   // unidade de exibição (m, cm, mm, in) e tamanho da grade
  mirrorX: false,            // simetria em X no modo de edição
  showParts: false,          // mostra vértices/arestas de todas as malhas
};

/** Seleciona. opts.add: adiciona; opts.toggle: alterna; sem opts: substitui. */
export function select(obj, opts = {}) {
  if (!obj) { if (!opts.add && !opts.toggle) state.selection = []; }
  else if (opts.toggle && state.selection.includes(obj)) state.selection = state.selection.filter((o) => o !== obj);
  else if (opts.add || opts.toggle) state.selection = [...state.selection.filter((o) => o !== obj), obj];
  else state.selection = [obj];
  state.selected = state.selection[state.selection.length - 1] || null;
  bus.emit('selection', state.selected);
}
export function selectMany(list) {
  state.selection = [...new Set(list.filter(Boolean))];
  state.selected = state.selection[state.selection.length - 1] || null;
  bus.emit('selection', state.selected);
}

let uid = 0;
export const nextId = (prefix = 'obj') => `${prefix}_${(++uid).toString(36)}${Date.now().toString(36).slice(-3)}`;
