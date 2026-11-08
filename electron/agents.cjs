// Agentes por CONTA (assinatura) em vez de chave de API — com PRIVILÉGIO MÍNIMO.
// Usa as ferramentas oficiais que fazem login com a conta pessoal do usuário:
//   • Gemini CLI  (Google — conta gratuita ou Gemini Pro/Ultra)
//   • Claude Code (Anthropic — Claude Pro/Max)
// O agente recebe APENAS as ferramentas do Mesh (servidor MCP "mesh"): sem terminal,
// sem leitura/escrita de arquivos, sem web. Nada de cookies ou APIs internas de sites.
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const HOME = os.homedir();
const NPM_BIN = path.join(process.env.APPDATA || '', 'npm');

const CLIS = {
  gemini: {
    name: 'Gemini', account: 'Conta Google (grátis, Gemini Pro ou Ultra)', install: 'npm install -g @google/gemini-cli',
    candidates: ['gemini', path.join(NPM_BIN, 'gemini.cmd')], creds: [path.join(HOME, '.gemini', 'oauth_creds.json')],
    loginHint: 'Escolha Login with Google e conclua no navegador. Depois feche esta janela.', runnable: true,
  },
  claude: {
    name: 'Claude', account: 'Conta Claude (Pro ou Max)', install: 'irm https://claude.ai/install.ps1 | iex',
    candidates: ['claude', path.join(HOME, '.local', 'bin', 'claude.exe')], creds: [path.join(HOME, '.claude', '.credentials.json')],
    loginHint: 'Digite /login e escolha a sua conta Claude. Depois feche esta janela.', runnable: true,
  },
  codex: {
    name: 'ChatGPT', account: 'Conta ChatGPT (Plus, Pro ou Team)', install: 'npm install -g @openai/codex',
    candidates: ['codex', path.join(NPM_BIN, 'codex.cmd')], creds: [path.join(HOME, '.codex', 'auth.json')],
    loginHint: 'Escolha Sign in with ChatGPT e conclua no navegador.', loginArgs: ['login'], runnable: false,
  },
};

