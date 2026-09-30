import type { Category } from '@app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ORG_API, ORG_APP, renderCatalog, sentBodies, testCategory } from '@/test/catalog-fixtures';
import { apiError, json, noContent, pending } from '@/test/mock-api';

const CATEGORIES_APP = `${ORG_APP}/categories`;
const office = testCategory();
const empty = testCategory({
  id: '0198c0de-0000-7000-8000-0000000000c2',
  name: 'Seasonal',
  description: null,
  productCount: 0,
});

/** Categories page with a mutable server-side list. */
async function openCategories(
  role: 'OWNER' | 'ADMIN' | 'STAFF',
  initial: Category[],
  handlers: Parameters<typeof renderCatalog>[2] = {},
) {
  const state = { categories: initial };
  const app = await renderCatalog(
    CATEGORIES_APP,
    role,
    {
      [`GET ${ORG_API}/categories`]: () => Response.json({ categories: state.categories }),
      ...handlers,
    },
    { waitForHeading: 'Categories' },
  );
  return { ...app, state };
}

describe('CategoriesPage', () => {
  it('lists categories with description and product count', async () => {
    await openCategories('OWNER', [office, empty]);

    const table = await screen.findByRole('table');
    const [, officeRow, seasonalRow] = within(table).getAllByRole('row');
    expect(within(officeRow).getByText('Office')).toBeVisible();
    expect(within(officeRow).getByText('Pens and paper')).toBeVisible();
    expect(within(officeRow).getByRole('link', { name: '1 product in Office' })).toHaveAttribute(
      'href',
      `${ORG_APP}/products?category=${office.id}`,
    );
    expect(within(seasonalRow).getByText('0 products')).toBeVisible();
  });

  it('shows an empty state', async () => {
    await openCategories('STAFF', []);

    expect(await screen.findByText('No categories yet')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Add category' }).length).toBeGreaterThan(0);
  });

  it('shows a safe error with retry', async () => {
    await renderCatalog(CATEGORIES_APP, 'OWNER', {
      [`GET ${ORG_API}/categories`]: apiError(500, 'INTERNAL_ERROR', 'stack trace'),
    });

    expect(await screen.findByText("We couldn't load categories")).toBeVisible();
    expect(screen.queryByText('stack trace')).not.toBeInTheDocument();
  });

  it('lets staff create and edit but not delete', async () => {
    await openCategories('STAFF', [office]);
    const table = await screen.findByRole('table');

    expect(screen.getByRole('button', { name: 'Add category' })).toBeVisible();
    expect(within(table).getByRole('button', { name: 'Edit Office' })).toBeVisible();
    expect(within(table).queryByRole('button', { name: 'Delete Office' })).not.toBeInTheDocument();
  });

  it('creates a category in a dialog', async () => {
    const created = testCategory({
      id: '0198c0de-0000-7000-8000-0000000000c3',
      name: 'Packaging',
      description: null,
      productCount: 0,
    });
    const { user, fetchMock, state } = await openCategories('STAFF', [office], {
      [`POST ${ORG_API}/categories`]: () => {
        state.categories = [created, ...state.categories];
        return Response.json({ category: created }, { status: 201 });
      },
    });

    await user.click(screen.getByRole('button', { name: 'Add category' }));
    const dialog = screen.getByRole('dialog', { name: 'New category' });
    expect(within(dialog).getByLabelText('Name')).toHaveFocus();

    await user.type(within(dialog).getByLabelText('Name'), '  Packaging   boxes ');
    await user.click(within(dialog).getByRole('button', { name: 'Create category' }));

    expect(await screen.findByText('Packaging created.')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await within(screen.getByRole('table')).findByText('Packaging')).toBeVisible();
    expect(sentBodies(fetchMock, 'POST', `${ORG_API}/categories`)).toEqual([
      { name: 'Packaging boxes', description: null },
    ]);
  });

  it('validates the name before sending', async () => {
    const { user, fetchMock } = await openCategories('OWNER', [office]);

    await user.click(screen.getByRole('button', { name: 'Add category' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Create category' }));

    expect(within(dialog).getByLabelText('Name')).toHaveAccessibleDescription(
      'Enter a category name.',
    );
    expect(sentBodies(fetchMock, 'POST', `${ORG_API}/categories`)).toHaveLength(0);
  });

  it('shows a duplicate name on the name field', async () => {
    const { user } = await openCategories('OWNER', [office], {
      [`POST ${ORG_API}/categories`]: apiError(
        409,
        'CATEGORY_NAME_TAKEN',
        'A category with this name already exists.',
      ),
    });

    await user.click(screen.getByRole('button', { name: 'Add category' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'office');
    await user.click(within(dialog).getByRole('button', { name: 'Create category' }));

    await waitFor(() =>
      expect(within(dialog).getByLabelText('Name')).toHaveAccessibleDescription(
        'A category with this name already exists.',
      ),
    );
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('edits a category with its current values prefilled', async () => {
    const { user, fetchMock, state } = await openCategories('ADMIN', [office], {
      [`PATCH ${ORG_API}/categories/${office.id}`]: () => {
        state.categories = [{ ...office, name: 'Office supplies' }];
        return Response.json({ category: state.categories[0] });
      },
      [`GET ${ORG_API}/products`]: json(200, {
        items: [],
        pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      }),
    });
    const table = await screen.findByRole('table');

    await user.click(within(table).getByRole('button', { name: 'Edit Office' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit category' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Office');
    expect(within(dialog).getByLabelText('Description')).toHaveValue('Pens and paper');

    await user.clear(within(dialog).getByLabelText('Name'));
    await user.type(within(dialog).getByLabelText('Name'), 'Office supplies');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Category saved.')).toBeVisible();
    expect(await within(table).findByText('Office supplies')).toBeVisible();
    expect(sentBodies(fetchMock, 'PATCH', `${ORG_API}/categories/${office.id}`)).toEqual([
      { name: 'Office supplies', description: 'Pens and paper' },
    ]);
  });

  it('deletes an unused category after confirmation', async () => {
    const { user, fetchMock, state } = await openCategories('OWNER', [office, empty], {
      [`DELETE ${ORG_API}/categories/${empty.id}`]: () => {
        state.categories = [office];
        return noContent()();
      },
    });
    const table = await screen.findByRole('table');

    await user.click(within(table).getByRole('button', { name: 'Delete Seasonal' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete category?' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Seasonal deleted.')).toBeVisible();
    await waitFor(() => expect(within(table).queryByText('Seasonal')).not.toBeInTheDocument());
    expect(sentBodies(fetchMock, 'DELETE', `${ORG_API}/categories/${empty.id}`)).toHaveLength(1);
  });

  it('explains instead of deleting when the category has products', async () => {
    const { user, fetchMock } = await openCategories('ADMIN', [testCategory({ productCount: 3 })]);
    const table = await screen.findByRole('table');

    await user.click(within(table).getByRole('button', { name: 'Delete Office' }));
    const dialog = screen.getByRole('dialog', { name: "This category can't be deleted" });

    expect(dialog).toHaveTextContent(
      'Office is used by 3 products. Move them to another category first.',
    );
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'View products' })).toHaveAttribute(
      'href',
      `${ORG_APP}/products?category=${office.id}`,
    );
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  });

  it('switches to the explanation when the API reports the category in use', async () => {
    const { user, state } = await openCategories('OWNER', [empty], {
      [`DELETE ${ORG_API}/categories/${empty.id}`]: () => {
        // Someone assigned a product meanwhile.
        state.categories = [{ ...empty, productCount: 1 }];
        return apiError(
          409,
          'CATEGORY_IN_USE',
          'This category is used by 1 product. Move that product to another category first.',
        )();
      },
    });
    const table = await screen.findByRole('table');

    await user.click(within(table).getByRole('button', { name: 'Delete Seasonal' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    expect(
      await screen.findByRole('dialog', { name: "This category can't be deleted" }),
    ).toHaveTextContent('Seasonal is used by 1 product.');
  });

  it('closes dialogs with Escape and keeps Tab inside them', async () => {
    const { user } = await openCategories('OWNER', [empty], {
      [`DELETE ${ORG_API}/categories/${empty.id}`]: pending(),
    });
    const table = await screen.findByRole('table');

    await user.click(within(table).getByRole('button', { name: 'Delete Seasonal' }));
    const dialog = screen.getByRole('dialog');
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toHaveFocus();
    await user.tab();
    // Wraps around to the first focusable element (the close button).
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Delete Seasonal' })).toHaveFocus();
  });
});
