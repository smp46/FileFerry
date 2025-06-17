import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const isStaging = mode === 'staging';

  return {
    build: {
      target: 'es2022',
    },
    publicDir: 'public',
    optimizeDeps: {
      esbuildOptions: { target: 'es2022', supported: { bigint: true } },
    },
    server: {
      open: true,
    },
    plugins: [tailwindcss(), basicSsl()],

    base: isStaging ? '/staging/' : '/',
    resolve: {
      alias: {
        '@': '/src',
        '@core': '/src/core',
        '@services': '/src/services',
        '@ui': '/src/ui',
        '@utils': '/src/utils',
      },
    },
  };
});
