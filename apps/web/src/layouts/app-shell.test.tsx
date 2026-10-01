import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, Outlet } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it } from 'vitest';
import { RouteProgress } from '@/components/layout/route-loading';
import { ORG_APP, renderCatalog } from '@/test/catalog-fixtures';
import { testUser } from '@/test/mock-api';
import { RouteErrorPage } from '@/pages/route-error-page';
import { routes } from '@/routes/router';

describe('Account menu', () => {
  it('shows who is signed in and links to the personal settings', async () => {
    const { user } = await renderCatalog(ORG_APP, 'OWNER', {}, { waitForHeading: 'Overview' });
    const header = screen.getAllByRole('banner')[0]!;

    await user.click(within(header).getByRole('button', { name: `Account: ${testUser.name}` }));

    const menu = screen.getByRole('menu', { name: 'Account' });
    expect(within(menu).getByText(testUser.email)).toBeVisible();
    expect(within(menu).getByRole('menuitem', { name: 'Appearance' })).toHaveAttribute(
      'href',
      '/settings/appearance',
    );
    expect(within(menu).getByRole('menuitem', { name: 'Your workspaces' })).toHaveAttribute(
      'href',
      '/organizations',
    );
    expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toBeEnabled();
  });
});

describe('Workspace navigation', () => {
  it('groups every section of the workspace and marks the current one', async () => {
    await renderCatalog(`${ORG_APP}/categories`, 'STAFF', {}, { waitForHeading: 'Categories' });

    const nav = screen.getByRole('navigation', { name: 'Workspace' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Overview',
      'Orders',
      'Customers',
      'Products',
      'Categories',
      'Inventory',
      'Warehouses',
      'Stock movements',
      'Reports',
      'Team',
      'Settings',
    ]);
    for (const group of ['Sales', 'Catalog', 'Stock', 'Insights', 'Workspace']) {
      expect(within(nav).getByText(group)).toBeInTheDocument();
    }
    expect(within(nav).getByRole('link', { name: 'Categories' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });
});

describe('Route-level code splitting', () => {
  it('loads workspace pages on demand', () => {
    const lazyPaths: string[] = [];
    const walk = (list: typeof routes) => {
      for (const route of list) {
        if (route.lazy) lazyPaths.push(route.index ? '(index)' : (route.path ?? ''));
        if (route.children) walk(route.children);
      }
    };
    walk(routes);
    expect(lazyPaths).toEqual(
      expect.arrayContaining([
        '(index)',
        'products',
        'inventory',
        'warehouses',
        'customers',
        'orders',
        'sales',
        'team',
        'settings',
        '/settings/appearance',
      ]),
    );
  });

  it('keeps the current page and shows a progress bar while the next page loads', async () => {
    let finish: (() => void) | undefined;
    const router = createMemoryRouter([
      {
        element: (
          <>
            <RouteProgress />
            <Outlet />
          </>
        ),
        children: [
          { path: '/', element: <Link to="/next">Next page</Link> },
          {
            path: '/next',
            lazy: () =>
              new Promise((resolve) => {
                finish = () => resolve({ Component: () => <h1>Next</h1> });
              }),
          },
        ],
      },
    ]);
    render(<RouterProvider router={router} />);

    await userEvent.click(screen.getByRole('link', { name: 'Next page' }));

    expect(await screen.findByLabelText('Loading page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next page' })).toBeVisible();
    finish!();
    expect(await screen.findByRole('heading', { name: 'Next' })).toBeVisible();
    expect(screen.queryByLabelText('Loading page')).not.toBeInTheDocument();
  });

  it('explains a page that could not be downloaded instead of showing a raw error', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          errorElement: <RouteErrorPage />,
          lazy: () =>
            Promise.reject(new TypeError('Failed to fetch dynamically imported module: /x.js')),
        },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This page could not be loaded. Check your connection, then reload the app.',
      ),
    );
    expect(screen.queryByText(/dynamically imported module/)).not.toBeInTheDocument();
  });
});
