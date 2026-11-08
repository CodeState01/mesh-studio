// Autoteste do servidor MCP: age como um cliente MCP (igual ao Claude Desktop),
// lista as ferramentas e cria objetos na cena do Mesh aberto.
// Uso: com o Mesh aberto → node scripts/mcp-selftest.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const server = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'mcp', 'server.mjs');
const client = new Client({ name: 'mesh-selftest', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [server] }));

const { tools } = await client.listTools();
console.log(`ferramentas: ${tools.length} →`, tools.map((t) => t.name).join(', '));

const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  const c = r.content[0];
  console.log(`${r.isError ? '✗' : '✓'} ${name}`, c.type === 'text' ? c.text.slice(0, 120).replace(/\s+/g, ' ') : `[${c.type} ${c.data.length} bytes]`);
};

// Chamadas em paralelo → vários cursores de IA ao mesmo tempo no app.
await Promise.all([
  call('add_text', { text: 'MCP', name: 'MCP', position: [0, 2.6, 0], color: '#3dd6ff', emissive: 1 }),
  call('add_primitive', { type: 'torus', name: 'Anel MCP', position: [-2.5, 1, 1.5], color: '#ff6a3d' }),
  call('add_vfx', { type: 'sparks', name: 'Faíscas MCP', position: [2.5, 0.2, 1.5] }),
]);
await call('motion_preset', { target: 'MCP', preset: 'float', duration: 2 });
await call('scene_info', {});
await call('screenshot', { width: 640, height: 360 });
await client.close();
