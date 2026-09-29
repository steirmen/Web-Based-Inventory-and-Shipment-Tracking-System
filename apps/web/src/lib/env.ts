/**
 * Typed access to build-time environment variables (`VITE_*`, read from the
 * repository-root `.env`). Read through these helpers — never `import.meta.env`
 * directly in components.
 */

export class ConfigurationError extends Error {
  override name = 'ConfigurationError';
}

/** Base URL of the backend API, without a trailing slash. */
export function getApiBaseUrl(): string {
  const value = import.meta.env.VITE_API_BASE_URL?.trim();

  if (!value) {
    throw new ConfigurationError(
      'VITE_API_BASE_URL is not set. Copy .env.example to .env in the repository root and restart the dev server.',
    );
  }

  return value.replace(/\/+$/, '');
}
