import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  // IMPORTANT for GitHub Pages under /<repo-name>/
  base: '/dwdw/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});