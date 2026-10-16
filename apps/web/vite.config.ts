import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage } from 'node:http';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';

const envDir = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Security headers for the web app (docs/security.md). The dev server gets
 * the ones that don't interfere with hot reloading; `vite preview` (the
 * production build) also gets a strict Content-Security-Policy. A static
 * host in production must send the same headers.
 */
const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

/** SHA-256 of the one inline script in index.html (the appearance startup cache). */
function inlineScriptHash(): string {
  const html = readFileSync(fileURLToPath(new URL('./index.html', import.meta.url)), 'utf8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (script === undefined) throw new Error('index.html has no inline startup script.');
  return `'sha256-${createHash('sha256').update(script).digest('base64')}'`;
}

/**
 * Production CSP: scripts and styles only from this origin (plus the hashed
 * inline startup script), API calls only to VITE_API_BASE_URL, no plugins,
 * no framing. Inline `style` attributes are allowed (React sets them; the
 * theme engine writes CSS variables), but no inline <style> or <script>.
 */
function contentSecurityPolicy(apiBaseUrl: string): string {
  // A relative base URL ("/api", proxied) is this origin: 'self' already covers it.
  const apiOrigin = apiBaseUrl.startsWith('/') ? '' : ` ${new URL(apiBaseUrl).origin}`;
  return [
    "default-src 'self'",
    `script-src 'self' ${inlineScriptHash()}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${apiOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const WEB_PORT = 5173;
/** The web origin the API allows (API_CORS_ORIGINS in .env.example). */
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;

/** True when the browser's Origin is the host this server was reached at (a same-origin request). */
function isSameOrigin(request: IncomingMessage): boolean {
  const { origin, host } = request.headers;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Local demo through a tunnel (docs/local-development.md#sharing-a-local-demo):
 * with VITE_API_BASE_URL=/api the browser calls this server, which forwards
 * `/api/*` to the API without the prefix (the API's routes are unchanged).
 * A same-origin request reached through a tunnel carries the tunnel's random
 * Origin, which the API's CSRF/CORS allow-list doesn't know; for same-origin
 * requests ONLY, the Origin is replaced with the dev origin the API allows.
 * Cross-site requests keep their Origin, so the API still refuses them.
 */
function apiProxy(target: string): Record<string, ProxyOptions> {
  return {
    '^/api(/|$)': {
      target,
      rewrite: (path) => path.replace(/^\/api(?=\/|$)/, '') || '/',
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyRequest, request) => {
          if (isSameOrigin(request)) proxyRequest.setHeader('origin', WEB_ORIGIN);
        });
      },
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, ['VITE_', 'API_PORT']);
  const proxy = apiProxy(`http://localhost:${env.API_PORT || 3000}`);
  return {
    plugins: [react(), tailwindcss()],
    // Read VITE_* variables from the shared repository-root .env file.
    envDir,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: WEB_PORT,
      // The API's CORS allow-list expects this exact origin, so never fall back to another port.
      strictPort: true,
      headers: BASE_HEADERS,
      proxy,
      // Cloudflare Quick Tunnel hosts (https://<random>.trycloudflare.com); others stay blocked.
      allowedHosts: ['.trycloudflare.com'],
    },
    preview: {
      port: 4173,
      strictPort: true,
      proxy,
      headers: {
        ...BASE_HEADERS,
        'Content-Security-Policy': contentSecurityPolicy(
          env.VITE_API_BASE_URL || 'http://localhost:3000',
        ),
      },
    },
  };
});
