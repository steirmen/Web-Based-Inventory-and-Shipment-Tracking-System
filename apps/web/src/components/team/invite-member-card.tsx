import { ASSIGNABLE_ROLES, type CreatedInvitationResponse, type MemberRole } from '@app/shared';
import { Check, Copy, Link2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useCreateInvitation } from '@/hooks/use-organizations';
import { apiErrorMessage, hasErrorCode } from '@/lib/api-errors';
import { serverFieldErrors, validateEmail } from '@/lib/auth-form';
import { formatDateTime } from '@/lib/format';
import { useCurrentOrganization } from '@/lib/organization-context';
import { ROLE_LABELS } from '@/lib/organization-form';

type CreatedInvitation = CreatedInvitationResponse['invitation'];

/**
 * Creates an invitation link (no email is sent in this version). The link
 * contains a one-time secret and is shown once.
 */
export function InviteMemberCard() {
  const { organization, role } = useCurrentOrganization();
  const roles = ASSIGNABLE_ROLES[role];
  const create = useCreateInvitation(organization.id);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRole>(
    roles.includes('STAFF') ? 'STAFF' : roles[0],
  );
  const [emailError, setEmailError] = useState<string>();
  const [created, setCreated] = useState<CreatedInvitation | null>(null);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (create.isPending) return;
    const validation = validateEmail(email);
    setEmailError(validation);
    if (validation) return;

    create.mutate(
      { email: email.trim(), role: inviteRole },
      {
        onSuccess: ({ invitation }) => {
          setCreated(invitation);
          setEmail('');
        },
        onError: (error) => {
          if (
            hasErrorCode(error, 'MEMBERSHIP_ALREADY_EXISTS') ||
            hasErrorCode(error, 'INVITATION_ALREADY_PENDING')
          ) {
            setEmailError(apiErrorMessage(error));
          } else {
            setEmailError(serverFieldErrors(error, ['email'] as const).email);
          }
        },
      },
    );
  };

  const formError = create.isError && !emailError ? apiErrorMessage(create.error) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite a member</CardTitle>
        <CardDescription>
          Create an invite link and share it with your teammate. They sign in with the invited email
          to join.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {created ? (
          <InviteLink
            invitation={created}
            onDone={() => {
              setCreated(null);
              create.reset();
            }}
          />
        ) : (
          <form
            noValidate
            onSubmit={onSubmit}
            className="flex flex-col gap-4 sm:flex-row sm:items-start"
          >
            <FormField label="Email" error={emailError} className="flex-1">
              {(control) => (
                <Input
                  {...control}
                  type="email"
                  name="email"
                  autoComplete="off"
                  placeholder="teammate@company.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setEmailError(undefined);
                  }}
                />
              )}
            </FormField>
            <FormField label="Role" className="sm:w-36">
              {(control) => (
                <Select
                  {...control}
                  name="role"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as MemberRole)}
                >
                  {roles.map((option) => (
                    <option key={option} value={option}>
                      {ROLE_LABELS[option]}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <Button type="submit" className="sm:mt-6" isLoading={create.isPending}>
              <Link2 aria-hidden="true" />
              Create invite link
            </Button>
          </form>
        )}
        {formError && <Alert tone="danger">{formError}</Alert>}
      </CardContent>
    </Card>
  );
}

function InviteLink({ invitation, onDone }: { invitation: CreatedInvitation; onDone: () => void }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invitation.inviteUrl);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Alert tone="success" title={`Invite link created for ${invitation.email}`}>
        Share this link with them as {ROLE_LABELS[invitation.role].toLowerCase()}. It&apos;s shown
        only once and expires {formatDateTime(invitation.expiresAt)}.
      </Alert>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          readOnly
          aria-label="Invite link"
          value={invitation.inviteUrl}
          className="font-mono text-xs"
          onFocus={(event) => event.target.select()}
        />
        <Button variant="secondary" onClick={() => void copy()} className="shrink-0">
          {copyState === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copyState === 'copied' ? 'Copied' : 'Copy link'}
        </Button>
      </div>
      {copyState === 'failed' && (
        <p className="text-xs text-muted-foreground">
          Copying isn&apos;t available here. Select the link and copy it manually.
        </p>
      )}
      <Button variant="ghost" size="sm" className="self-start" onClick={onDone}>
        Invite someone else
      </Button>
    </div>
  );
}
