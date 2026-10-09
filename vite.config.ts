import { defineConfig } from 'vite';

// Порт берётся из PORT (его задаёт превью Claude), иначе 5174.
const port = Number(process.env.PORT) || 5174;

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  server: { host: true, port },
  preview: { port },
});
