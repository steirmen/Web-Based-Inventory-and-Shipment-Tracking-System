/** Route paths. Link with these helpers instead of string literals. */
export const paths = {
  home: '/',
  login: '/login',
  register: '/register',
  healthCheck: '/health-check',
  organizations: '/organizations',
  onboarding: '/onboarding',
  /** Personal (user-level) appearance settings. */
  appearance: '/settings/appearance',
  organization: (organizationId: string) => `/org/${organizationId}`,
  organizationTeam: (organizationId: string) => `/org/${organizationId}/team`,
  organizationSettings: (organizationId: string) => `/org/${organizationId}/settings`,
  products: (organizationId: string) => `/org/${organizationId}/products`,
  productNew: (organizationId: string) => `/org/${organizationId}/products/new`,
  product: (organizationId: string, productId: string) =>
    `/org/${organizationId}/products/${productId}`,
  productEdit: (organizationId: string, productId: string) =>
    `/org/${organizationId}/products/${productId}/edit`,
  categories: (organizationId: string) => `/org/${organizationId}/categories`,
  warehouses: (organizationId: string) => `/org/${organizationId}/warehouses`,
  warehouse: (organizationId: string, warehouseId: string) =>
    `/org/${organizationId}/warehouses/${warehouseId}`,
  inventory: (organizationId: string) => `/org/${organizationId}/inventory`,
  stockMovements: (organizationId: string) => `/org/${organizationId}/stock-movements`,
  customers: (organizationId: string) => `/org/${organizationId}/customers`,
  customer: (organizationId: string, customerId: string) =>
    `/org/${organizationId}/customers/${customerId}`,
  orders: (organizationId: string) => `/org/${organizationId}/orders`,
  orderNew: (organizationId: string) => `/org/${organizationId}/orders/new`,
  order: (organizationId: string, orderId: string) => `/org/${organizationId}/orders/${orderId}`,
  orderEdit: (organizationId: string, orderId: string) =>
    `/org/${organizationId}/orders/${orderId}/edit`,
  invitation: (token: string) => `/invite/${token}`,
} as const;

/** Route patterns for the router table and `useMatch`. */
export const routePatterns = {
  organization: '/org/:organizationId',
  invitation: '/invite/:token',
} as const;
