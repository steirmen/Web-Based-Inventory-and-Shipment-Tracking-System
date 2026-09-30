import { ArrowRight, Building2, Plus, Users } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/page-state';
import { RoleBadge } from '@/components/organization/role-badge';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useOrganizations } from '@/hooks/use-organizations';
import { pageTitle } from '@/lib/app-config';
import { paths } from '@/routes/paths';

/** All workspaces the signed-in user belongs to (as returned by the API). */
export function OrganizationsPage() {
  const query = useOrganizations();

  return (
    <div className="flex flex-col gap-8">
      <title>{pageTitle('Workspaces')}</title>
      <PageHeader
        title="Your workspaces"
        description="Workspaces you're a member of. Open one to continue."
        actions={
          <Link to={paths.onboarding} className={buttonVariants({ variant: 'secondary' })}>
            <Plus aria-hidden="true" />
            Create workspace
          </Link>
        }
      />

      {query.isPending && <LoadingState label="Loading your workspaces" />}
      {query.isError && (
        <ErrorState
          title="We couldn't load your workspaces"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data?.organizations.length === 0 && (
        <EmptyState
          icon={<Building2 className="size-5" aria-hidden="true" />}
          title="No workspaces yet"
          description="Create a workspace, or ask a teammate to invite you to theirs."
          action={
            <Link to={paths.onboarding} className={buttonVariants()}>
              Create workspace
            </Link>
          }
        />
      )}

      {query.data && query.data.organizations.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.organizations.map((organization) => (
            <li key={organization.id}>
              <Card className="h-full">
                <CardHeader className="gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="min-w-0 truncate">{organization.name}</CardTitle>
                    <RoleBadge role={organization.role} />
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {organization.slug}
                  </p>
                </CardHeader>
                <CardContent className="mt-auto flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="size-4" aria-hidden="true" />
                  {organization.memberCount} {organization.memberCount === 1 ? 'member' : 'members'}
                </CardContent>
                <CardFooter>
                  <Link
                    to={paths.organization(organization.id)}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                    aria-label={`Open workspace ${organization.name}`}
                  >
                    Open workspace
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
