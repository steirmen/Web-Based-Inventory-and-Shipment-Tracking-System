import { ASSIGNABLE_ROLES, type Member, type MemberRole } from '@app/shared';
import { Crown, UserMinus } from 'lucide-react';
import { useState } from 'react';
import { RoleBadge } from '@/components/organization/role-badge';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  useChangeMemberRole,
  useRemoveMember,
  useTransferOwnership,
} from '@/hooks/use-organizations';
import { apiErrorMessage } from '@/lib/api-errors';
import { formatDate } from '@/lib/format';
import { useCurrentOrganization } from '@/lib/organization-context';
import { ROLE_LABELS } from '@/lib/organization-form';

type Confirmation = 'remove' | 'transfer' | null;

/**
 * One team member with the actions the viewer's role allows. Hidden controls
 * are UX only — the API enforces the same rules.
 */
export function MemberRow({ member, isSelf }: { member: Member; isSelf: boolean }) {
  const { organization, role: viewerRole, can, canManage } = useCurrentOrganization();
  const changeRole = useChangeMemberRole(organization.id);
  const remove = useRemoveMember(organization.id);
  const transfer = useTransferOwnership(organization.id);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);

  const manageable = !isSelf && canManage(member.role);
  const roleOptions = ASSIGNABLE_ROLES[viewerRole];
  const canChangeRole =
    manageable &&
    can('MEMBERS_UPDATE_ROLE') &&
    roleOptions.some((option) => option !== member.role);
  const canRemove = manageable && can('MEMBERS_REMOVE');
  const canTransfer = !isSelf && member.role !== 'OWNER' && can('OWNERSHIP_TRANSFER');
  const error = changeRole.error ?? remove.error ?? transfer.error;

  return (
    <li className="flex flex-col gap-3 px-4 py-4 md:grid md:grid-cols-[minmax(0,1fr)_9rem_8rem_14rem] md:items-center md:gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-foreground">{member.name}</span>
          {isSelf && <Badge tone="primary">You</Badge>}
        </div>
        <span className="block truncate text-sm text-muted-foreground">{member.email}</span>
      </div>

      <div className="flex items-center gap-2">
        {canChangeRole ? (
          <>
            <Select
              aria-label={`Role for ${member.name}`}
              value={member.role}
              disabled={changeRole.isPending}
              wrapperClassName="w-full max-w-40 md:w-36"
              onChange={(event) =>
                changeRole.mutate({ memberId: member.id, role: event.target.value as MemberRole })
              }
            >
              {roleOptions.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABELS[option]}
                </option>
              ))}
            </Select>
            {changeRole.isPending && <Spinner size="sm" label="Updating role" />}
          </>
        ) : (
          <RoleBadge role={member.role} />
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        <span className="md:hidden">Joined </span>
        {formatDate(member.createdAt)}
      </div>

      <div className="flex flex-wrap gap-2 md:justify-end">
        {canTransfer && (
          <Button variant="ghost" size="sm" onClick={() => setConfirmation('transfer')}>
            <Crown aria-hidden="true" />
            Make owner
          </Button>
        )}
        {canRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger hover:bg-danger-soft hover:text-danger"
            onClick={() => setConfirmation('remove')}
            aria-label={`Remove ${member.name}`}
          >
            <UserMinus aria-hidden="true" />
            Remove
          </Button>
        )}
      </div>

      {error && confirmation === null && (
        <Alert tone="danger" className="md:col-span-4">
          {apiErrorMessage(error)}
        </Alert>
      )}

      {confirmation === 'remove' && (
        <Confirm
          tone="danger"
          title={`Remove ${member.name}?`}
          description={`They'll lose access to ${organization.name} immediately. Their account isn't deleted.`}
          confirmLabel="Remove member"
          pending={remove.isPending}
          error={remove.error}
          onCancel={() => {
            remove.reset();
            setConfirmation(null);
          }}
          onConfirm={() => remove.mutate(member.id)}
        />
      )}

      {confirmation === 'transfer' && (
        <Confirm
          tone="warning"
          title={`Make ${member.name} the owner?`}
          description="You'll become an admin. Only the new owner can transfer ownership again."
          confirmLabel="Transfer ownership"
          pending={transfer.isPending}
          error={transfer.error}
          onCancel={() => {
            transfer.reset();
            setConfirmation(null);
          }}
          onConfirm={() => transfer.mutate(member.id, { onSuccess: () => setConfirmation(null) })}
        />
      )}
    </li>
  );
}

function Confirm({
  tone,
  title,
  description,
  confirmLabel,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  tone: 'danger' | 'warning';
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  error: Error | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 md:col-span-4">
      <Alert tone={tone} title={title}>
        {description}
        {error && <p className="mt-1 font-medium">{apiErrorMessage(error)}</p>}
      </Alert>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant={tone === 'danger' ? 'danger' : 'primary'}
          size="sm"
          onClick={onConfirm}
          isLoading={pending}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
