import { defineConfig } from 'vite';
import path from 'node:path';

const r = (p: string) => path.resolve(process.cwd(), p);

export default defineConfig({
  base: '/dwdw/',
  resolve: {
    // Use regex so "@auth/pkce" maps into "src/auth/pkce"
    alias: [
      { find: /^@auth(\/|$)/, replacement: r('src/auth') + '$1' },
      { find: /^@spotify(\/|$)/, replacement: r('src/spotify') + '$1' },
      { find: /^@audio(\/|$)/, replacement: r('src/audio') + '$1' },
      { find: /^@visuals(\/|$)/, replacement: r('src/visuals') + '$1' },
      { find: /^@controllers(\/|$)/, replacement: r('src/controllers') + '$1' },
      { find: /^@ui(\/|$)/, replacement: r('src/ui') + '$1' },
      { find: /^@utils(\/|$)/, replacement: r('src/utils') + '$1' }
    ]
  },
  server: { host: '127.0.0.1', port: 5173 },
  build: { target: 'es2020' }
});