import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/jobs':  { target: 'http://localhost:5000', changeOrigin: true },
      '/auth':  { target: 'http://localhost:5000', changeOrigin: true },
      '/admin': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        // Disable response buffering so SSE events pass through immediately
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache';
          });
        },
      },
    },
  },
});
