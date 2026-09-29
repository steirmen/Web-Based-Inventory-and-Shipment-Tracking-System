import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Absolute path of the repository-root `.env` file shared by all apps.
 * Resolved relative to this module, so it is correct from both `src/` and `dist/`.
 */
export const ROOT_ENV_FILE = fileURLToPath(new URL('../../../../.env', import.meta.url));

const port = z.coerce.number().int().min(1).max(65_535);

/** Environment variables required by the API. Documented in `.env.example`. */
export const envSchema = z.object({
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
    ),

  DB_HOST: z.string().min(1),
  DB_PORT: port.default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().default(''),
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
