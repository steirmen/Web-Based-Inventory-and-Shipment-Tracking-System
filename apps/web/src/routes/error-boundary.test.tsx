import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ORG_APP, renderCatalog } from '@/test/catalog-fixtures';

// One workspace page crashes while rendering (simulates a bug in a page).
vi.mock('@/pages/categories-page', () => ({
  CategoriesPage: () => {
    throw new Error('internal detail: TypeError at categories-page.tsx:42');
  },
}));

describe('route error boundaries', () => {
  it('shows a failing page inside the shell, keeps the navigation, and hides internals', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { user } = await renderCatalog(`${ORG_APP}/categories`, 'OWNER');

    expect(
      await screen.findByRole('heading', { name: 'This page could not be shown' }),
    ).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Something on this page stopped working. Reloading usually fixes it.',
    );
    expect(screen.queryByText(/internal detail|TypeError|categories-page\.tsx/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Reload the page' })).toBeVisible();

    // The app shell and the workspace navigation survive: the user can move on.
    expect(screen.getAllByRole('banner')[0]).toBeVisible();
    const nav = screen.getByRole('navigation', { name: 'Workspace' });
    await user.click(within(nav).getByRole('link', { name: 'Products' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Products' })).toBeVisible();
  });
});
