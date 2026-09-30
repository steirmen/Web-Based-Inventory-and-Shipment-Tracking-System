import { Navigate } from 'react-router';
import { ErrorState, LoadingState } from '@/components/layout/page-state';
import { useOrganizations } from '@/hooks/use-organizations';
import { readLastOrganizationId } from '@/lib/last-organization';
import { paths } from '@/routes/paths';

/**
 * `/` for signed-in users: no workspace → onboarding; the last opened workspace
 * (if still a membership) or the only one → that workspace; otherwise → the list.
 */
export function HomeRedirectPage() {
  const query = useOrganizations();

  if (query.isPending) {
    return <LoadingState label="Loading your workspaces" className="min-h-64" />;
  }
  if (query.isError) {
    return (
      <ErrorState
        title="We couldn't load your workspaces"
        error={query.error}
        onRetry={() => void query.refetch()}
        className="mx-auto max-w-lg py-12"
      />
    );
  }

  const { organizations } = query.data;
  if (organizations.length === 0) {
    return <Navigate to={paths.onboarding} replace />;
  }

  const lastId = readLastOrganizationId();
  const target =
    organizations.find((organization) => organization.id === lastId) ??
    (organizations.length === 1 ? organizations[0] : undefined);

  return <Navigate to={target ? paths.organization(target.id) : paths.organizations} replace />;
}
