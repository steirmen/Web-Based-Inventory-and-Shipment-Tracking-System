import type { Invitation } from '@app/shared';
import { MailPlus } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/page-state';
import { RoleBadge } from '@/components/organization/role-badge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useInvitations, useRevokeInvitation } from '@/hooks/use-organizations';
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { workspace } from '@/i18n/messages/workspace';
import { useApiErrorMessage } from '@/lib/api-errors';
import { useCurrentOrganization } from '@/lib/organization-context';

export function PendingInvitations() {
  const { organization, can } = useCurrentOrganization();
  const query = useInvitations(organization.id, { enabled: can('MEMBERS_INVITE') });
  const pending = query.data?.invitations.filter((invitation) => invitation.status === 'PENDING');
  const m = useMessages(workspace).pending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.title}</CardTitle>
        <CardDescription>{m.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {query.isPending && <LoadingState label={m.loading} className="min-h-24" />}
        {query.isError && (
          <ErrorState
            title={m.loadError}
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
        {pending?.length === 0 && (
          <EmptyState icon={<MailPlus className="size-5" aria-hidden="true" />} title={m.empty} />
        )}
        {pending && pending.length > 0 && (
          <ul className="divide-y divide-border rounded-control border border-border">
            {pending.map((invitation) => (
              <InvitationRow key={invitation.id} invitation={invitation} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function InvitationRow({ invitation }: { invitation: Invitation }) {
  const { organization, canManage } = useCurrentOrganization();
  const revoke = useRevokeInvitation(organization.id);
  const m = useMessages(workspace).pending;
  const f = useFormat();
  const errorMessage = useApiErrorMessage();

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{invitation.email}</span>
          <RoleBadge role={invitation.role} />
        </div>
        <p className="text-xs text-muted-foreground">
          {m.expires({ date: f.date(invitation.expiresAt) })}
          {invitation.invitedBy && m.invitedBy({ name: invitation.invitedBy.name })}
        </p>
        {revoke.isError && (
          <Alert tone="danger" className="mt-2">
            {errorMessage(revoke.error)}
          </Alert>
        )}
      </div>
      {canManage(invitation.role) && (
        <Button
          variant="secondary"
          size="sm"
          className="self-start sm:self-center"
          onClick={() => revoke.mutate(invitation.id)}
          isLoading={revoke.isPending}
          aria-label={m.revokeFor({ email: invitation.email })}
        >
          {m.revoke}
        </Button>
      )}
    </li>
  );
}
