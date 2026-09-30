/** Route paths. Link with these helpers instead of string literals. */
export const paths = {
  home: '/',
  login: '/login',
  register: '/register',
  healthCheck: '/health-check',
  organizations: '/organizations',
  onboarding: '/onboarding',
  organization: (organizationId: string) => `/org/${organizationId}`,
  organizationTeam: (organizationId: string) => `/org/${organizationId}/team`,
  organizationSettings: (organizationId: string) => `/org/${organizationId}/settings`,
  invitation: (token: string) => `/invite/${token}`,
} as const;

/** Route patterns for the router table and `useMatch`. */
export const routePatterns = {
  organization: '/org/:organizationId',
  invitation: '/invite/:token',
} as const;
