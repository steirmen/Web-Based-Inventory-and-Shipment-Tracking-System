import type { Category, MemberRole, Product } from '@app/shared';
import { screen } from '@testing-library/react';
import {
  json,
  mockApi,
  organizationDetail,
  organizationList,
  organizationSummary,
  signedIn,
  testOrganization,
} from './mock-api';
import { renderApp } from './render-app';

/** API path prefix and app path prefix of `testOrganization`. */
export const ORG_API = `/organizations/${testOrganization.id}`;
export const ORG_APP = `/org/${testOrganization.id}`;

export function testCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: '0198c0de-0000-7000-8000-0000000000c1',
    name: 'Office',
    description: 'Pens and paper',
    productCount: 1,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    ...overrides,
  };
}

export function testProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: '0198c0de-0000-7000-8000-0000000000d1',
    name: 'Ballpoint Pen',
    sku: 'OFF-PEN',
    description: 'Blue ink, box of 12',
    price: '1234.50',
    cost: '0.40',
    currency: 'TRY',
    minimumStock: 20,
    status: 'ACTIVE',
    category: { id: testCategory().id, name: testCategory().name },
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-02T09:30:00.000Z',
    ...overrides,
  };
}

/**
 * Renders `path` inside `testOrganization` as `role`, with its categories
 * mocked. `handlers` add or override API routes.
 */
export async function renderCatalog(
  path: string,
  role: MemberRole,
  handlers: Parameters<typeof mockApi>[0] = {},
  options: { categories?: Category[]; waitForHeading?: string | RegExp } = {},
) {
  const fetchMock = mockApi({
    'GET /auth/me': signedIn(),
    'GET /organizations': organizationList([organizationSummary({ role })]),
    [`GET ${ORG_API}`]: organizationDetail(role),
    [`GET ${ORG_API}/categories`]: json(200, {
      categories: options.categories ?? [testCategory()],
    }),
    ...handlers,
  });
  const app = renderApp(path);
  if (options.waitForHeading) {
    await screen.findByRole('heading', { level: 1, name: options.waitForHeading });
  }
  return { ...app, fetchMock };
}

/** Parsed JSON bodies of the requests sent to `METHOD path`. */
export function sentBodies(fetchMock: ReturnType<typeof mockApi>, method: string, path: string) {
  return fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        (init?.method ?? 'GET') === method && new URL(String(input)).pathname === path,
    )
    .map(([, init]) => JSON.parse(String(init?.body ?? 'null')) as unknown);
}
