import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND = 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Binds to all network interfaces (not just localhost) so the dev
    // server is reachable from other devices on the same LAN, or through
    // a tunnel like ngrok pointed at this port.
    host: true,
    // Vite rejects requests whose Host header it doesn't recognize (DNS
    // rebinding protection) -- a tunnel like ngrok forwards the request
    // with its own public hostname, which fails that check by default.
    // Safe to open up broadly here since this is a personal dev tunnel,
    // not a public production deployment.
    allowedHosts: true,
    // Proxies API/socket traffic to the local backend so the browser only
    // ever talks to ONE origin (this dev server's own). Combined with
    // config.ts's API_BASE_URL defaulting to '' (same-origin), this means
    // the app works unmodified whether opened via localhost, a LAN IP, or
    // a tunnel URL -- and sidesteps CORS entirely, since the backend only
    // ever sees requests coming from this Node process, not the browser.
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/socket.io': { target: BACKEND, changeOrigin: true, ws: true },
      '/presence-socket': { target: BACKEND, changeOrigin: true, ws: true },
      '/chat-socket': { target: BACKEND, changeOrigin: true, ws: true },
    },
  },
});
