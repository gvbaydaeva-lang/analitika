import { defineConfig } from 'vite';

// Публичный URL проекта: https://gvbaydaeva-lang.github.io/analitika/
// Абсолютный base нужен, чтобы скрипты грузились и при /analitika и при /analitika/
// (относительные ./assets ломаются без завершающего слэша в URL).
const PAGES_BASE = '/analitika/';

export default defineConfig(({ command }) => ({
  root: '.',
  base: command === 'build' ? PAGES_BASE : '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
    open: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
    host: '127.0.0.1',
  },
}));
