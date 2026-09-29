import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Absolute path of the repository-root `.env` file shared by all apps.
 * Resolved relative to this module, so it is correct from both `src/` and `dist/`.
 */
export const ROOT_ENV_FILE = fileURLToPath(new URL('../../../../.env', import.meta.url));

const port = z.coerce.number().int().min(1).max(65_535);

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
      }),

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
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.AUTH_COOKIE_SECURE, {
    message: 'AUTH_COOKIE_SECURE must be true when NODE_ENV=production.',
    path: ['AUTH_COOKIE_SECURE'],
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
