// Gera build/icon.png (512px) a partir do logo SVG. Uso: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'public', 'favicon.svg'), 'utf8')
    .replace('<svg ', '<svg width="400" height="400" ');
  const html = `<html><body style="margin:0;width:512px;height:512px;display:grid;place-items:center;background:transparent">
    <div style="width:512px;height:512px;border-radius:112px;background:#101113;display:grid;place-items:center">${svg}</div></body></html>`;
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, useContentSize: true });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), img.resize({ width: 512, height: 512 }).toPNG());
  console.log('icon ok'); app.quit();
});
