import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Backend real en desarrollo (backend/.env, PORT=3000). El proxy mantiene un
// solo origen para cookies y CSRF (ADR-004); para mutaciones, ALLOWED_ORIGINS
// del backend debe incluir http://127.0.0.1:5174.
const backend = 'http://127.0.0.1:3000';

export default defineConfig({
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
});
