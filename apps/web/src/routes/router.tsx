import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppShell } from '@/layouts/app-shell';
import { AuthLayout } from '@/layouts/auth-layout';
import { OrganizationLayout } from '@/layouts/organization-layout';
import { HealthCheckPage } from '@/pages/health-check-page';
import { HomeRedirectPage } from '@/pages/home-redirect-page';
import { InvitationPage } from '@/pages/invitation-page';
import { LoginPage } from '@/pages/login-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { OnboardingPage } from '@/pages/onboarding-page';
import { OrganizationHomePage } from '@/pages/organization-home-page';
import { OrganizationSettingsPage } from '@/pages/organization-settings-page';
import { OrganizationsPage } from '@/pages/organizations-page';
import { RegisterPage } from '@/pages/register-page';
import { RouteErrorPage } from '@/pages/route-error-page';
import { TeamPage } from '@/pages/team-page';
import { RequireAuth, RequireGuest } from './guards';
import { paths, routePatterns } from './paths';

/**
 * - Guest-only (signed-in users are redirected away): /login, /register
 * - Public: /invite/:token, /health-check, 404
 * - Authenticated: /, /organizations, /onboarding, /org/:organizationId/*
 *
 * The organization in /org/:organizationId/* is taken from the URL, but only
 * the API decides whether the user may access it.
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
        element: <AuthLayout />,
        children: [{ path: routePatterns.invitation, element: <InvitationPage /> }],
      },
      {
        element: <AppShell />,
        children: [
          {
            element: <RequireAuth />,
            children: [
              { path: paths.home, element: <HomeRedirectPage /> },
              { path: paths.organizations, element: <OrganizationsPage /> },
              { path: paths.onboarding, element: <OnboardingPage /> },
              {
                path: routePatterns.organization,
                element: <OrganizationLayout />,
                children: [
                  { index: true, element: <OrganizationHomePage /> },
                  { path: 'team', element: <TeamPage /> },
                  { path: 'settings', element: <OrganizationSettingsPage /> },
                ],
              },
            ],
          },
          { path: paths.healthCheck, element: <HealthCheckPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
