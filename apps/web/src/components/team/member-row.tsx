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
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { workspace } from '@/i18n/messages/workspace';
import { useApiErrorMessage } from '@/lib/api-errors';
import { useCurrentOrganization } from '@/lib/organization-context';

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
  const m = useMessages(workspace).member;
  const c = useMessages(common);
  const f = useFormat();
  const errorMessage = useApiErrorMessage();

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
          {isSelf && <Badge tone="primary">{m.you}</Badge>}
        </div>
        <span className="block truncate text-sm text-muted-foreground">{member.email}</span>
      </div>

      <div className="flex items-center gap-2">
        {canChangeRole ? (
          <>
            <Select
              aria-label={m.roleFor({ name: member.name })}
              value={member.role}
              disabled={changeRole.isPending}
              wrapperClassName="w-full max-w-40 md:w-36"
              onChange={(event) =>
                changeRole.mutate({ memberId: member.id, role: event.target.value as MemberRole })
              }
            >
              {roleOptions.map((option) => (
                <option key={option} value={option}>
                  {c.roles[option]}
                </option>
              ))}
            </Select>
            {changeRole.isPending && <Spinner size="sm" label={m.updatingRole} />}
          </>
        ) : (
          <RoleBadge role={member.role} />
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        <span className="md:hidden">{m.joined} </span>
        {f.date(member.createdAt)}
      </div>

      <div className="flex flex-wrap gap-2 md:justify-end">
        {canTransfer && (
          <Button variant="ghost" size="sm" onClick={() => setConfirmation('transfer')}>
            <Crown aria-hidden="true" />
            {m.makeOwner}
          </Button>
        )}
        {canRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger hover:bg-danger-soft hover:text-danger"
            onClick={() => setConfirmation('remove')}
            aria-label={m.removeNamed({ name: member.name })}
          >
            <UserMinus aria-hidden="true" />
            {m.remove}
          </Button>
        )}
      </div>

      {error && confirmation === null && (
        <Alert tone="danger" className="md:col-span-4">
          {errorMessage(error)}
        </Alert>
      )}

      {confirmation === 'remove' && (
        <Confirm
          tone="danger"
          title={m.removeTitle({ name: member.name })}
          description={m.removeText({ organization: organization.name })}
          confirmLabel={m.removeConfirm}
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
          title={m.transferTitle({ name: member.name })}
          description={m.transferText}
          confirmLabel={m.transferConfirm}
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
  const c = useMessages(common);
  const errorMessage = useApiErrorMessage();
  return (
    <div className="flex flex-col gap-3 md:col-span-4">
      <Alert tone={tone} title={title}>
        {description}
        {error && <p className="mt-1 font-medium">{errorMessage(error)}</p>}
      </Alert>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
          {c.actions.cancel}
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
