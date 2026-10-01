import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Absolute path of the repository-root `.env` file shared by all apps.
 * Resolved relative to this module, so it is correct from both `src/` and `dist/`.
 */
export const ROOT_ENV_FILE = fileURLToPath(new URL('../../../../.env', import.meta.url));

const port = z.coerce.number().int().min(1).max(65_535);

/** True for a bare browser origin such as `https://app.example.com` or `http://localhost:5173`. */
function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}

/** One trusted-proxy entry: an IP, a CIDR range, or an Express preset name. */
const TRUSTED_PROXY_ENTRY =
  /^(loopback|linklocal|uniquelocal|\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?|[0-9a-f:]+(\/\d{1,3})?)$/i;

/**
 * `API_TRUST_PROXY` → Express "trust proxy" value. `false` (default): the
 * client IP is the socket address and X-Forwarded-For is ignored, so it can't
 * be spoofed. A hop count (`1`) or a list of proxy addresses/ranges trusts
 * only those proxies. `true` (trust everyone) is refused: any client could
 * then choose its own IP and dodge the rate limits.
 */
const trustProxy = z
  .string()
  .default('false')
  .transform((value, context): false | number | string[] => {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === 'false') return false;
    if (/^\d+$/.test(trimmed)) {
      const hops = Number(trimmed);
      if (hops >= 1 && hops <= 10) return hops;
    } else {
      const entries = trimmed
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (entries.length > 0 && entries.every((entry) => TRUSTED_PROXY_ENTRY.test(entry))) {
        return entries;
      }
    }
    context.addIssue({
      code: 'custom',
      message:
        'Use false, a hop count (1-10), or a comma-separated list of proxy IPs/CIDR ranges (never "true").',
    });
    return z.NEVER;
  });

/** Environment variables required by the API. Documented in `.env.example`. */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    API_PORT: port.default(3000),
    API_CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      // Credentialed (cookie) requests require explicit origins.
      .refine((origins) => !origins.includes('*'), {
        message: 'Wildcard origins are not allowed: the API uses credentialed (cookie) requests.',
      })
      // Exact origins only ("https://app.example.com": no path, no trailing slash), so the
      // CORS and CSRF checks compare like with like.
      .refine((origins) => origins.length > 0 && origins.every(isOrigin), {
        message: 'List exact origins such as https://app.example.com (scheme and host, no path).',
      }),
    /** Express "trust proxy" (client IP for rate limiting); see docs/security.md. */
    API_TRUST_PROXY: trustProxy,

    DB_HOST: z.string().min(1),
    DB_PORT: port.default(5432),
    DB_NAME: z.string().min(1),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().default(''),

    /** Absolute session lifetime in days. */
    AUTH_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    AUTH_COOKIE_NAME: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase letters, digits, and underscores.')
      .default('app_session'),
    /** Send the session cookie over HTTPS only. Must be true in production. */
    AUTH_COOKIE_SECURE: z.stringbool().default(false),

    /** Lifetime of organization invitation links, in days. */
    INVITATION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    /** Public URL of the web app; used to build invitation links. */
    WEB_APP_URL: z
      .url({ protocol: /^https?$/ })
      .default('http://localhost:5173')
      .transform((url) => url.replace(/\/+$/, '')),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.AUTH_COOKIE_SECURE, {
    message: 'AUTH_COOKIE_SECURE must be true when NODE_ENV=production.',
    path: ['AUTH_COOKIE_SECURE'],
  })
  .refine(
    (env) =>
      env.NODE_ENV !== 'production' ||
      env.API_CORS_ORIGINS.every((origin) => origin.startsWith('https://')),
    {
      message: 'In production every API_CORS_ORIGINS entry must be an https:// origin.',
      path: ['API_CORS_ORIGINS'],
    },
  )
  .refine((env) => env.NODE_ENV !== 'production' || env.DB_PASSWORD.length > 0, {
    message: 'DB_PASSWORD is required when NODE_ENV=production.',
    path: ['DB_PASSWORD'],
  });

export type Env = z.infer<typeof envSchema>;

/** Validation hook for `ConfigModule.forRoot`. Fails fast with a readable message. */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration. Compare your .env with .env.example.\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
