import type { Category, MemberRole, Permission } from '@app/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { apiError, json, mockApi, testOrganization } from '@/test/mock-api';
import { ORG_API, sentBodies, testCategory } from '@/test/catalog-fixtures';
import { createOrganizationContext, OrganizationContext } from '@/lib/organization-context';
import { CategoryPicker, type CategoryChoice } from './category-picker';

const office = testCategory();
const outdoor = testCategory({ id: '0198c0de-0000-7000-8000-0000000000c2', name: 'Outdoor' });
const CATEGORIES = `${ORG_API}/categories`;

/** The server's search: case-insensitive "contains" over THIS workspace's categories. */
const searchHandler = (categories: Category[]) => (_init: RequestInit | undefined, url: URL) => {
  const term = (url.searchParams.get('search') ?? '').toLowerCase();
  return Response.json({
    categories: categories.filter((category) => category.name.toLowerCase().includes(term)),
  });
};

function Harness({
  role = 'STAFF',
  without = [],
  initial = null,
}: {
  role?: MemberRole;
  without?: Permission[];
  initial?: CategoryChoice | null;
}) {
  const [value, setValue] = useState<CategoryChoice | null>(initial);
  const base = createOrganizationContext(testOrganization, role);
  const context = { ...base, can: (p: Permission) => !without.includes(p) && base.can(p) };
  return (
    <OrganizationContext.Provider value={context}>
      <label htmlFor="category">Category</label>
      <CategoryPicker control={{ id: 'category' }} value={value} onChange={setValue} />
      <output aria-label="Chosen">{value ? `${value.id}:${value.name}` : 'none'}</output>
    </OrganizationContext.Provider>
  );
}

function renderPicker(props: Parameters<typeof Harness>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <Harness {...props} />
    </QueryClientProvider>,
  );
  return { user, input: screen.getByRole('combobox', { name: 'Category' }) };
}

const chosen = () => screen.getByRole('status', { name: 'Chosen' });

describe('CategoryPicker', () => {
  it('lists the workspace categories, searches on the server, and selects one', async () => {
    const fetchMock = mockApi({ [`GET ${CATEGORIES}`]: searchHandler([office, outdoor]) });
    const { user, input } = renderPicker();

    await user.click(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('option', { name: 'Office' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Outdoor' })).toBeVisible();

    await user.type(input, 'out');
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Office' })).toBeNull());
    await user.click(screen.getByRole('option', { name: 'Outdoor' }));

    expect(chosen()).toHaveTextContent(`${outdoor.id}:Outdoor`);
    expect(input).toHaveValue('Outdoor');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    const searches = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname === CATEGORIES)
      .map((url) => url.searchParams.get('search'));
    expect(searches).toContain('out');
  });

  it('works with the keyboard: arrows, Enter, and Escape', async () => {
    mockApi({ [`GET ${CATEGORIES}`]: searchHandler([office, outdoor]) });
    const { user, input } = renderPicker();

    input.focus();
    await screen.findByRole('option', { name: 'Office' });
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Outdoor' }).id,
    );
    await user.keyboard('{Enter}');
    expect(chosen()).toHaveTextContent('Outdoor');

    await user.clear(input);
    await user.type(input, 'off');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('Outdoor');
    expect(chosen()).toHaveTextContent('Outdoor');
  });

  it('shows the current choice, and clears it', async () => {
    mockApi({ [`GET ${CATEGORIES}`]: searchHandler([office]) });
    const { user, input } = renderPicker({ initial: { id: office.id, name: 'Office' } });

    expect(input).toHaveValue('Office');
    await user.click(input);
    expect(await screen.findByRole('option', { name: 'Office' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Clear category' }));
    expect(chosen()).toHaveTextContent('none');
    expect(input).toHaveValue('');
  });

  it('offers to create the typed name when nothing matches', async () => {
    const created = testCategory({ id: '0198c0de-0000-7000-8000-0000000000c9', name: 'Garden' });
    const fetchMock = mockApi({
      [`GET ${CATEGORIES}`]: searchHandler([office]),
      [`POST ${CATEGORIES}`]: json(201, { category: created }),
    });
    const { user, input } = renderPicker();

    await user.type(input, '  Garden ');
    await user.click(await screen.findByRole('option', { name: 'Create “Garden”' }));

    await waitFor(() => expect(chosen()).toHaveTextContent(`${created.id}:Garden`));
    expect(sentBodies(fetchMock, 'POST', CATEGORIES)).toEqual([{ name: 'Garden' }]);
  });

  it('never offers to create a name that exists in another letter case', async () => {
    mockApi({ [`GET ${CATEGORIES}`]: searchHandler([office]) });
    const { user, input } = renderPicker();

    await user.type(input, 'OFFICE');
    expect(await screen.findByRole('option', { name: 'Office' })).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('option', { name: /Create/ })).toBeNull());
  });

  it('selects the existing category when the name was taken meanwhile', async () => {
    let categories: Category[] = [office];
    const garden = testCategory({ id: '0198c0de-0000-7000-8000-0000000000c8', name: 'Garden' });
    mockApi({
      [`GET ${CATEGORIES}`]: (init, url) => searchHandler(categories)(init, url),
      [`POST ${CATEGORIES}`]: () => {
        categories = [office, garden];
        return apiError(409, 'CATEGORY_NAME_TAKEN', 'A category named “Garden” already exists.')();
      },
    });
    const { user, input } = renderPicker();

    await user.type(input, 'garden');
    await user.click(await screen.findByRole('option', { name: 'Create “garden”' }));

    await waitFor(() => expect(chosen()).toHaveTextContent(`${garden.id}:Garden`));
  });

  it('does not offer creation without CATEGORIES_CREATE', async () => {
    mockApi({ [`GET ${CATEGORIES}`]: searchHandler([office]) });
    const { user, input } = renderPicker({ without: ['CATEGORIES_CREATE'] });

    await user.type(input, 'Garden');
    expect(await screen.findByText('No categories match “Garden”.')).toBeVisible();
    expect(screen.queryByRole('option', { name: /Create/ })).toBeNull();
  });

  it('shows a load error with a retry', async () => {
    mockApi({ [`GET ${CATEGORIES}`]: apiError(500, 'INTERNAL_ERROR', 'Boom') });
    const { user, input } = renderPicker();

    await user.click(input);
    expect(await screen.findByText("Categories couldn't be loaded.")).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
