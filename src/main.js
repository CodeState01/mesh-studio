// Orbe Studio — ponto de entrada do renderer.
import { initViewport, setTool, setShading } from './core/viewport.js';
import { bindEditGizmo } from './core/editmode.js';
import { content, createPrimitive, createLight, createCamera, addToScene } from './core/objects.js';
import { select, bus } from './core/state.js';
import { initCursors } from './ui/cursors.js';
import { initShell, setWorkspace } from './ui/shell.js';
import { initOutliner, initProperties } from './ui/panels.js';
import { initTimelineUI } from './ui/timelineUI.js';
import { initAIPanel } from './ui/aiPanel.js';
import { initVideo } from './video/editor.js';
import { execWithCursor } from './ai/agent.js';
import { loadPlugins } from './core/plugins.js';
import { startAutosave } from './io/io.js';
import { toast } from './ui/toast.js';

const $ = (s) => document.querySelector(s);

async function boot() {
  initViewport($('#viewport'));
  bindEditGizmo();
  initCursors(4);
  initShell();
  initOutliner();
  initProperties();
  initVideo($('#viewport'), $('#timeline'));
  initTimelineUI();
  await initAIPanel();
  await loadPlugins();

  // Cena inicial: cubo, luz e câmera — ponto de partida familiar.
  addToScene(createPrimitive('cube'), false);
  addToScene(createLight('point', { position: [3, 4.5, 2.5], intensity: 22 }), false);
  addToScene(createLight('directional', { name: 'Sol', position: [-5, 8, 4], intensity: 1.2 }), false);
  addToScene(createCamera({ position: [6.5, 4.2, 6.5], look_at: [0, 0.5, 0] }), false);
  select(content.children[0]);

  setTool('move'); setShading('material'); setWorkspace('model');
  startAutosave();

  // Chamadas vindas de clientes MCP externos → executam com cursor animado.
  window.orbe?.mcp?.onCall(async ({ rid, tool, args }) => {
    const r = await execWithCursor({ name: tool, args });
    window.orbe.mcp.reply({ rid, ok: r.ok, result: r.result, error: r.error });
  });

  requestAnimationFrame(() => $('#boot').classList.add('out'));
}

window.addEventListener('error', (e) => toast(e.message, { kind: 'error', ms: 5000 }));
window.addEventListener('unhandledrejection', (e) => toast(String(e.reason?.message || e.reason), { kind: 'error', ms: 5000 }));
boot();
export { bus };
