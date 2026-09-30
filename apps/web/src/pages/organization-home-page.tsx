import { Settings, Users } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { RoleBadge } from '@/components/organization/role-badge';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useOrganizations } from '@/hooks/use-organizations';
import { pageTitle } from '@/lib/app-config';
import { useCurrentOrganization } from '@/lib/organization-context';
import { ROLE_DESCRIPTIONS } from '@/lib/organization-form';
import { paths } from '@/routes/paths';

interface HomeLocationState {
  notice?: string;
}

/** Temporary workspace home that proves the organization context works (not the dashboard). */
export function OrganizationHomePage() {
  const { organization, role } = useCurrentOrganization();
  const organizations = useOrganizations();
  const location = useLocation();
  const notice = (location.state as HomeLocationState | null)?.notice;

  const memberCount = organizations.data?.organizations.find(
    (entry) => entry.id === organization.id,
  )?.memberCount;

  return (
    <div className="flex flex-col gap-8">
      <title>{pageTitle(organization.name)}</title>
      {notice && <Alert tone="success">{notice}</Alert>}

      <PageHeader
        eyebrow="Workspace"
        title={organization.name}
        description="Workspace setup is ready."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Your role</CardTitle>
              <RoleBadge role={role} />
            </div>
            <CardDescription>{ROLE_DESCRIPTIONS[role]}</CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Team</CardTitle>
              <span className="text-2xl font-semibold tabular-nums" aria-label="Member count">
                {memberCount ?? '–'}
              </span>
            </div>
            <CardDescription>
              {memberCount === 1 ? '1 member' : `${memberCount ?? 'Loading'} members`} in this
              workspace.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What&apos;s next</CardTitle>
          <CardDescription>
            Product management will be added later. For now you can manage your team and workspace
            settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link
            to={paths.organizationTeam(organization.id)}
            className={buttonVariants({ variant: 'secondary' })}
          >
            <Users aria-hidden="true" />
            Team
          </Link>
          <Link
            to={paths.organizationSettings(organization.id)}
            className={buttonVariants({ variant: 'secondary' })}
          >
            <Settings aria-hidden="true" />
            Settings
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
