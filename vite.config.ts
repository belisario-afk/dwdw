import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  base: '/dwdw/',
  resolve: {
    alias: {
      '@auth': path.resolve(__dirname, 'src/auth'),
      '@spotify': path.resolve(__dirname, 'src/spotify'),
      '@audio': path.resolve(__dirname, 'src/audio'),
      '@visuals': path.resolve(__dirname, 'src/visuals'),
      '@controllers': path.resolve(__dirname, 'src/controllers'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@utils': path.resolve(__dirname, 'src/utils'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    target: 'es2020',
  },
});