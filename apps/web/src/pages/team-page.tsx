import { Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/page-state';
import { Can } from '@/components/organization/can';
import { InviteMemberCard } from '@/components/team/invite-member-card';
import { MemberRow } from '@/components/team/member-row';
import { PendingInvitations } from '@/components/team/pending-invitations';
import { Alert } from '@/components/ui/alert';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { useMembers } from '@/hooks/use-organizations';
import { pageTitle } from '@/lib/app-config';
import { useCurrentOrganization } from '@/lib/organization-context';

export function TeamPage() {
  const { organization, can } = useCurrentOrganization();
  const auth = useAuth();
  const members = useMembers(organization.id);
  const viewerId = auth.status === 'authenticated' ? auth.user.id : null;
  const canManageTeam = can('MEMBERS_INVITE') || can('MEMBERS_REMOVE');

  return (
    <div className="flex flex-col gap-8">
      <title>{pageTitle(`Team · ${organization.name}`)}</title>
      <PageHeader title="Team" description="Everyone with access to this workspace." />

      {!canManageTeam && (
        <Alert tone="info">
          You have view-only access to the team. Owners and admins manage members.
        </Alert>
      )}

      <Can permission="MEMBERS_INVITE">
        <InviteMemberCard />
      </Can>

      <Card>
        <CardHeader>
          <CardTitle>Team members</CardTitle>
          <CardDescription>
            {members.data
              ? `${members.data.members.length} ${members.data.members.length === 1 ? 'member' : 'members'}`
              : 'Everyone in this workspace.'}
          </CardDescription>
        </CardHeader>

        {members.isPending && <LoadingState label="Loading members" className="min-h-32" />}
        {members.isError && (
          <div className="px-6 pb-6">
            <ErrorState
              title="We couldn't load the team"
              error={members.error}
              onRetry={() => void members.refetch()}
            />
          </div>
        )}
        {members.data?.members.length === 0 && (
          <div className="px-6 pb-6">
            <EmptyState icon={<Users className="size-5" aria-hidden="true" />} title="No members" />
          </div>
        )}
        {members.data && members.data.members.length > 0 && (
          <div className="border-t border-border">
            <div
              className="hidden grid-cols-[minmax(0,1fr)_9rem_8rem_14rem] gap-4 border-b border-border bg-surface-muted/60 px-4 py-2 text-xs font-medium text-muted-foreground md:grid"
              aria-hidden="true"
            >
              <span>Name</span>
              <span>Role</span>
              <span>Joined</span>
              <span className="text-right">Actions</span>
            </div>
            <ul aria-label="Team members" className="divide-y divide-border">
              {members.data.members.map((member) => (
                <MemberRow key={member.id} member={member} isSelf={member.userId === viewerId} />
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Can permission="MEMBERS_INVITE">
        <PendingInvitations />
      </Can>
    </div>
  );
}
