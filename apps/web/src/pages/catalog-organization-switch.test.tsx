import type { Organization, Product, ProductListItem } from '@app/shared';
import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { testCategory, testProduct } from '@/test/catalog-fixtures';
import {
  apiError,
  json,
  mockApi,
  organizationDetail,
  organizationList,
  organizationSummary,
  signedIn,
  testOrganization,
} from '@/test/mock-api';
import { renderApp } from '@/test/render-app';

const orgA = testOrganization;
const orgB: Organization = {
  ...testOrganization,
  id: '0198c0de-0000-7000-8000-00000000000b',
  name: 'Beta Retail',
  slug: 'beta-retail',
};

const alphaProduct = testProduct({ name: 'Alpha Widget', sku: 'A-1' });
const betaProduct = testProduct({
  id: '0198c0de-0000-7000-8000-0000000000f1',
  name: 'Beta Gadget',
  sku: 'B-1',
  category: null,
});

const listOf = (items: Product[]) => ({
  items: items.map(({ description: _description, ...item }): ProductListItem => item),
  pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: 1 },
});

/** Two workspaces with separate catalogs; B's product list can be held back. */
function mockTwoOrganizations(options: { holdBetaProducts?: Promise<void> } = {}) {
  return mockApi({
    'GET /auth/me': signedIn(),
    'GET /organizations': organizationList([
      organizationSummary({ role: 'OWNER' }),
      organizationSummary({ id: orgB.id, name: orgB.name, slug: orgB.slug, role: 'STAFF' }),
    ]),
    [`GET /organizations/${orgA.id}`]: organizationDetail('OWNER', orgA),
    [`GET /organizations/${orgB.id}`]: organizationDetail('STAFF', orgB),
    [`GET /organizations/${orgA.id}/categories`]: json(200, { categories: [testCategory()] }),
    [`GET /organizations/${orgB.id}/categories`]: json(200, { categories: [] }),
    [`GET /organizations/${orgA.id}/products`]: json(200, listOf([alphaProduct])),
    [`GET /organizations/${orgB.id}/products`]: async () => {
      await options.holdBetaProducts;
      return Response.json(listOf([betaProduct]));
    },
    [`GET /organizations/${orgA.id}/products/${alphaProduct.id}`]: json(200, {
      product: alphaProduct,
    }),
    // Workspace B doesn't know workspace A's product.
    [`GET /organizations/${orgB.id}/products/${alphaProduct.id}`]: apiError(
      404,
      'PRODUCT_NOT_FOUND',
      'Product not found.',
    ),
  });
}

describe('Catalog when switching workspaces', () => {
  it("never shows workspace A's products or categories inside workspace B", async () => {
    let release = () => {};
    const holdBetaProducts = new Promise<void>((resolve) => (release = resolve));
    const fetchMock = mockTwoOrganizations({ holdBetaProducts });
    const { router } = renderApp(`/org/${orgA.id}/products`);

    expect(await screen.findAllByRole('link', { name: 'Alpha Widget' })).not.toHaveLength(0);
    expect(screen.getByRole('option', { name: 'Office' })).toBeInTheDocument();

    await act(() => router.navigate(`/org/${orgB.id}/products`));

    // While B's products load, nothing from A is on screen.
    expect(await screen.findByText('Loading products')).toBeInTheDocument();
    expect(screen.queryByText('Alpha Widget')).not.toBeInTheDocument();

    release();
    expect(await screen.findAllByRole('link', { name: 'Beta Gadget' })).not.toHaveLength(0);
    expect(screen.queryByText('Alpha Widget')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: 'Office' })).not.toBeInTheDocument(),
    );
    // Workspace B's requests only ever went to B's endpoints.
    const betaRequests = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)).pathname)
      .filter((path) => path.includes('/products') && path.includes(orgB.id));
    expect(betaRequests.length).toBeGreaterThan(0);
    // The role shown is B's: STAFF can't archive.
    expect(screen.queryByRole('button', { name: /Archive/ })).not.toBeInTheDocument();
  });

  it("does not carry A's page state into an already-loaded B", async () => {
    mockTwoOrganizations();
    // Visit B first so its workspace is cached and switching back renders immediately.
    const { router, user } = renderApp(`/org/${orgB.id}/products`);
    expect(await screen.findAllByRole('link', { name: 'Beta Gadget' })).not.toHaveLength(0);

    await act(() => router.navigate(`/org/${orgA.id}/products?search=alpha`));
    const search = await screen.findByRole('searchbox', { name: 'Search products' });
    await waitFor(() => expect(search).toHaveValue('alpha'));
    await user.type(search, 'x');

    await act(() => router.navigate(`/org/${orgB.id}/products`));

    expect(screen.getByRole('searchbox', { name: 'Search products' })).toHaveValue('');
    // The pending debounced search of A is not applied to B's URL.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(router.state.location.pathname).toBe(`/org/${orgB.id}/products`);
    expect(router.state.location.search).toBe('');
  });

  it("answers 'not found' for A's product opened under B", async () => {
    mockTwoOrganizations();
    renderApp(`/org/${orgB.id}/products/${alphaProduct.id}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Product not found' }),
    ).toBeVisible();
    expect(screen.queryByText('Alpha Widget')).not.toBeInTheDocument();
  });
});
