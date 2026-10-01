import {
  type ApiErrorBody,
  type ApiErrorCode,
  type ApiFieldError,
  type AppearanceResponse,
  type AuthUser,
  DEFAULT_APPEARANCE,
  type MemberRole,
  type Organization,
  type OrganizationSummary,
} from '@app/shared';
import { vi } from 'vitest';
import { RECENT_ORDERS_QUERY } from '@/lib/dashboard-params';
import { emptyDashboardSummary } from './dashboard-fixtures';

export const TEST_API_BASE_URL = 'http://api.test';

const defaultAppearance = () =>
  Response.json({ appearance: DEFAULT_APPEARANCE, updatedAt: null } satisfies AppearanceResponse);

type Handler = (init: RequestInit | undefined, url: URL) => Response | Promise<Response>;

/**
 * Answers for requests that many pages make implicitly. A test's own handler
 * for the same key always wins.
 */
function defaultHandler(key: string, url: URL): Handler | undefined {
  // Every signed-in page loads the user's appearance; default to "never saved".
  if (key === 'GET /me/appearance') return defaultAppearance;
  // The workspace overview (dashboard) of any organization: an empty workspace…
  if (/^GET \/organizations\/[^/]+\/dashboard\/summary$/.test(key)) {
    return () => Response.json(emptyDashboardSummary());
  }
  // …and its "recent orders" box (only that exact query: orders pages still need their own mocks).
  if (
    /^GET \/organizations\/[^/]+\/orders$/.test(key) &&
    url.searchParams.get('pageSize') === String(RECENT_ORDERS_QUERY.pageSize) &&
    url.searchParams.get('sortBy') === RECENT_ORDERS_QUERY.sortBy
  ) {
    return () =>
      Response.json({
        items: [],
        pagination: { page: 1, pageSize: 5, totalItems: 0, totalPages: 0 },
      });
  }
  return undefined;
}

/**
 * Replaces `fetch` with a router keyed by "METHOD /path". Unhandled requests
 * fail the test loudly. Returns the mock so tests can inspect calls.
 */
export function mockApi(handlers: Record<string, Handler>) {
  vi.stubEnv('VITE_API_BASE_URL', TEST_API_BASE_URL);

  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    const handler = handlers[key] ?? defaultHandler(key, url);
    if (!handler) {
      throw new Error(`Unhandled API request in test: ${key}`);
    }
    return handler(init, url);
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

export const testOrganization: Organization = {
  id: '0198c0de-0000-7000-8000-00000000000a',
  name: 'Demo Trading Co.',
  slug: 'demo-trading',
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
};

export function organizationSummary(
  overrides: Partial<OrganizationSummary> = {},
): OrganizationSummary {
  return {
    id: testOrganization.id,
    name: testOrganization.name,
    slug: testOrganization.slug,
    role: 'OWNER',
    memberCount: 3,
    createdAt: testOrganization.createdAt,
    ...overrides,
  };
}

export const organizationList = (organizations: OrganizationSummary[]) =>
  json(200, { organizations });

export const noOrganizations = organizationList([]);

/** `GET /organizations/:id` for `testOrganization` with the given role. */
export const organizationDetail = (role: MemberRole = 'OWNER', organization = testOrganization) =>
  json(200, { organization, membership: { role } });
