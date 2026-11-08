// Empacota o servidor MCP num único arquivo (sem node_modules) para ir FORA do app.asar.
// O Mesh instalado roda esse arquivo com o Node embutido no Electron (ELECTRON_RUN_AS_NODE).
import { build } from 'esbuild';
await build({
  entryPoints: ['mcp/server.mjs'], outfile: 'mcp-dist/server.cjs',
  bundle: true, platform: 'node', format: 'cjs', target: 'node20', minify: true, legalComments: 'none',
  logLevel: 'info',
});
