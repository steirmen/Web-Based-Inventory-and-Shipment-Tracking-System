import { ArrowRight, Building2, Plus, Users } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/page-state';
import { RoleBadge } from '@/components/organization/role-badge';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useOrganizations } from '@/hooks/use-organizations';
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { workspace } from '@/i18n/messages/workspace';
import { pageTitle } from '@/lib/app-config';
import { paths } from '@/routes/paths';

/** All workspaces the signed-in user belongs to (as returned by the API). */
export function OrganizationsPage() {
  const query = useOrganizations();
  const m = useMessages(workspace).organizations;
  const f = useFormat();

  return (
    <div className="flex flex-col gap-8">
      <title>{pageTitle(m.pageTitle)}</title>
      <PageHeader
        title={m.title}
        description={m.description}
        actions={
          <Link to={paths.onboarding} className={buttonVariants({ variant: 'secondary' })}>
            <Plus aria-hidden="true" />
            {m.create}
          </Link>
        }
      />

      {query.isPending && <LoadingState label={m.loading} />}
      {query.isError && (
        <ErrorState title={m.loadError} error={query.error} onRetry={() => void query.refetch()} />
      )}
      {query.data?.organizations.length === 0 && (
        <EmptyState
          icon={<Building2 className="size-5" aria-hidden="true" />}
          title={m.empty}
          description={m.emptyText}
          action={
            <Link to={paths.onboarding} className={buttonVariants()}>
              {m.create}
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
                  {m.members({
                    count: organization.memberCount,
                    formatted: f.number(organization.memberCount),
                  })}
                </CardContent>
                <CardFooter>
                  <Link
                    to={paths.organization(organization.id)}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                    aria-label={m.openNamed({ name: organization.name })}
                  >
                    {m.open}
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
