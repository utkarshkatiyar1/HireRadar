import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = 'http://localhost:5000';

// /profile/candidate (and /jobs/:id, /applications/:id, etc) are ambiguous:
// the SAME path is both a real API endpoint (XHR from authFetch) and a
// client-side route the SPA must render on direct navigation/hard-refresh.
// Vite's proxy matches on path alone, so a plain prefix rule would swallow
// the browser's document request for that path too, serving Express's JSON
// instead of index.html. Distinguish by the Accept header instead — a real
// page navigation asks for text/html; authFetch's fetch() calls don't.
const bypassDocumentNavigation = (req) => {
  const accept = req.headers.accept || '';
  return accept.includes('text/html') ? req.url : null;
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/jobs':         { target: API_TARGET, changeOrigin: true, bypass: bypassDocumentNavigation },
      '/auth':         { target: API_TARGET, changeOrigin: true, bypass: bypassDocumentNavigation },
      '/profile':      { target: API_TARGET, changeOrigin: true, bypass: bypassDocumentNavigation },
      '/applications': { target: API_TARGET, changeOrigin: true, bypass: bypassDocumentNavigation },
      '/resumes':      { target: API_TARGET, changeOrigin: true, bypass: bypassDocumentNavigation },
      '/admin': {
        target: API_TARGET,
        changeOrigin: true,
        bypass: bypassDocumentNavigation,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache';
          });
        },
      },
    },
  },
});
