import { SearchX } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router';
import { ErrorState, LoadingState } from '@/components/layout/page-state';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent } from '@/components/ui/card';
import { useOrganization } from '@/hooks/use-organizations';
import { hasErrorCode } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
import { cn } from '@/lib/cn';
import { rememberLastOrganizationId } from '@/lib/last-organization';
import { createOrganizationContext, OrganizationContext } from '@/lib/organization-context';
import { paths } from '@/routes/paths';

/**
 * Frame for /org/:organizationId/*. The organization id comes from the URL; the
 * API decides whether the viewer may see it (404 for non-members), and returns
 * the viewer's role, which child pages use for display decisions only.
 */
export function OrganizationLayout() {
  const { organizationId = '' } = useParams();
  const query = useOrganization(organizationId);

  // Only ever render the organization the URL names: data for any other id is ignored.
  const context = useMemo(
    () =>
      query.data && query.data.organization.id === organizationId
        ? createOrganizationContext(query.data.organization, query.data.membership.role)
        : null,
    [query.data, organizationId],
  );

  useEffect(() => {
    if (context) rememberLastOrganizationId(context.organization.id);
  }, [context]);

  if (query.isPending) {
    return <LoadingState label="Loading workspace" className="min-h-64" />;
  }

  if (query.isError || !context) {
    if (hasErrorCode(query.error, 'ORGANIZATION_NOT_FOUND')) {
      return <WorkspaceNotFound />;
    }
    return (
      <ErrorState
        title="We couldn't load this workspace"
        error={query.error}
        onRetry={() => void query.refetch()}
        className="mx-auto max-w-lg py-12"
      />
    );
  }

  const tabs = [
    { to: paths.organization(organizationId), label: 'Overview', end: true },
    { to: paths.products(organizationId), label: 'Products', end: false },
    { to: paths.categories(organizationId), label: 'Categories', end: false },
    { to: paths.organizationTeam(organizationId), label: 'Team', end: false },
    { to: paths.organizationSettings(organizationId), label: 'Settings', end: false },
  ];

  return (
    <OrganizationContext value={context}>
      <div className="flex flex-col gap-8">
        <nav
          aria-label="Workspace"
          className="flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-border)]"
        >
          {tabs.map((tab) => (
            <NavLink
              key={tab.label}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium focus-ring transition-colors duration-150',
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground',
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        {/* Keyed by organization: switching workspaces remounts the page, so no local state
            (search input, open dialogs, pending mutations) carries over to another workspace. */}
        <Outlet key={organizationId} />
      </div>
    </OrganizationContext>
  );
}

function WorkspaceNotFound() {
  return (
    <Card className="mx-auto max-w-lg">
      <title>{pageTitle('Workspace not found')}</title>
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
          <SearchX className="size-5" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-semibold">Workspace not found</h1>
          <p className="text-sm text-muted-foreground">
            Workspace not found or you don&apos;t have access to it.
          </p>
        </div>
        <Link to={paths.organizations} className={buttonVariants({ variant: 'secondary' })}>
          View your workspaces
        </Link>
      </CardContent>
    </Card>
  );
}
