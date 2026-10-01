import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

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
  return [
    "default-src 'self'",
    `script-src 'self' ${inlineScriptHash()}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${new URL(apiBaseUrl).origin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, 'VITE_');
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
      port: 5173,
      // The API's CORS allow-list expects this exact origin, so never fall back to another port.
      strictPort: true,
      headers: BASE_HEADERS,
    },
    preview: {
      port: 4173,
      strictPort: true,
      headers: {
        ...BASE_HEADERS,
        'Content-Security-Policy': contentSecurityPolicy(
          env.VITE_API_BASE_URL || 'http://localhost:3000',
        ),
      },
    },
  };
});
