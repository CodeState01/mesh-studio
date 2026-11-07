// Auto-update via electron-updater (GitHub Releases por padrão — veja "build.publish" no package.json).
// Fluxo: checa ao iniciar e a cada 4h → baixa em segundo plano → UI oferece "Reiniciar e atualizar".
function setupUpdater({ getWindow, ipcMain, enabled }) {
  const send = (status, data = {}) => getWindow()?.webContents.send('update:status', { status, ...data });

  ipcMain.handle('update:check', async () => {
    if (!enabled) { send('dev', { message: 'Atualizações desativadas em modo de desenvolvimento' }); return null; }
    const { autoUpdater } = require('electron-updater');
    return autoUpdater.checkForUpdates().catch((e) => send('error', { message: e.message }));
  });
  ipcMain.handle('update:install', () => {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.quitAndInstall();
  });

  if (!enabled) return;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.on('checking-for-update', () => send('checking'));
  autoUpdater.on('update-available', (i) => send('available', { version: i.version }));
  autoUpdater.on('update-not-available', () => send('latest'));
  autoUpdater.on('download-progress', (p) => send('downloading', { percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => send('ready', { version: i.version }));
  autoUpdater.on('error', (e) => send('error', { message: e.message }));

  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
}
module.exports = { setupUpdater };
