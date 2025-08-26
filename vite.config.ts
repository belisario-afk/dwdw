import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'url';

export default defineConfig(async () => {
  // Optional React plugin: will be used if installed, otherwise skipped
  let reactPlugin: any = null;
  try {
    const mod = await import('@vitejs/plugin-react');
    reactPlugin = mod.default();
  } catch {
    // plugin not installed; proceed without it
  }

  return {
    base: '/',
    plugins: reactPlugin ? [reactPlugin] : [],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@utils': fileURLToPath(new URL('./src/utils', import.meta.url)),
        '@spotify': fileURLToPath(new URL('./src/spotify', import.meta.url)),
        '@controllers': fileURLToPath(new URL('./src/controllers', import.meta.url)),
        '@auth': fileURLToPath(new URL('./src/auth', import.meta.url)),
        // Add this so "@ui/ui" resolves to "src/ui/ui"
        '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      },
    },
  };
});