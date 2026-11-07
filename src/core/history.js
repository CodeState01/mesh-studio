// Undo/redo baseado em comandos (cada ação registra seu próprio inverso).
import { bus } from './state.js';

const undoStack = [];
const redoStack = [];
const LIMIT = 200;

export const history = {
  push(cmd) { // cmd: {label, undo(), redo()}
    undoStack.push(cmd);
    if (undoStack.length > LIMIT) undoStack.shift();
    redoStack.length = 0;
    bus.emit('history', { label: cmd.label });
  },
  undo() { const c = undoStack.pop(); if (!c) return; c.undo(); redoStack.push(c); bus.emit('history', { label: 'Desfazer: ' + c.label }); bus.emit('scene:changed'); },
  redo() { const c = redoStack.pop(); if (!c) return; c.redo(); undoStack.push(c); bus.emit('history', { label: 'Refazer: ' + c.label }); bus.emit('scene:changed'); },
  // Captura transformação antes/depois — usado pelo gizmo e pelo painel de propriedades.
  snapshot(obj) { return { p: obj.position.clone(), r: obj.rotation.clone(), s: obj.scale.clone() }; },
  restore(obj, s) { obj.position.copy(s.p); obj.rotation.copy(s.r); obj.scale.copy(s.s); },
  transform(obj, before, label = 'Transformar') {
    const after = this.snapshot(obj);
    if (before.p.equals(after.p) && before.r.equals(after.r) && before.s.equals(after.s)) return;
    this.push({ label, undo: () => this.restore(obj, before), redo: () => this.restore(obj, after) });
  },
};
