import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'url';

export default defineConfig(async ({ mode }) => {
  let reactPlugin: any = null;
  try {
    const mod = await import('@vitejs/plugin-react');
    reactPlugin = mod.default();
  } catch {}

  // Use relative base in production so assets are ./assets/... (works on streamqueue.live and /dwdw/)
  const base = process.env.BASE_URL ?? (mode === 'production' ? './' : '/');

  return {
    base,
    plugins: reactPlugin ? [reactPlugin] : [],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@utils': fileURLToPath(new URL('./src/utils', import.meta.url)),
        '@spotify': fileURLToPath(new URL('./src/spotify', import.meta.url)),
        '@controllers': fileURLToPath(new URL('./src/controllers', import.meta.url)),
        '@auth': fileURLToPath(new URL('./src/auth', import.meta.url)),
        '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      },
    },
  };
});