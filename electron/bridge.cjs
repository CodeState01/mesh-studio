// Ponte WebSocket local entre servidores MCP externos e a cena do Argila.
// Protocolo: cliente envia {id, tool, args}; recebe {id, ok, result|error}.
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.ARGILA_MCP_PORT || 47821);

function startBridge({ getWindow, ipcMain }) {
  const pending = new Map();
  let seq = 0;

  ipcMain.on('mcp:result', (_e, { rid, ok, result, error }) => {
    const p = pending.get(rid);
    if (!p) return;
    pending.delete(rid);
    p.ws.send(JSON.stringify({ id: p.id, ok, result, error }));
  });

  const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });
  wss.on('connection', (ws) => {
    getWindow()?.webContents.send('mcp:status', { connected: wss.clients.size });
    ws.on('message', (buf) => {
      let msg; try { msg = JSON.parse(String(buf)); } catch { return; }
      const rid = ++seq;
      pending.set(rid, { ws, id: msg.id });
      getWindow()?.webContents.send('mcp:call', { rid, tool: msg.tool, args: msg.args || {} });
      setTimeout(() => {
        if (pending.has(rid)) {
          pending.delete(rid);
          ws.send(JSON.stringify({ id: msg.id, ok: false, error: 'timeout' }));
        }
      }, 30000);
    });
    ws.on('close', () => getWindow()?.webContents.send('mcp:status', { connected: wss.clients.size }));
  });
  wss.on('error', (e) => console.error('[argila bridge]', e.message));
  return { port: PORT, wss };
}

module.exports = { startBridge, PORT };
