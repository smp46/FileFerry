import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const isStaging = mode === 'staging';

  return {
    build: {
      target: 'es2022',
    },
    optimizeDeps: {
      esbuildOptions: { target: 'es2022', supported: { bigint: true } },
    },
    server: {
      open: true,
    },
    plugins: [tailwindcss()],
    define: {
      global: 'globalThis',
    },

    base: isStaging ? '/staging/' : '/',
  };
});
