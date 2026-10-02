import { SearchX } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link, Outlet, useParams } from 'react-router';
import { ErrorState, LoadingState } from '@/components/layout/page-state';
import { WorkspaceNav } from '@/components/organization/workspace-nav';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent } from '@/components/ui/card';
import { useOrganization } from '@/hooks/use-organizations';
import { hasErrorCode } from '@/lib/api-errors';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { pageTitle } from '@/lib/app-config';
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
  const m = useMessages(common).shell;

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
        title={m.workspaceLoadError}
        error={query.error}
        onRetry={() => void query.refetch()}
        className="mx-auto max-w-lg py-12"
      />
    );
  }

  return (
    <OrganizationContext value={context}>
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:gap-10">
        <WorkspaceNav organizationId={organizationId} />
        {/* Keyed by organization: switching workspaces remounts the page, so no local state
            (search input, open dialogs, pending mutations) carries over to another workspace. */}
        <div className="@container min-w-0">
          <Outlet key={organizationId} />
        </div>
      </div>
    </OrganizationContext>
  );
}

function WorkspaceNotFound() {
  const m = useMessages(common).shell;
  return (
    <Card className="mx-auto max-w-lg">
      <title>{pageTitle(m.workspaceNotFound)}</title>
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
          <SearchX className="size-5" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-semibold">Workspace not found</h1>
          <p className="text-sm text-muted-foreground">{m.workspaceNotFoundText}</p>
        </div>
        <Link to={paths.organizations} className={buttonVariants({ variant: 'secondary' })}>
          {m.viewYourWorkspaces}
        </Link>
      </CardContent>
    </Card>
  );
}
