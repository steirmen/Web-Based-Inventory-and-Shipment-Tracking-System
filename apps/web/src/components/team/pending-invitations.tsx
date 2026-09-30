import type { Invitation } from '@app/shared';
import { MailPlus } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/page-state';
import { RoleBadge } from '@/components/organization/role-badge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useInvitations, useRevokeInvitation } from '@/hooks/use-organizations';
import { apiErrorMessage } from '@/lib/api-errors';
import { formatDate } from '@/lib/format';
import { useCurrentOrganization } from '@/lib/organization-context';

export function PendingInvitations() {
  const { organization, can } = useCurrentOrganization();
  const query = useInvitations(organization.id, { enabled: can('MEMBERS_INVITE') });
  const pending = query.data?.invitations.filter((invitation) => invitation.status === 'PENDING');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending invitations</CardTitle>
        <CardDescription>Invitations that haven&apos;t been accepted yet.</CardDescription>
      </CardHeader>
      <CardContent>
        {query.isPending && <LoadingState label="Loading invitations" className="min-h-24" />}
        {query.isError && (
          <ErrorState
            title="We couldn't load invitations"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
        {pending?.length === 0 && (
          <EmptyState
            icon={<MailPlus className="size-5" aria-hidden="true" />}
            title="No pending invitations"
          />
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

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{invitation.email}</span>
          <RoleBadge role={invitation.role} />
        </div>
        <p className="text-xs text-muted-foreground">
          Expires {formatDate(invitation.expiresAt)}
          {invitation.invitedBy && ` · Invited by ${invitation.invitedBy.name}`}
        </p>
        {revoke.isError && (
          <Alert tone="danger" className="mt-2">
            {apiErrorMessage(revoke.error)}
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
          aria-label={`Revoke invitation for ${invitation.email}`}
        >
          Revoke
        </Button>
      )}
    </li>
  );
}
