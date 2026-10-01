import { API_ERROR_CODES, type ApiErrorCode, type ApiFieldError } from '@app/shared';
import { getApiBaseUrl } from '@/lib/env';

/**
 * The single place where the web app talks HTTP to the backend.
 *
 *   component → hook (TanStack Query) → endpoint function (src/api/*.ts) → apiRequest → API
 *
 * Components never call `fetch` directly. Authentication uses an HttpOnly
 * session cookie that the browser attaches automatically (`credentials: 'include'`);
 * no token is ever visible to, or stored by, JavaScript.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

/** Error thrown for any failed API call. `status` is `null` when no HTTP response was received. */
export class ApiError extends Error {
  override name = 'ApiError';
  readonly status: number | null;
  /** Machine-readable code from the API error body, when available. */
  readonly code: ApiErrorCode | null;
  /** Per-field validation messages (VALIDATION_ERROR). */
  readonly details: ApiFieldError[];
  readonly url: string;

  constructor(
    message: string,
    options: {
      status: number | null;
      url: string;
      code?: ApiErrorCode | null;
      details?: ApiFieldError[];
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.status = options.status;
    this.code = options.code ?? null;
    this.details = options.details ?? [];
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
      // Send and accept the HttpOnly session cookie on cross-origin (different port) requests.
      credentials: 'include',
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
    throw await toApiError(response, url);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export interface DownloadedFile {
  blob: Blob;
  /** From `Content-Disposition`, when the API sends one. */
  filename: string | null;
}

/**
 * Downloads a file (e.g. a CSV export) with the same base URL, credentials,
 * timeout, and error handling as `apiRequest`. Errors arrive as JSON and
 * become `ApiError`s.
 */
export async function apiDownload(
  path: string,
  { signal, timeoutMs = 60_000 }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<DownloadedFile> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'text/csv, application/json' },
      credentials: 'include',
      signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    const reason = timeoutSignal.aborted
      ? `did not respond within ${timeoutMs / 1000}s`
      : 'could not be reached';
    throw new ApiError(`The API at ${baseUrl} ${reason}.`, { status: null, url, cause: error });
  }

  if (!response.ok) {
    throw await toApiError(response, url);
  }
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? null;
  return { blob: await response.blob(), filename };
}

/** Reads the API's `{ code, message, details }` error body, falling back to the status line. */
async function toApiError(response: Response, url: string): Promise<ApiError> {
  const fallback = `Request failed with status ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.`;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // Body is not JSON — use the fallback below.
  }

  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const message = typeof record.message === 'string' ? record.message : fallback;
  const code = API_ERROR_CODES.find((known) => known === record.code) ?? null;
  const details = Array.isArray(record.details) ? (record.details as ApiFieldError[]) : [];

  return new ApiError(message, { status: response.status, url, code, details });
}