// Ferramentas embutidas dos CLIs que o agente do Mesh NUNCA recebe.
const GEMINI_EXCLUDED = ['run_shell_command', 'write_file', 'replace', 'read_file', 'read_many_files', 'list_directory', 'glob', 'search_file_content', 'web_fetch', 'google_web_search', 'save_memory'];
const CLAUDE_DENIED = ['Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'NotebookEdit', 'Task'];

function resolveBin(id) {
  for (const c of CLIS[id].candidates) {
    if (path.isAbsolute(c)) { if (fs.existsSync(c)) return c; continue; }
    try { const out = execFileSync('where', [c], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/).find(Boolean); if (out) return out.trim(); } catch {}
  }
  return null;
}

function status() {
  return Object.fromEntries(Object.entries(CLIS).map(([id, c]) => [id, {
    id, name: c.name, account: c.account, installed: !!resolveBin(id), loggedIn: c.creds.some((f) => fs.existsSync(f)),
    install: c.install, loginHint: c.loginHint, runnable: c.runnable,
  }]));
}

// Abre um terminal com a ferramenta oficial para o usuário entrar na PRÓPRIA conta (ação manual dele).
function openLogin(id) {
  const c = CLIS[id]; const bin = resolveBin(id); if (!bin) throw new Error(`${c.name} não está instalado`);
  const cmd = `echo ${c.loginHint} && "${bin}" ${(c.loginArgs || []).join(' ')}`;
  spawn('cmd.exe', ['/c', 'start', `"Mesh - conectar ${c.name}"`, 'cmd.exe', '/k', cmd], { detached: true, shell: false }).unref();
}

// O servidor MCP do Mesh roda com o Node embutido no Electron (não precisa ter Node instalado).
const mcpEntry = (serverPath, extra = {}) => ({ command: process.execPath, args: [serverPath], env: { ELECTRON_RUN_AS_NODE: '1' }, ...extra });

const runs = new Map();
function run({ id, prompt, model, serverPath, workDir, onEvent }) {
  const c = CLIS[id]; if (!c?.runnable) throw new Error(`${c?.name || id}: execução ainda não suportada`);
  const bin = resolveBin(id); if (!bin) throw new Error(`${c.name} não está instalado`);
  fs.mkdirSync(workDir, { recursive: true });
  let args;
  if (id === 'gemini') {
    // Só o servidor "mesh" é permitido; "trust" dispensa confirmação APENAS para as ferramentas dele;
    // as ferramentas embutidas (shell, arquivos, web) ficam excluídas.
    fs.mkdirSync(path.join(workDir, '.gemini'), { recursive: true });
    fs.writeFileSync(path.join(workDir, '.gemini', 'settings.json'), JSON.stringify({
      mcpServers: { mesh: mcpEntry(serverPath, { trust: true }) }, excludeTools: GEMINI_EXCLUDED,
    }, null, 2));
    args = ['-p', ' ', '--allowed-mcp-server-names', 'mesh', '-o', 'stream-json'];
    if (model) args.push('-m', model);
  } else {
    const cfg = path.join(workDir, 'mesh-mcp.json');
    fs.writeFileSync(cfg, JSON.stringify({ mcpServers: { mesh: mcpEntry(serverPath) } }, null, 2));
    args = ['-p', '--mcp-config', cfg, '--strict-mcp-config', '--allowedTools', 'mcp__mesh', '--disallowedTools', ...CLAUDE_DENIED, '--output-format', 'stream-json', '--verbose'];
    if (model) args.push('--model', model);
  }
  // O texto do usuário vai pelo stdin — nunca pela linha de comando.
  const isCmd = /\.(cmd|bat)$/i.test(bin);
  const child = isCmd
    ? spawn('cmd.exe', ['/d', '/s', '/c', `"${bin}" ${args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ')}`], { cwd: workDir, windowsHide: true, windowsVerbatimArguments: true })
    : spawn(bin, args, { cwd: workDir, windowsHide: true });
  const runId = Date.now().toString(36); runs.set(runId, child);
  child.stdin.write(prompt); child.stdin.end();
  let buf = '', errBuf = '';
  child.stdout.on('data', (d) => { buf += d.toString('utf8'); let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) handleLine(l); } });
  child.stderr.on('data', (d) => { errBuf = (errBuf + d.toString('utf8')).slice(-8000); });
  child.on('close', (code) => { if (buf.trim()) handleLine(buf.trim()); runs.delete(runId); onEvent({ runId, type: 'done', code, error: code ? cleanErr(errBuf) : undefined }); });
  child.on('error', (e) => onEvent({ runId, type: 'done', code: -1, error: e.message }));

  // Normaliza os formatos stream-json dos dois CLIs para { text | tool | result }
  function handleLine(line) {
    let o; try { o = JSON.parse(line); } catch { onEvent({ runId, type: 'text', text: line }); return; }
    if (o.type === 'assistant' && o.message?.content) {
      for (const b of o.message.content) {
        if (b.type === 'text' && b.text) onEvent({ runId, type: 'text', text: b.text });
        if (b.type === 'tool_use') onEvent({ runId, type: 'tool', name: String(b.name).replace(/^mcp__mesh__/, '') });
      }
    } else if (o.type === 'result') onEvent({ runId, type: 'result', text: typeof o.result === 'string' ? o.result : '' });
    else if (o.type === 'message' && o.role === 'assistant' && o.content) onEvent({ runId, type: 'text', text: o.content, delta: !!o.delta });
    else if (o.type === 'tool_use') onEvent({ runId, type: 'tool', name: String(o.tool_name || o.name || '') });
    else if (o.type === 'error') onEvent({ runId, type: 'text', text: '⚠ ' + (o.message || '') });
  }
  return runId;
}
const cleanErr = (s) => s.split(/\r?\n/).filter((l) => l.trim() && !/^\s+at /.test(l)).slice(-6).join('\n');
function stop(runId) { const c = runs.get(runId); if (c) spawn('taskkill', ['/pid', String(c.pid), '/t', '/f'], { windowsHide: true }); }

module.exports = { status, openLogin, run, stop };
