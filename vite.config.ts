import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'url';

export default defineConfig(async ({ mode }) => {
  // Optional React plugin: used if installed, skipped if not
  let reactPlugin: any = null;
  try {
    const mod = await import('@vitejs/plugin-react');
    reactPlugin = mod.default();
  } catch {
    // not using React or plugin not installed
  }

  // Relative base in production so assets are referenced as "./assets/..."
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