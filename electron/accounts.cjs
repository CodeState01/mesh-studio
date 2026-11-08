// Contas para TODOS os provedores — cada um pelo caminho mais direto que ele oferece oficialmente:
//   • OAuth (OpenRouter): login no navegador com PKCE → a chave volta sozinha para o Mesh.
//   • GitHub CLI: se você já fez `gh auth login`, o token da sua conta serve para o GitHub Models.
//   • Console: abre a página oficial de chaves numa janela com sessão salva; você entra na sua conta,
//     cria/copia a chave e, ao fechar, o Mesh detecta a chave copiada (só se ela mudou desde a abertura).
//   • Local: varre as portas padrão dos servidores locais e mostra quais estão rodando.
// Nada de cookies roubados nem APIs internas: só fluxos públicos e ações feitas pelo próprio usuário.
const { BrowserWindow, clipboard, shell } = require('electron');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ---------- OpenRouter: OAuth PKCE (https://openrouter.ai/docs/use-cases/oauth-pkce) ----------
function openrouterLogin() {
  return new Promise((resolve, reject) => {
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname !== '/callback') { res.writeHead(404).end(); return; }
      const code = url.searchParams.get('code');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<body style="font:16px system-ui;background:#0e0f11;color:#e8e8e3;display:grid;place-items:center;height:100vh"><div>✔ Conta conectada ao Mesh. Pode fechar esta aba.</div></body>');
      clearTimeout(timer); server.close();
      if (!code) return reject(new Error('Login cancelado'));
      try {
        const r = await fetch('https://openrouter.ai/api/v1/auth/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }) });
        const j = await r.json(); if (!r.ok || !j.key) throw new Error(j.error?.message || 'OpenRouter não devolveu a chave');
        resolve({ key: j.key });
      } catch (e) { reject(e); }
    });
    const timer = setTimeout(() => { server.close(); reject(new Error('Tempo esgotado (5 min)')); }, 5 * 60_000);
    server.listen(0, '127.0.0.1', () => {
      const cb = `http://localhost:${server.address().port}/callback`;
      shell.openExternal(`https://openrouter.ai/auth?callback_url=${encodeURIComponent(cb)}&code_challenge=${challenge}&code_challenge_method=S256`);
    });
  });
}

// ---------- GitHub Models: reaproveita o login do GitHub CLI ----------
function githubToken() {
  return new Promise((resolve, reject) => {
    execFile('gh', ['auth', 'token'], { windowsHide: true, timeout: 8000 }, (err, out) => {
      const t = String(out || '').trim();
      if (err || !t) reject(new Error('GitHub CLI sem login. Rode no PowerShell: gh auth login')); else resolve({ key: t });
    });
  });
}

// ---------- Console oficial numa janela com sessão persistente ----------
const looksLikeKey = (s) => /^[A-Za-z0-9_\-.:]{20,300}$/.test(s);
function openKeyPage(url, parent) {
  return new Promise((resolve) => {
    if (!/^https:\/\//.test(url)) return resolve({});
    const before = clipboard.readText().trim();
    const w = new BrowserWindow({
      width: 1100, height: 800, parent, title: 'Mesh — entre na sua conta e copie a chave', autoHideMenuBar: true, backgroundColor: '#ffffff',
      webPreferences: { partition: 'persist:mesh-accounts', contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    w.loadURL(url);
    // Pop-ups de login (Google, GitHub…) ficam na mesma sessão; o resto abre no navegador.
    w.webContents.setWindowOpenHandler(({ url: u }) => (/^https:\/\//.test(u) ? { action: 'allow', overrideBrowserWindowOptions: { parent: w, autoHideMenuBar: true, webPreferences: { partition: 'persist:mesh-accounts', sandbox: true } } } : { action: 'deny' }));
    w.on('closed', () => {
      const now = clipboard.readText().trim();
      resolve(now && now !== before && looksLikeKey(now) ? { key: now } : {});
    });
  });
}

// ---------- Servidores locais: quem está respondendo agora? ----------
async function detectLocal(list) {
  const probe = async ({ id, baseURL }) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 900);
    try {
      const r = await fetch(baseURL.replace(/\/$/, '') + '/models', { signal: ctl.signal });
      const j = await r.json().catch(() => ({}));
      return [id, { ok: r.ok, models: (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean).slice(0, 50) }];
    } catch { return [id, { ok: false }]; } finally { clearTimeout(t); }
  };
  return Object.fromEntries(await Promise.all(list.filter((p) => /^http:\/\/(localhost|127\.0\.0\.1)/.test(p.baseURL)).map(probe)));
}

function registerAccounts(ipcMain, getWindow) {
  ipcMain.handle('accounts:oauth', (_e, id) => { if (id === 'openrouter') return openrouterLogin(); if (id === 'github') return githubToken(); throw new Error('Sem OAuth para ' + id); });
  ipcMain.handle('accounts:keyPage', (_e, url) => openKeyPage(url, getWindow()));
  ipcMain.handle('accounts:detectLocal', (_e, list) => detectLocal(list));
  ipcMain.handle('accounts:clearSession', async () => { const { session } = require('electron'); await session.fromPartition('persist:mesh-accounts').clearStorageData(); return true; });
}

module.exports = { registerAccounts };
