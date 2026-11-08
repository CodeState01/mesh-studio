// API de extensões — ponto de entrada para recursos futuros sem tocar no núcleo.
// Qualquer arquivo em src/plugins/*.js que exporte `default (api) => {}` é carregado na inicialização.
//
// Exemplo (src/plugins/meu-plugin.js):
//   export default (api) => {
//     api.registerCommand({ id: 'hello', label: 'Dizer olá', run: () => api.toast('Olá!') });
//     api.registerPrimitive('pyramid', 'Pirâmide', () => new api.THREE.ConeGeometry(0.6, 1, 4));
//   };
import * as THREE from 'three';
import { bus, state } from './state.js';
import { registerCommand } from './commands.js';
import { addToScene, makeMaterial, content } from './objects.js';
import { toast } from '../ui/toast.js';
import { runTool } from './tools.js';

export const extraPrimitives = new Map();

const api = {
  THREE, bus, state, content, toast, runTool,
  registerCommand,
  registerPrimitive(id, label, makeGeometry) {
    extraPrimitives.set(id, { label, makeGeometry });
    registerCommand({ id: 'add-' + id, label: 'Adicionar ' + label, group: 'Adicionar', run: () => {
      const m = new THREE.Mesh(makeGeometry(), makeMaterial()); m.name = label; m.userData.kind = 'mesh'; m.userData.id = id + Date.now();
      addToScene(m);
    } });
  },
};

export async function loadPlugins() {
  const mods = import.meta.glob('../plugins/*.js', { eager: true });
  for (const [path, mod] of Object.entries(mods)) {
    try { await mod.default?.(api); console.info('[mesh] plugin carregado:', path); }
    catch (e) { console.error('[mesh] falha no plugin', path, e); }
  }
}
