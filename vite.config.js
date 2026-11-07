import { defineConfig } from 'vite';

export default defineConfig({
  base: './',                 // caminhos relativos → funciona via file:// no Electron
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', target: 'es2022', chunkSizeWarningLimit: 3000 },
});
