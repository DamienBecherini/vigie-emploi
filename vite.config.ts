import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The interface lives in ui/; the build goes into dist/ui, served by `vigie-emploi serve`.
export default defineConfig({
  root: 'ui',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../dist/ui', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': process.env.VIGIE_EMPLOI_API ?? 'http://127.0.0.1:4410' } },
});
