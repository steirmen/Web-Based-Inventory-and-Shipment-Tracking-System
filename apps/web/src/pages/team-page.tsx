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
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { workspace } from '@/i18n/messages/workspace';
import { pageTitle } from '@/lib/app-config';
import { useCurrentOrganization } from '@/lib/organization-context';

export function TeamPage() {
  const { organization, can } = useCurrentOrganization();
  const auth = useAuth();
  const members = useMembers(organization.id);
  const viewerId = auth.status === 'authenticated' ? auth.user.id : null;
  const canManageTeam = can('MEMBERS_INVITE') || can('MEMBERS_REMOVE');
  const m = useMessages(workspace).team;
  const f = useFormat();

  return (
    <div className="flex flex-col gap-8">
      <title>{pageTitle(`${m.title} · ${organization.name}`)}</title>
      <PageHeader title={m.title} description={m.description} />

      {!canManageTeam && <Alert tone="info">{m.viewOnly}</Alert>}

      <Can permission="MEMBERS_INVITE">
        <InviteMemberCard />
      </Can>

      <Card>
        <CardHeader>
          <CardTitle>{m.members}</CardTitle>
          <CardDescription>
            {members.data
              ? m.memberCount({
                  count: members.data.members.length,
                  formatted: f.number(members.data.members.length),
                })
              : m.everyone}
          </CardDescription>
        </CardHeader>

        {members.isPending && <LoadingState label={m.loading} className="min-h-32" />}
        {members.isError && (
          <div className="px-6 pb-6">
            <ErrorState
              title={m.loadError}
              error={members.error}
              onRetry={() => void members.refetch()}
            />
          </div>
        )}
        {members.data?.members.length === 0 && (
          <div className="px-6 pb-6">
            <EmptyState icon={<Users className="size-5" aria-hidden="true" />} title={m.empty} />
          </div>
        )}
        {members.data && members.data.members.length > 0 && (
          <div className="border-t border-border">
            <div
              className="hidden grid-cols-[minmax(0,1fr)_9rem_8rem_14rem] gap-4 border-b border-border bg-surface-muted/60 px-4 py-2 text-xs font-medium text-muted-foreground md:grid"
              aria-hidden="true"
            >
              <span>{m.name}</span>
              <span>{m.role}</span>
              <span>{m.joined}</span>
              <span className="text-right">{m.actions}</span>
            </div>
            <ul aria-label={m.members} className="divide-y divide-border">
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
