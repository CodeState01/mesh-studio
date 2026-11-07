const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('argila', {
  isDesktop: true,
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (s) => ipcRenderer.invoke('settings:set', s),
  },
  ai: { fetch: (req) => ipcRenderer.invoke('ai:fetch', req) },
  file: {
    save: (opts) => ipcRenderer.invoke('file:save', opts),
    open: (opts) => ipcRenderer.invoke('file:open', opts),
    pickDir: (opts) => ipcRenderer.invoke('dir:pick', opts),
    writeTo: (opts) => ipcRenderer.invoke('file:writeTo', opts),
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  },
  app: { info: () => ipcRenderer.invoke('app:info') },
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    on: (cb) => ipcRenderer.on('update:status', (_e, d) => cb(d)),
  },
  mcp: {
    onCall: (cb) => ipcRenderer.on('mcp:call', (_e, d) => cb(d)),
    onStatus: (cb) => ipcRenderer.on('mcp:status', (_e, d) => cb(d)),
    reply: (d) => ipcRenderer.send('mcp:result', d),
  },
});
