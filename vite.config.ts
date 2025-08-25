import { defineConfig } from 'vite';
import path from 'node:path';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  base: '/dwdw/',
  plugins: [
    // Reads "paths" from tsconfig.json for Vite/Rollup resolution
    tsconfigPaths()
  ],
  resolve: {
    // Explicit aliases as a fallback so builds work even if tsconfig changes
    alias: {
      '@auth': path.resolve(process.cwd(), 'src/auth'),
      '@spotify': path.resolve(process.cwd(), 'src/spotify'),
      '@audio': path.resolve(process.cwd(), 'src/audio'),
      '@visuals': path.resolve(process.cwd(), 'src/visuals'),
      '@controllers': path.resolve(process.cwd(), 'src/controllers'),
      '@ui': path.resolve(process.cwd(), 'src/ui'),
      '@utils': path.resolve(process.cwd(), 'src/utils')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  },
  build: {
    target: 'es2020'
  }
});