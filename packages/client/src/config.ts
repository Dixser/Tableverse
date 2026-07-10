/**
 * Defaults to '' (same origin the page was loaded from) rather than a
 * hardcoded host. Combined with vite.config.ts's dev-server proxy
 * (/api, /socket.io, /presence-socket -> the local backend), this means
 * the exact same build works unmodified whether the page is opened via
 * localhost, a LAN IP, or a tunnel (e.g. ngrok) -- no env var to update
 * per access method. Set VITE_API_BASE_URL explicitly only for a
 * production deployment where the API is served from a different origin
 * than the client.
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
