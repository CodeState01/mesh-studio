#!/usr/bin/env node
// Mesh — servidor MCP (stdio).
// Qualquer cliente MCP (Claude Desktop, Claude Code, Cursor, etc.) pode controlar a cena.
// Ele conecta na ponte WebSocket do app (127.0.0.1:47821) — o Mesh precisa estar aberto.
//
// Config de exemplo (Claude Desktop / Claude Code):
//   { "mcpServers": { "mesh": { "command": "node", "args": ["<caminho>/mcp/server.mjs"] } } }
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import WebSocket from 'ws';
import { TOOLS } from './toolspec.mjs';

const PORT = Number(process.env.MESH_MCP_PORT || 47821);
let ws = null;
let seq = 0;
const pending = new Map();

function connect() {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) return resolve(ws);
    const sock = new WebSocket(`ws://127.0.0.1:${PORT}`);
    sock.once('open', () => { ws = sock; resolve(sock); });
    sock.once('error', (e) => reject(new Error(`Mesh não está aberto (porta ${PORT}): ${e.message}`)));
    sock.on('message', (buf) => {
      const msg = JSON.parse(String(buf));
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); msg.ok ? p.resolve(msg.result) : p.reject(new Error(msg.error)); }
    });
    sock.on('close', () => { ws = null; });
  });
}

async function call(tool, args) {
  const sock = await connect();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    sock.send(JSON.stringify({ id, tool, args }));
  });
}

const server = new Server({ name: 'mesh-studio', version: '0.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    const result = await call(name, args || {});
    if (result && result.__image) {
      return { content: [{ type: 'image', data: result.__image, mimeType: 'image/png' }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: String(e.message || e) }] };
  }
});

server.connect(new StdioServerTransport()).catch((e) => { console.error(e); process.exit(1); });
