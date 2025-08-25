import { defineConfig } from 'vite';
import path from 'node:path';

const r = (p: string) => path.resolve(process.cwd(), p);

export default defineConfig({
  base: '/dwdw/',
  resolve: {
    alias: [
      // Direct file alias to be absolutely sure this resolves
      { find: '@auth/pkce', replacement: r('src/auth/pkce.ts') },
      // Folder aliases
      { find: '@auth', replacement: r('src/auth') },
      { find: '@spotify', replacement: r('src/spotify') },
      { find: '@audio', replacement: r('src/audio') },
      { find: '@visuals', replacement: r('src/visuals') },
      { find: '@controllers', replacement: r('src/controllers') },
      { find: '@ui', replacement: r('src/ui') },
      { find: '@utils', replacement: r('src/utils') }
    ]
  },
  server: { host: '127.0.0.1', port: 5173 },
  build: { target: 'es2020' }
});