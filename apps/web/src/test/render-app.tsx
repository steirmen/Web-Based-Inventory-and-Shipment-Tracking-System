import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppearanceProvider } from '@/app/appearance-provider';
import { I18nProvider } from '@/app/i18n-provider';
import { createQueryClient } from '@/app/query-client';
import { routes } from '@/routes/router';

/**
 * Renders the real route table (guards, layouts, pages) at `path`, with fresh
 * app state and the same global providers as `AppProviders`.
 */
export function renderApp(path: string) {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, retry: false },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AppearanceProvider>
          <RouterProvider router={router} />
        </AppearanceProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );

  return { router, queryClient, user: userEvent.setup() };
}
