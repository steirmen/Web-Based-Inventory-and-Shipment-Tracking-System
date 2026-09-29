import { getApiBaseUrl } from '@/lib/env';

/**
 * The single place where the web app talks HTTP to the backend.
 *
 *   component → hook (TanStack Query) → endpoint function (src/api/*.ts) → apiRequest → API
 *
 * Components never call `fetch` directly.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

/** Error thrown for any failed API call. `status` is `null` when no HTTP response was received. */
export class ApiError extends Error {
  override name = 'ApiError';
  readonly status: number | null;
  readonly url: string;

  constructor(message: string, options: { status: number | null; url: string; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.status = options.status;
    this.url = options.url;
  }

  /** True when the API could not be reached at all (offline, CORS, DNS, timeout). */
  get isNetworkError(): boolean {
    return this.status === null;
  }
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Serialized as JSON. */
  body?: unknown;
  headers?: HeadersInit;
  /** Cancellation signal, e.g. the one TanStack Query passes to `queryFn`. */
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function apiRequest<T>(
  path: string,
  { method = 'GET', body, headers, signal, timeoutMs = DEFAULT_TIMEOUT_MS }: ApiRequestOptions = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const requestHeaders = new Headers(headers);
  requestHeaders.set('Accept', 'application/json');
  if (body !== undefined) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
    });
  } catch (error) {
    // Cancelled by the caller (e.g. component unmounted): propagate unchanged.
    if (signal?.aborted) {
      throw error;
    }
    const reason = timeoutSignal.aborted
      ? `did not respond within ${timeoutMs / 1000}s`
      : 'could not be reached';
    throw new ApiError(`The API at ${baseUrl} ${reason}.`, { status: null, url, cause: error });
  }

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), { status: response.status, url });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/** Extracts NestJS-style `{ message }` error bodies, falling back to the status line. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'message' in body) {
      const { message } = body;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join(', ');
    }
  } catch {
    // Body is not JSON — use the fallback below.
  }
  return `Request failed with status ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.`;
}
