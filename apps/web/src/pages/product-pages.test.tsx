import { screen, waitFor, within } from '@testing-library/react';
import type { Category } from '@app/shared';
import { describe, expect, it } from 'vitest';
import { money } from '@/test/format';
import {
  ORG_API,
  ORG_APP,
  renderCatalog,
  sentBodies,
  testCategory,
  testProduct,
} from '@/test/catalog-fixtures';
import { apiError, json, pending } from '@/test/mock-api';

const categorySearch = (categories: Category[]) => (_init: RequestInit | undefined, url: URL) => {
  const term = (url.searchParams.get('search') ?? '').toLowerCase();
  return Response.json({
    categories: categories.filter((category) => category.name.toLowerCase().includes(term)),
  });
};
const packaging = testCategory({ id: '0198c0de-0000-7000-8000-0000000000c3', name: 'Packaging' });
const product = testProduct();
const PRODUCT_API = `${ORG_API}/products/${product.id}`;
const PRODUCT_APP = `${ORG_APP}/products/${product.id}`;

describe('New product page', () => {
  async function fillValidForm(user: Awaited<ReturnType<typeof renderCatalog>>['user']) {
    await user.type(screen.getByLabelText('Name'), '  Stapler  ');
    await user.type(screen.getByLabelText('SKU'), 'OFF-STP');
    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    await user.click(await screen.findByRole('option', { name: 'Office' }));
    await user.type(screen.getByLabelText('Price'), '12.5');
    await user.type(screen.getByLabelText('Cost'), '0.1');
    await user.clear(screen.getByLabelText('Minimum stock'));
    await user.type(screen.getByLabelText('Minimum stock'), '5');
  }

  it('creates a product with money as strings and opens it', async () => {
    const created = testProduct({ id: '0198c0de-0000-7000-8000-0000000000e1', name: 'Stapler' });
    const { user, fetchMock, router } = await renderCatalog(
      `${ORG_APP}/products/new`,
      'STAFF',
      {
        [`POST ${ORG_API}/products`]: json(201, { product: created }),
        [`GET ${ORG_API}/products/${created.id}`]: json(200, { product: created }),
      },
      { waitForHeading: 'New product' },
    );
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Create product' }));

    expect(await screen.findByText('Product created.')).toBeVisible();
    expect(router.state.location.pathname).toBe(`${ORG_APP}/products/${created.id}`);
    expect(sentBodies(fetchMock, 'POST', `${ORG_API}/products`)).toEqual([
      {
        name: 'Stapler',
        sku: 'OFF-STP',
        description: null,
        categoryId: testCategory().id,
        price: '12.5',
        cost: '0.1',
        currency: 'TRY',
        minimumStock: 5,
      },
    ]);
  });

  it('prices a product in another currency: one currency for price and cost', async () => {
    const created = testProduct({ id: '0198c0de-0000-7000-8000-0000000000e2', currency: 'EUR' });
    const { user, fetchMock } = await renderCatalog(
      `${ORG_APP}/products/new`,
      'OWNER',
      {
        [`POST ${ORG_API}/products`]: json(201, { product: created }),
        [`GET ${ORG_API}/products/${created.id}`]: json(200, { product: created }),
      },
      { waitForHeading: 'New product' },
    );

    await fillValidForm(user);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Currency' }), 'EUR');
    // The cost follows the price's currency.
    expect(screen.getAllByText('€')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Create product' }));

    expect(await screen.findByText('Product created.')).toBeVisible();
    expect(sentBodies(fetchMock, 'POST', `${ORG_API}/products`)[0]).toMatchObject({
      price: '12.5',
      cost: '0.1',
      currency: 'EUR',
    });
    expect(screen.getByText(money('1234.50', 'EUR'))).toBeVisible();
  });

  it('picks the category with a searchable picker, creates one from it, and submits its id', async () => {
    const gaming = testCategory({ id: '0198c0de-0000-7000-8000-0000000000c4', name: 'Gaming' });
    const created = testProduct({ id: '0198c0de-0000-7000-8000-0000000000e3', category: gaming });
    const { user, fetchMock } = await renderCatalog(
      `${ORG_APP}/products/new`,
      'STAFF',
      {
        [`GET ${ORG_API}/categories`]: categorySearch([testCategory(), packaging]),
        [`POST ${ORG_API}/categories`]: json(201, { category: gaming }),
        [`POST ${ORG_API}/products`]: json(201, { product: created }),
        [`GET ${ORG_API}/products/${created.id}`]: json(200, { product: created }),
      },
      { waitForHeading: 'New product' },
    );

    // A picker, not a free-text field: it lists the workspace's categories when opened.
    const picker = screen.getByRole('combobox', { name: 'Category' });
    expect(picker).toHaveAccessibleDescription(
      'Type to search. Choose “Create” to add a new category.',
    );
    await user.click(screen.getByRole('button', { name: 'Show categories' }));
    expect(await screen.findByRole('option', { name: 'Office' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Packaging' })).toBeVisible();

    // Search, then select an existing category, then clear it.
    await user.type(picker, 'pack');
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Office' })).toBeNull());
    await user.click(screen.getByRole('option', { name: 'Packaging' }));
    expect(picker).toHaveValue('Packaging');
    await user.click(screen.getByRole('button', { name: 'Clear category' }));
    expect(picker).toHaveValue('');

    // A new name: "no results", then create it right here; it becomes the selection.
    await user.type(picker, 'Gaming');
    expect(await screen.findByText('No categories match “Gaming”.')).toBeVisible();
    await user.click(screen.getByRole('option', { name: 'Create “Gaming”' }));
    await waitFor(() => expect(picker).toHaveValue('Gaming'));
    expect(sentBodies(fetchMock, 'POST', `${ORG_API}/categories`)).toEqual([{ name: 'Gaming' }]);

    await user.type(screen.getByLabelText('Name'), 'Controller');
    await user.type(screen.getByLabelText('SKU'), 'GAME-1');
    await user.type(screen.getByLabelText('Price'), '30');
    await user.type(screen.getByLabelText('Cost'), '12');
    await user.click(screen.getByRole('button', { name: 'Create product' }));

    expect(await screen.findByText('Product created.')).toBeVisible();
    // The category's id is submitted, never its visible name.
    expect(sentBodies(fetchMock, 'POST', `${ORG_API}/products`)[0]).toMatchObject({
      categoryId: gaming.id,
    });
  });

  it('validates on the client before sending anything', async () => {
    const { user, fetchMock } = await renderCatalog(
      `${ORG_APP}/products/new`,
      'OWNER',
      {},
      {
        waitForHeading: 'New product',
      },
    );

    await user.type(screen.getByLabelText('SKU'), 'has space');
    await user.type(screen.getByLabelText('Price'), '1.234');
    await user.type(screen.getByLabelText('Cost'), '-1');
    await user.clear(screen.getByLabelText('Minimum stock'));
    await user.type(screen.getByLabelText('Minimum stock'), '2.5');
    await user.click(screen.getByRole('button', { name: 'Create product' }));

    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Enter a product name.');
    expect(screen.getByLabelText('SKU')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Price')).toHaveAccessibleDescription(/up to 2 decimals/);
    expect(screen.getByLabelText('Cost')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Minimum stock')).toHaveAccessibleDescription(/whole number/);
    expect(sentBodies(fetchMock, 'POST', `${ORG_API}/products`)).toHaveLength(0);
  });

  it('shows a duplicate SKU on the SKU field', async () => {
    const { user } = await renderCatalog(
      `${ORG_APP}/products/new`,
      'OWNER',
      {
        [`POST ${ORG_API}/products`]: apiError(
          409,
          'PRODUCT_SKU_TAKEN',
          'A product with this SKU already exists in this workspace.',
        ),
      },
      { waitForHeading: 'New product' },
    );

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Create product' }));

    await waitFor(() =>
      expect(screen.getByLabelText('SKU')).toHaveAccessibleDescription(
        'A product with this SKU already exists in this workspace.',
      ),
    );
    expect(screen.getByLabelText('SKU')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a missing category on the category field', async () => {
    const { user } = await renderCatalog(
      `${ORG_APP}/products/new`,
      'OWNER',
      {
        [`POST ${ORG_API}/products`]: apiError(
          422,
          'PRODUCT_CATEGORY_NOT_FOUND',
          'Category not found.',
        ),
      },
      { waitForHeading: 'New product' },
    );
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Create product' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Category')).toHaveAccessibleDescription(
        'This category no longer exists. Choose another one.',
      ),
    );
  });

  it('maps server validation details onto fields', async () => {
    const { user } = await renderCatalog(
      `${ORG_APP}/products/new`,
      'OWNER',
      {
        [`POST ${ORG_API}/products`]: apiError(400, 'VALIDATION_ERROR', 'Invalid input.', [
          { field: 'price', messages: ['Price is out of range.'] },
        ]),
      },
      { waitForHeading: 'New product' },
    );

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Create product' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Price')).toHaveAccessibleDescription('Price is out of range.'),
    );
  });

  it('disables the submit button while saving, preventing duplicate submissions', async () => {
    const { user, fetchMock } = await renderCatalog(
      `${ORG_APP}/products/new`,
      'OWNER',
      { [`POST ${ORG_API}/products`]: pending() },
      { waitForHeading: 'New product' },
    );

    await fillValidForm(user);
    const submit = screen.getByRole('button', { name: 'Create product' });
    await user.click(submit);
    await user.click(submit);

    expect(submit).toBeDisabled();
    expect(sentBodies(fetchMock, 'POST', `${ORG_API}/products`)).toHaveLength(1);
  });
});

describe('Product detail page', () => {
  it('shows every field with exact money and timestamps', async () => {
    await renderCatalog(
      PRODUCT_APP,
      'STAFF',
      { [`GET ${PRODUCT_API}`]: json(200, { product }) },
      { waitForHeading: 'Ballpoint Pen' },
    );

    expect(screen.getByText('OFF-PEN')).toBeVisible();
    expect(screen.getByText('Office')).toBeVisible();
    expect(screen.getByText('Blue ink, box of 12')).toBeVisible();
    expect(screen.getByText(money('1234.50'))).toBeVisible();
    expect(screen.getByText(money('0.40'))).toBeVisible();
    expect(screen.getByText('20')).toBeVisible();
    expect(screen.getByText('Created')).toBeVisible();
    expect(screen.getByText('Last updated')).toBeVisible();
  });

  it('lets staff edit but not archive', async () => {
    await renderCatalog(
      PRODUCT_APP,
      'STAFF',
      { [`GET ${PRODUCT_API}`]: json(200, { product }) },
      { waitForHeading: 'Ballpoint Pen' },
    );

    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      `${PRODUCT_APP}/edit`,
    );
    expect(screen.queryByRole('button', { name: /Archive|Restore/ })).not.toBeInTheDocument();
  });

  it('archives after confirmation and then offers restore', async () => {
    const { user, fetchMock } = await renderCatalog(
      PRODUCT_APP,
      'ADMIN',
      {
        [`GET ${PRODUCT_API}`]: json(200, { product }),
        [`POST ${PRODUCT_API}/archive`]: json(200, {
          product: { ...product, status: 'ARCHIVED' },
        }),
      },
      { waitForHeading: 'Ballpoint Pen' },
    );

    await user.click(screen.getByRole('button', { name: 'Archive' }));
    const dialog = screen.getByRole('dialog', { name: 'Archive product?' });
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));

    expect(await screen.findByText('Product archived.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(sentBodies(fetchMock, 'POST', `${PRODUCT_API}/archive`)).toHaveLength(1);
  });

  it('keeps the dialog open with the error when archiving fails', async () => {
    const { user } = await renderCatalog(
      PRODUCT_APP,
      'OWNER',
      {
        [`GET ${PRODUCT_API}`]: json(200, { product }),
        [`POST ${PRODUCT_API}/archive`]: apiError(500, 'INTERNAL_ERROR', 'boom'),
      },
      { waitForHeading: 'Ballpoint Pen' },
    );

    await user.click(screen.getByRole('button', { name: 'Archive' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Something went wrong on our side. Please try again.',
    );
    expect(dialog).not.toHaveTextContent('boom');
  });

  it('shows "not found" for unknown or foreign products', async () => {
    await renderCatalog(
      PRODUCT_APP,
      'OWNER',
      { [`GET ${PRODUCT_API}`]: apiError(404, 'PRODUCT_NOT_FOUND', 'Product not found.') },
      { waitForHeading: 'Product not found' },
    );

    expect(screen.getByRole('link', { name: 'View all products' })).toHaveAttribute(
      'href',
      `${ORG_APP}/products`,
    );
  });

  it('shows a load error with retry', async () => {
    await renderCatalog(PRODUCT_APP, 'OWNER', {
      [`GET ${PRODUCT_API}`]: apiError(500, 'INTERNAL_ERROR', 'secret details'),
    });

    expect(await screen.findByText("We couldn't load this product")).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(screen.queryByText('secret details')).not.toBeInTheDocument();
  });
});

describe('Edit product page', () => {
  it('loads the product and sends only the changed fields', async () => {
    const saved = { ...product, price: '99.99', updatedAt: '2026-09-03T10:00:00.000Z' };
    const { user, fetchMock, router } = await renderCatalog(
      `${PRODUCT_APP}/edit`,
      'STAFF',
      {
        [`GET ${PRODUCT_API}`]: json(200, { product }),
        [`PATCH ${PRODUCT_API}`]: json(200, { product: saved }),
      },
      { waitForHeading: 'Edit Ballpoint Pen' },
    );

    expect(screen.getByLabelText('Name')).toHaveValue('Ballpoint Pen');
    expect(screen.getByLabelText('SKU')).toHaveValue('OFF-PEN');
    expect(screen.getByLabelText('Price')).toHaveValue('1234.50');
    expect(screen.getByLabelText('Minimum stock')).toHaveValue('20');

    await user.clear(screen.getByLabelText('Price'));
    await user.type(screen.getByLabelText('Price'), '99.99');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Changes saved.')).toBeVisible();
    expect(router.state.location.pathname).toBe(PRODUCT_APP);
    expect(sentBodies(fetchMock, 'PATCH', PRODUCT_API)).toEqual([{ price: '99.99' }]);
    // The detail page shows the saved product from the cache.
    expect(screen.getByText(money('99.99'))).toBeVisible();
  });

  it('shows the current category, and saves another one chosen with the picker', async () => {
    const saved = { ...product, category: { id: packaging.id, name: 'Packaging' } };
    const { user, fetchMock } = await renderCatalog(
      `${PRODUCT_APP}/edit`,
      'STAFF',
      {
        [`GET ${ORG_API}/categories`]: categorySearch([testCategory(), packaging]),
        [`GET ${PRODUCT_API}`]: json(200, { product }),
        [`PATCH ${PRODUCT_API}`]: json(200, { product: saved }),
      },
      { waitForHeading: 'Edit Ballpoint Pen' },
    );

    const picker = screen.getByRole('combobox', { name: 'Category' });
    expect(picker).toHaveValue('Office');
    await user.click(picker);
    expect(await screen.findByRole('option', { name: 'Office' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.clear(picker);
    await user.type(picker, 'Pack');
    await user.click(await screen.findByRole('option', { name: 'Packaging' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Changes saved.')).toBeVisible();
    expect(sentBodies(fetchMock, 'PATCH', PRODUCT_API)).toEqual([{ categoryId: packaging.id }]);
  });

  it('removes the category when it is cleared', async () => {
    const { user, fetchMock } = await renderCatalog(
      `${PRODUCT_APP}/edit`,
      'OWNER',
      {
        [`GET ${PRODUCT_API}`]: json(200, { product }),
        [`PATCH ${PRODUCT_API}`]: json(200, { product: { ...product, category: null } }),
      },
      { waitForHeading: 'Edit Ballpoint Pen' },
    );

    await user.click(screen.getByRole('button', { name: 'Clear category' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Changes saved.')).toBeVisible();
    expect(sentBodies(fetchMock, 'PATCH', PRODUCT_API)).toEqual([{ categoryId: null }]);
  });

  it('does not send a request when nothing changed', async () => {
    const { user, fetchMock } = await renderCatalog(
      `${PRODUCT_APP}/edit`,
      'OWNER',
      { [`GET ${PRODUCT_API}`]: json(200, { product }) },
      { waitForHeading: 'Edit Ballpoint Pen' },
    );

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('No changes to save.')).toBeVisible();
    expect(sentBodies(fetchMock, 'PATCH', PRODUCT_API)).toHaveLength(0);
  });

  it('explains when the product was archived meanwhile', async () => {
    let status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE';
    const { user } = await renderCatalog(
      `${PRODUCT_APP}/edit`,
      'OWNER',
      {
        [`GET ${PRODUCT_API}`]: () => Response.json({ product: { ...product, status } }),
        [`PATCH ${PRODUCT_API}`]: () => {
          status = 'ARCHIVED';
          return apiError(
            409,
            'PRODUCT_ARCHIVED',
            'This product is archived. Restore it before editing.',
          )();
        },
      },
      { waitForHeading: 'Edit Ballpoint Pen' },
    );

    await user.type(screen.getByLabelText('Name'), ' XL');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('This product is archived')).toBeVisible();
    expect(screen.getByText('Restore it before editing.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });

  it('allows keeping a legacy product without a cost', async () => {
    const legacy = { ...product, cost: null };
    const { user, fetchMock } = await renderCatalog(
      `${PRODUCT_APP}/edit`,
      'OWNER',
      {
        [`GET ${PRODUCT_API}`]: json(200, { product: legacy }),
        [`PATCH ${PRODUCT_API}`]: json(200, { product: { ...legacy, minimumStock: 3 } }),
      },
      { waitForHeading: 'Edit Ballpoint Pen' },
    );

    expect(screen.getByLabelText('Cost')).toHaveValue('');
    await user.clear(screen.getByLabelText('Minimum stock'));
    await user.type(screen.getByLabelText('Minimum stock'), '3');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Changes saved.')).toBeVisible();
    expect(sentBodies(fetchMock, 'PATCH', PRODUCT_API)).toEqual([{ minimumStock: 3 }]);
  });

  it('shows "not found" for unknown products', async () => {
    await renderCatalog(
      `${PRODUCT_APP}/edit`,
      'OWNER',
      { [`GET ${PRODUCT_API}`]: apiError(404, 'PRODUCT_NOT_FOUND', 'Product not found.') },
      { waitForHeading: 'Product not found' },
    );

    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });
});
