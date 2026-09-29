import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppShell } from '@/layouts/app-shell';
import { AuthLayout } from '@/layouts/auth-layout';
import { HealthCheckPage } from '@/pages/health-check-page';
import { HomePage } from '@/pages/home-page';
import { LoginPage } from '@/pages/login-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { RegisterPage } from '@/pages/register-page';
import { RouteErrorPage } from '@/pages/route-error-page';
import { RequireAuth, RequireGuest } from './guards';
import { paths } from './paths';

/**
 * - Guest-only (signed-in users are redirected away): /login, /register
 * - Authenticated-only (visitors are redirected to /login): /
 * - Public: /health-check, 404
 */
export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <RequireGuest />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: paths.login, element: <LoginPage /> },
              { path: paths.register, element: <RegisterPage /> },
            ],
          },
        ],
      },
      {
        element: <AppShell />,
        children: [
          {
            element: <RequireAuth />,
            children: [{ path: paths.home, element: <HomePage /> }],
          },
          { path: paths.healthCheck, element: <HealthCheckPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
