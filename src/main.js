// Mesh — ponto de entrada do renderer.
import { initViewport, setTool, setShading, applyEnvironment, setGridVisible } from './core/viewport.js';
import { bindEditGizmo } from './core/editmode.js';
import { initSculpt } from './core/sculpt.js';
import { initPrecision } from './core/precision.js';
import { initPaint } from './core/uv.js';
import { initFly } from './core/fly.js';
import { initLayout } from './ui/layout.js';
import { content, createPrimitive, createLight, createCamera, addToScene } from './core/objects.js';
import { select, bus, state } from './core/state.js';
import { loadSettings, applyUIPrefs, settings } from './core/settings.js';
import { initCursors } from './ui/cursors.js';
import { initShell, navigate } from './ui/shell.js';
import { initOutliner, initProperties } from './ui/panels.js';
import { initTimelineUI } from './ui/timelineUI.js';
import { initAIPanel } from './ui/aiPanel.js';
import { applyShadows } from './ui/settingsPage.js';
import { initVideo } from './video/editor.js';
import { execWithCursor } from './ai/agent.js';
import { loadPlugins } from './core/plugins.js';
import { startAutosave } from './io/io.js';
import { toast } from './ui/toast.js';
import { initFeatures } from './features/index.js';
import { runCommand } from './core/commands.js';
import { IMPL } from './core/tools.js';
import { pt } from './features/pathtrace.js';

const $ = (s) => document.querySelector(s);

async function boot() {
  await loadSettings();
  applyUIPrefs();
  initViewport($('#viewport'));
  bindEditGizmo();
  initSculpt();
  initPrecision();
  initPaint();
  initFly();
  initCursors(settings.prefs.cursors);
  initShell();
  initOutliner();
  initProperties();
  initVideo($('#viewport'), $('#timeline'));
  initTimelineUI();
  initAIPanel();
  initFeatures();
  initLayout();
  await loadPlugins();

  // Preferências de brilho/visual salvas
  applyEnvironment({ exposure: settings.prefs.exposure, bloom: settings.prefs.bloom });
  setGridVisible(settings.prefs.grid); applyShadows();

  // Cena inicial: cubo, luz e câmera — ponto de partida familiar.
  addToScene(createPrimitive('cube'), false);
  addToScene(createLight('point', { position: [3, 4.5, 2.5], intensity: 9 }), false);
  addToScene(createLight('directional', { name: 'Sol', position: [-5, 8, 4], intensity: 1.2 }), false);
  addToScene(createCamera({ position: [6.5, 4.2, 6.5], look_at: [0, 0.5, 0] }), false);
  select(content.children[0]);

  setTool('move'); setShading('material');
  navigate('model');
  navigate(new URLSearchParams(location.search).get('page') || 'home');
  startAutosave();

  // Chamadas vindas de clientes MCP externos → executam com cursor animado.
  window.meshApp?.mcp?.onCall(async ({ rid, tool, args }) => {
    const r = await execWithCursor({ name: tool, args });
    window.meshApp.mcp.reply({ rid, ok: r.ok, result: r.result, error: r.error });
  });

  // API de script no console do DevTools: Mesh.run('geonodes'), await Mesh.tools.add_primitive({ type: 'cube' })
  window.Mesh = { run: runCommand, tools: IMPL, state, navigate, debug: { pt } };
  requestAnimationFrame(() => $('#boot').classList.add('out'));
}

window.addEventListener('error', (e) => toast(e.message, { kind: 'error', ms: 5000 }));
window.addEventListener('unhandledrejection', (e) => toast(String(e.reason?.message || e.reason), { kind: 'error', ms: 5000 }));
boot().catch((e) => { console.error("BOOT FAIL", e?.stack || e); document.querySelector("#boot")?.classList.add("out"); toast("Erro ao iniciar: " + e.message, { kind: "error", ms: 8000 }); });
export { bus };
