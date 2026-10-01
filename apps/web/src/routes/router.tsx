import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { RouteLoading } from '@/components/layout/route-loading';
import { AppShell } from '@/layouts/app-shell';
import { AuthLayout } from '@/layouts/auth-layout';
import { OrganizationLayout } from '@/layouts/organization-layout';
import { HomeRedirectPage } from '@/pages/home-redirect-page';
import { LoginPage } from '@/pages/login-page';
import { NotFoundPage } from '@/pages/not-found-page';
import { RegisterPage } from '@/pages/register-page';
import { RouteErrorPage } from '@/pages/route-error-page';
import { RequireAuth, RequireGuest } from './guards';
import { paths, routePatterns } from './paths';

/**
 * Route-level code splitting: a page module is downloaded the first time one
 * of its routes is visited (one chunk per page, shared code in common chunks).
 * The router loads the chunk BEFORE it switches pages, so the current page
 * stays on screen and `RouteProgress` (in the shell) shows a slim progress bar
 * instead of a blank fallback. Shell, layouts, guards, and the sign-in pages
 * stay in the entry bundle.
 */
function page<Name extends string>(
  load: () => Promise<Record<Name, ComponentType>>,
  name: Name,
): RouteObject['lazy'] {
  return async () => ({ Component: (await load())[name] });
}

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
    // Shown only on a cold start whose first route is still downloading.
    hydrateFallbackElement: <RouteLoading />,
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
        children: [
          {
            path: routePatterns.invitation,
            lazy: page(() => import('@/pages/invitation-page'), 'InvitationPage'),
          },
        ],
      },
      {
        element: <AppShell />,
        children: [
          {
            element: <RequireAuth />,
            children: [
              { path: paths.home, element: <HomeRedirectPage /> },
              {
                path: paths.organizations,
                lazy: page(() => import('@/pages/organizations-page'), 'OrganizationsPage'),
              },
              {
                path: paths.onboarding,
                lazy: page(() => import('@/pages/onboarding-page'), 'OnboardingPage'),
              },
              {
                path: paths.appearance,
                lazy: page(() => import('@/pages/appearance-page'), 'AppearancePage'),
              },
              {
                path: routePatterns.organization,
                element: <OrganizationLayout />,
                children: [
                  {
                    index: true,
                    lazy: page(() => import('@/pages/dashboard-page'), 'DashboardPage'),
                  },
                  {
                    path: 'products',
                    lazy: page(() => import('@/pages/products-page'), 'ProductsPage'),
                  },
                  {
                    path: 'products/new',
                    lazy: page(() => import('@/pages/product-new-page'), 'ProductNewPage'),
                  },
                  {
                    path: 'products/:productId',
                    lazy: page(() => import('@/pages/product-detail-page'), 'ProductDetailPage'),
                  },
                  {
                    path: 'products/:productId/edit',
                    lazy: page(() => import('@/pages/product-edit-page'), 'ProductEditPage'),
                  },
                  {
                    path: 'categories',
                    lazy: page(() => import('@/pages/categories-page'), 'CategoriesPage'),
                  },
                  {
                    path: 'warehouses',
                    lazy: page(() => import('@/pages/warehouses-page'), 'WarehousesPage'),
                  },
                  {
                    path: 'warehouses/:warehouseId',
                    lazy: page(
                      () => import('@/pages/warehouse-detail-page'),
                      'WarehouseDetailPage',
                    ),
                  },
                  {
                    path: 'inventory',
                    lazy: page(() => import('@/pages/inventory-page'), 'InventoryPage'),
                  },
                  {
                    path: 'stock-movements',
                    lazy: page(() => import('@/pages/stock-movements-page'), 'StockMovementsPage'),
                  },
                  {
                    path: 'reports',
                    children: [
                      { index: true, element: <Navigate to="sales" replace /> },
                      {
                        path: 'sales',
                        lazy: page(
                          () => import('@/pages/reports/sales-report-page'),
                          'SalesReportPage',
                        ),
                      },
                      {
                        path: 'orders',
                        lazy: page(
                          () => import('@/pages/reports/orders-report-page'),
                          'OrdersReportPage',
                        ),
                      },
                      {
                        path: 'inventory',
                        lazy: page(
                          () => import('@/pages/reports/inventory-report-page'),
                          'InventoryReportPage',
                        ),
                      },
                    ],
                  },
                  {
                    path: 'customers',
                    lazy: page(() => import('@/pages/customers-page'), 'CustomersPage'),
                  },
                  {
                    path: 'customers/:customerId',
                    lazy: page(() => import('@/pages/customer-detail-page'), 'CustomerDetailPage'),
                  },
                  {
                    path: 'orders',
                    lazy: page(() => import('@/pages/orders-page'), 'OrdersPage'),
                  },
                  {
                    path: 'orders/new',
                    lazy: page(() => import('@/pages/order-new-page'), 'OrderNewPage'),
                  },
                  {
                    path: 'orders/:orderId',
                    lazy: page(() => import('@/pages/order-detail-page'), 'OrderDetailPage'),
                  },
                  {
                    path: 'orders/:orderId/edit',
                    lazy: page(() => import('@/pages/order-edit-page'), 'OrderEditPage'),
                  },
                  { path: 'team', lazy: page(() => import('@/pages/team-page'), 'TeamPage') },
                  {
                    path: 'settings',
                    lazy: page(
                      () => import('@/pages/organization-settings-page'),
                      'OrganizationSettingsPage',
                    ),
                  },
                ],
              },
            ],
          },
          {
            path: paths.healthCheck,
            lazy: page(() => import('@/pages/health-check-page'), 'HealthCheckPage'),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
