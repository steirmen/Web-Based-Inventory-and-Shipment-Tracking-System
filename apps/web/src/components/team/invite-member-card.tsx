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
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { workspace } from '@/i18n/messages/workspace';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-errors';
import { serverFieldErrors, validateEmail } from '@/lib/auth-form';
import { useCurrentOrganization } from '@/lib/organization-context';

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
  const m = useMessages(workspace).invite;
  const c = useMessages(common);
  const errorMessage = useApiErrorMessage();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (create.isPending) return;
    const validation = validateEmail(email, c.authValidation);
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
            setEmailError(errorMessage(error));
          } else {
            setEmailError(serverFieldErrors(error, ['email'] as const, c.errors).email);
          }
        },
      },
    );
  };

  const formError = create.isError && !emailError ? errorMessage(create.error) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.title}</CardTitle>
        <CardDescription>{m.description}</CardDescription>
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
            <FormField label={m.email} error={emailError} className="flex-1">
              {(control) => (
                <Input
                  {...control}
                  type="email"
                  name="email"
                  autoComplete="off"
                  placeholder={m.emailPlaceholder}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setEmailError(undefined);
                  }}
                />
              )}
            </FormField>
            <FormField label={m.role} className="sm:w-36">
              {(control) => (
                <Select
                  {...control}
                  name="role"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as MemberRole)}
                >
                  {roles.map((option) => (
                    <option key={option} value={option}>
                      {c.roles[option]}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <Button type="submit" className="sm:mt-6" isLoading={create.isPending}>
              <Link2 aria-hidden="true" />
              {m.submit}
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
  const m = useMessages(workspace).invite;
  const c = useMessages(common);
  const f = useFormat();

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
      <Alert tone="success" title={m.createdTitle({ email: invitation.email })}>
        {m.createdText({
          role: c.roles[invitation.role],
          expires: f.dateTime(invitation.expiresAt),
        })}
      </Alert>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          readOnly
          aria-label={m.link}
          value={invitation.inviteUrl}
          className="font-mono text-xs"
          onFocus={(event) => event.target.select()}
        />
        <Button variant="secondary" onClick={() => void copy()} className="shrink-0">
          {copyState === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copyState === 'copied' ? m.copied : m.copy}
        </Button>
      </div>
      {copyState === 'failed' && <p className="text-xs text-muted-foreground">{m.copyFailed}</p>}
      <Button variant="ghost" size="sm" className="self-start" onClick={onDone}>
        {m.another}
      </Button>
    </div>
  );
}
