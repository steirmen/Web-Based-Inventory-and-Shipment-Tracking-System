import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppShell } from '@/layouts/app-shell';
import { HealthCheckPage } from '@/pages/health-check-page';
import { HomePage } from '@/pages/home-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { RouteErrorPage } from '@/pages/route-error-page';
import { paths } from './paths';

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: paths.home, element: <HomePage /> },
      { path: paths.healthCheck, element: <HealthCheckPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
