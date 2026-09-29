import type { ApiErrorBody, ApiErrorCode, ApiFieldError, AuthUser } from '@app/shared';
import { vi } from 'vitest';

export const TEST_API_BASE_URL = 'http://api.test';

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;

/**
 * Replaces `fetch` with a router keyed by "METHOD /path". Unhandled requests
 * fail the test loudly. Returns the mock so tests can inspect calls.
 */
export function mockApi(handlers: Record<string, Handler>) {
  vi.stubEnv('VITE_API_BASE_URL', TEST_API_BASE_URL);

  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    const handler = handlers[key];
    if (!handler) {
      throw new Error(`Unhandled API request in test: ${key}`);
    }
    return handler(init);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export const json = (status: number, body: unknown) => () => Response.json(body, { status });

export const noContent = () => () => new Response(null, { status: 204 });

export const apiError =
  (statusCode: number, code: ApiErrorCode, message = 'Error', details?: ApiFieldError[]) =>
  () =>
    Response.json({ statusCode, code, message, details } satisfies ApiErrorBody, {
      status: statusCode,
    });

/** A response that never settles — for asserting loading states. */
export const pending = () => () => new Promise<Response>(() => {});

export const signedOut = apiError(401, 'AUTH_UNAUTHENTICATED', 'Authentication required.');

export const testUser: AuthUser = {
  id: '0198c0de-0000-7000-8000-000000000001',
  name: 'Ada Example',
  email: 'ada@test.example',
};

export const signedIn = (user: AuthUser = testUser) => json(200, { user });
