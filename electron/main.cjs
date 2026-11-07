// Orbe Studio — processo principal do Electron
// Responsável por: janela, ponte MCP (WebSocket), proxy de IA (sem CORS),
// armazenamento seguro de chaves, diálogos de arquivo e auto-update.
const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { startBridge } = require('./bridge.cjs');
const { setupUpdater } = require('./updater.cjs');

const isDev = !!process.env.ORBE_DEV;
let win;

// ---------- Armazenamento de configurações (chaves criptografadas) ----------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function readSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    if (raw.keys && safeStorage.isEncryptionAvailable()) {
      for (const [k, v] of Object.entries(raw.keys)) {
        try { raw.keys[k] = safeStorage.decryptString(Buffer.from(v, 'base64')); } catch { raw.keys[k] = ''; }
      }
    }
    return raw;
  } catch { return { keys: {}, prefs: {} }; }
}
function writeSettings(s) {
  const out = { ...s, keys: {} };
  for (const [k, v] of Object.entries(s.keys || {})) {
    if (!v) continue;
    out.keys[k] = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(v).toString('base64') : v;
  }
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(out, null, 2));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 960, minWidth: 1100, minHeight: 680,
    backgroundColor: '#0e0f11',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0e0f11', symbolColor: '#b9bcc4', height: 38 },
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // Smoke test automatizado (CI / verificação): ORBE_SMOKE=caminho.png
  if (process.env.ORBE_SMOKE) {
    win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[renderer]', msg); });
    win.webContents.on('did-finish-load', async () => {
      const js = process.env.ORBE_SMOKE_JS || '';
      if (js) await new Promise((r) => setTimeout(r, 1200)).then(() => win.webContents.executeJavaScript(js).catch((e) => console.log('[smoke js]', e.message)));
      setTimeout(async () => {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(process.env.ORBE_SMOKE, img.toPNG());
        console.log('[smoke] ok', process.env.ORBE_SMOKE); app.exit(0);
      }, Number(process.env.ORBE_SMOKE_WAIT || 4000));
    });
  }
  if (isDev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

// ---------- IPC ----------
ipcMain.handle('settings:get', () => readSettings());
ipcMain.handle('settings:set', (_e, s) => { writeSettings(s); return true; });

// Proxy HTTP para provedores de IA — evita CORS e mantém chaves fora do DOM.
ipcMain.handle('ai:fetch', async (_e, { url, method = 'POST', headers = {}, body }) => {
  try {
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, json, text: json ? undefined : text };
  } catch (err) {
    return { ok: false, status: 0, text: String(err?.message || err) };
  }
});

ipcMain.handle('file:save', async (_e, { name, data, filters, binary }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: name, filters });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, binary ? Buffer.from(data) : data);
  return r.filePath;
});
ipcMain.handle('file:open', async (_e, { filters }) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  return { path: p, name: path.basename(p), data: fs.readFileSync(p) };
});

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  mcpPort: bridge?.port,
  mcpServerPath: path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'), 'mcp', 'server.mjs'),
}));

let bridge;
app.whenReady().then(() => {
  createWindow();
  // Ponte MCP: o servidor MCP (stdio) conecta aqui e as chamadas de ferramenta
  // são repassadas ao renderer, que executa na cena e devolve o resultado.
  bridge = startBridge({ getWindow: () => win, ipcMain });
  setupUpdater({ getWindow: () => win, ipcMain, enabled: app.isPackaged });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
