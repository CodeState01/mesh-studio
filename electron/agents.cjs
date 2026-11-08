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
    loginHint: 'Escolha Sign in with ChatGPT e conclua no navegador.', loginArgs: ['login'], runnable: true,
    restricted: 'Roda em sandbox somente leitura, sem rede',
  },
  qwen: {
    name: 'Qwen', account: 'Conta Qwen (login grátis com cota diária)', install: 'npm install -g @qwen-code/qwen-code',
    candidates: ['qwen', path.join(NPM_BIN, 'qwen.cmd')], creds: [path.join(HOME, '.qwen', 'oauth_creds.json')],
    loginHint: 'Escolha Qwen OAuth e conclua no navegador. Depois feche esta janela.', runnable: true,
  },
  copilot: {
    name: 'GitHub Copilot', account: 'Assinatura Copilot (Free, Pro ou Business)', install: 'npm install -g @github/copilot',
    candidates: ['copilot', path.join(NPM_BIN, 'copilot.cmd')], creds: [path.join(HOME, '.copilot', 'config.json')],
    loginHint: 'Digite /login e conclua no navegador. Depois feche esta janela.', runnable: true,
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

// Copilot: o login fica registrado em config.json (lista de usuários logados)
function loggedIn(id) {
  const c = CLIS[id];
  if (id === 'copilot') { try { const j = JSON.parse(fs.readFileSync(c.creds[0], 'utf8')); return !!(j.logged_in_users?.length || j.last_logged_in_user); } catch { return false; } }
  return c.creds.some((f) => fs.existsSync(f));
}
function status() {
  return Object.fromEntries(Object.entries(CLIS).map(([id, c]) => [id, {
    id, name: c.name, account: c.account, installed: !!resolveBin(id), loggedIn: loggedIn(id),
    install: c.install, loginHint: c.loginHint, runnable: c.runnable, restricted: c.restricted,
  }]));
}
// Para o Copilot o pedido precisa ir como argumento: rodamos o script JS dele direto no Node (sem cmd.exe),
// então o texto do usuário nunca passa por um interpretador de comandos.
function copilotEntry() {
  const dir = path.join(NPM_BIN, 'node_modules', '@github', 'copilot');
  try { const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); const bin = typeof pj.bin === 'string' ? pj.bin : Object.values(pj.bin || {})[0]; if (bin) return path.join(dir, bin); } catch {}
  return null;
}
function nodeBin() { try { return execFileSync('where', ['node'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/).find(Boolean)?.trim() || null; } catch { return null; } }

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
  let args, stdinPrompt = true, direct = null;
  if (id === 'qwen') {
    // Qwen Code é derivado do Gemini CLI: mesmo formato de settings e as mesmas ferramentas embutidas a excluir.
    fs.mkdirSync(path.join(workDir, '.qwen'), { recursive: true });
    fs.writeFileSync(path.join(workDir, '.qwen', 'settings.json'), JSON.stringify({
      mcpServers: { mesh: mcpEntry(serverPath, { trust: true }) }, excludeTools: [...GEMINI_EXCLUDED, 'todo_write', 'task'],
    }, null, 2));
    args = ['-p', ' ', '--allowed-mcp-server-names', 'mesh'];
    if (model) args.push('-m', model);
  } else if (id === 'codex') {
    // Codex: servidor MCP via -c (TOML), sandbox somente leitura e pedido pelo stdin ("-").
    const fwd = (p) => p.replace(/\\/g, '/');
    args = ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only',
      '-c', `mcp_servers.mesh.command="${fwd(process.execPath)}"`, '-c', `mcp_servers.mesh.args=["${fwd(serverPath)}"]`,
      '-c', 'mcp_servers.mesh.env={ELECTRON_RUN_AS_NODE="1"}', '-c', 'sandbox_workspace_write.network_access=false'];
    if (model) args.push('-m', model);
    args.push('-');
  } else if (id === 'copilot') {
    const entry = copilotEntry(), node = nodeBin();
    if (!entry || !node) throw new Error('GitHub Copilot CLI: instalação via npm não encontrada (precisa de Node 22+)');
    const cfg = path.join(workDir, 'copilot-mcp.json');
    fs.writeFileSync(cfg, JSON.stringify({ mcpServers: { mesh: { type: 'local', tools: ['*'], ...mcpEntry(serverPath) } } }, null, 2));
    stdinPrompt = false;
    direct = [node, [entry, '-p', prompt, '--additional-mcp-config', '@' + cfg, '--allow-tool', 'mesh', '--deny-tool', 'shell', '--deny-tool', 'write', '--disable-builtin-mcps', ...(model ? ['--model', model] : [])]];
  } else if (id === 'gemini') {
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
  const child = direct ? spawn(direct[0], direct[1], { cwd: workDir, windowsHide: true, shell: false }) : isCmd
    ? spawn('cmd.exe', ['/d', '/s', '/c', `"${bin}" ${args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ')}`], { cwd: workDir, windowsHide: true, windowsVerbatimArguments: true })
    : spawn(bin, args, { cwd: workDir, windowsHide: true });
  const runId = Date.now().toString(36); runs.set(runId, child);
  if (stdinPrompt) child.stdin.write(prompt); child.stdin.end();
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
    // Codex (exec --json): itens concluídos trazem a resposta e as chamadas MCP
    else if (o.type === 'item.completed' || o.type === 'item.started') {
      const it = o.item || {};
      if (o.type === 'item.completed' && (it.type === 'agent_message' || it.item_type === 'assistant_message') && it.text) onEvent({ runId, type: 'text', text: it.text });
      if (o.type === 'item.started' && (it.type === 'mcp_tool_call' || it.item_type === 'mcp_tool_call')) onEvent({ runId, type: 'tool', name: String(it.tool || '') });
    }
    else if (o.type === 'error') onEvent({ runId, type: 'text', text: '⚠ ' + (o.message || '') });
  }
  return runId;
}
const cleanErr = (s) => s.split(/\r?\n/).filter((l) => l.trim() && !/^\s+at /.test(l)).slice(-6).join('\n');
function stop(runId) { const c = runs.get(runId); if (c) spawn('taskkill', ['/pid', String(c.pid), '/t', '/f'], { windowsHide: true }); }

module.exports = { status, openLogin, run, stop };
