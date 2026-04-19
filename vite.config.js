import { defineConfig } from 'vite';

// Относительные пути в сборке — сайт открывается с GitHub Pages в подпапке /имя-репо/
export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    // 127.0.0.1 — надёжно открывается из Simple Browser / Preview в Cursor на том же Mac
    host: '127.0.0.1',
    open: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
    host: '127.0.0.1',
  },
});
