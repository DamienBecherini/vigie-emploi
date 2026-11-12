import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// L'interface vit dans ui/ ; la compilation va dans dist/ui, servie par `postuler-juste serve`.
export default defineConfig({
  root: 'ui',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../dist/ui', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': process.env.POSTULER_JUSTE_API ?? 'http://127.0.0.1:4410' } },
});
