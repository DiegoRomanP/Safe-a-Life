import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'SAL_');
  const port = env.SAL_BACKEND_PORT ?? '3000';
  if (!/^[0-9]{1,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
    throw new Error('SAL_BACKEND_PORT debe ser un puerto local entre 1024 y 65535.');
  }
  // Solo cambia el puerto local; las cookies y CSRF conservan el mismo origen.
  const backend = 'http://127.0.0.1:' + port;
  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: '127.0.0.1',
      port: 5174,
      strictPort: true,
      proxy: {
        '/api': { target: backend },
        '/health': { target: backend },
      },
    },
  };
});
