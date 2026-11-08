// Console Python (como o console/scripting do Blender): Python 3 de verdade via Pyodide (WebAssembly),
// baixado na primeira vez. O módulo `mesh` expõe TODAS as ferramentas do Mesh (as mesmas do MCP):
//   import mesh
//   mesh.add_primitive(type="torus", position=[0, 1, 0], color="#ff6a3d")
//   for i in range(10): mesh.add_primitive(type="cube", position=[i, 0.5, 0], scale=[.5, .5, .5])
import { TOOLS, IMPL } from '../core/tools.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';

const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/';
let py = null, loading = null;
const history = []; let hIdx = 0;

async function load(out) {
  if (py) return py; if (loading) return loading;
  loading = (async () => {
    out('Baixando Python (Pyodide ~10 MB, só na primeira vez)…', 'muted');
    const { loadPyodide } = await import(/* @vite-ignore */ PYODIDE + 'pyodide.mjs');
    const p = await loadPyodide({ indexURL: PYODIDE, stdout: (s) => out(s), stderr: (s) => out(s, 'err') });
    // Ponte: cada ferramenta vira mesh.<nome>(**kwargs) e devolve dict/list do Python
    p.registerJsModule('_mesh_bridge', { call: (name, kwargs) => { const args = kwargs?.toJs ? kwargs.toJs({ dict_converter: Object.fromEntries }) : (kwargs || {}); const fn = IMPL[name]; if (!fn) throw new Error('Ferramenta desconhecida: ' + name); const r = fn(args); return r instanceof Promise ? r.then((x) => JSON.stringify(x ?? null)) : JSON.stringify(r ?? null); } });
    const names = TOOLS.map((t) => t.name);
    await p.runPythonAsync(`
import sys, types, json, inspect
import _mesh_bridge
mesh = types.ModuleType("mesh")
def _make(name, doc):
    async def _async(**kw):
        r = _mesh_bridge.call(name, kw)
        if hasattr(r, "then"): r = await r
        return json.loads(r)
    def f(**kw):
        r = _mesh_bridge.call(name, kw)
        if hasattr(r, "then"):
            return _async(**kw)
        return json.loads(r)
    f.__name__ = name; f.__doc__ = doc
    return f
for _n, _d in ${JSON.stringify(TOOLS.map((t) => [t.name, t.description]))}:
    setattr(mesh, _n, _make(_n, _d))
mesh.tools = ${JSON.stringify(names)}
sys.modules["mesh"] = mesh
`);
    out(`Python ${p.version} pronto. ${names.length} ferramentas em \`mesh\` — digite help(mesh.add_primitive)`, 'ok');
    py = p; return p;
  })();
  try { return await loading; } catch (e) { loading = null; throw e; }
}

export function openPython() {
  const root = document.querySelector('#modal-root');
  root.innerHTML = `<div class="modal-bg"><div class="modal py-console"><div class="modal-h">${icon('terminal')} Console Python <span class="muted" style="font-weight:400;font-size:12px">· import mesh · Ctrl+Enter executa · ↑↓ histórico</span><span class="spacer"></span><button class="icon-btn" data-x>${icon('close', 16)}</button></div>
    <div class="py-out" id="py-out"></div>
    <textarea id="py-in" spellcheck="false" rows="5">import mesh\nfor i in range(8):\n    mesh.add_primitive(type="cube", position=[i * 0.7 - 2.5, 0.25 + i * 0.15, 0], scale=[.5, .5, .5], color=f"hsl({i * 40}, 70%, 60%)")</textarea>
    <div class="modal-f"><button class="btn" id="py-tools">${icon('list', 14)} Listar ferramentas</button><button class="btn primary" id="py-run">${icon('play', 14)} Executar</button></div></div></div>`;
  const outEl = root.querySelector('#py-out'); const inp = root.querySelector('#py-in');
  const out = (s, cls = '') => { const d = document.createElement('div'); d.className = 'py-line ' + cls; d.textContent = s; outEl.appendChild(d); outEl.scrollTop = outEl.scrollHeight; };
  root.querySelector('[data-x]').onclick = () => (root.innerHTML = '');
  const run = async (code) => {
    out('>>> ' + code.split('\n').join('\n... '), 'cmd'); history.push(code); hIdx = history.length;
    try { const p = await load(out); const r = await p.runPythonAsync(code); if (r !== undefined && r !== null) out(String(r?.toString?.() ?? r)); }
    catch (e) { out(String(e.message || e).split('\n').filter(Boolean).slice(-4).join('\n'), 'err'); }
  };
  root.querySelector('#py-run').onclick = () => run(inp.value);
  root.querySelector('#py-tools').onclick = () => run('import mesh\nprint("\\n".join(mesh.tools))');
  inp.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); run(inp.value); }
    if (e.key === 'ArrowUp' && e.ctrlKey && history.length) { hIdx = Math.max(0, hIdx - 1); inp.value = history[hIdx]; }
    if (e.key === 'ArrowDown' && e.ctrlKey && history.length) { hIdx = Math.min(history.length - 1, hIdx + 1); inp.value = history[hIdx]; }
  };
  inp.focus(); load(out).catch((e) => { out('Não foi possível carregar o Python: ' + e.message + ' (precisa de internet na 1ª vez)', 'err'); toast('Python indisponível offline na primeira vez', { kind: 'error' }); });
}
