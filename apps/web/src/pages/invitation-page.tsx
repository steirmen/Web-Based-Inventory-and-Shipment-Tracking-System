import type { ApiErrorCode, MemberRole } from '@app/shared';
import { CircleX, MailOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '@/api/http-client';
import { LoadingState } from '@/components/layout/page-state';
import { RoleBadge } from '@/components/organization/role-badge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { useAuth, useLogout } from '@/hooks/use-auth';
import { useAcceptInvitation, useInvitation } from '@/hooks/use-invitation';
import type { Translation } from '@/i18n/define';
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { workspace } from '@/i18n/messages/workspace';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
import { paths } from '@/routes/paths';

type InvalidCode = keyof Translation<(typeof workspace)['en']>['invitation']['invalid'];

const isInvalidCode = (
  code: ApiErrorCode | '',
  titles: Record<InvalidCode, string>,
): code is InvalidCode => code in titles;

/**
 * /invite/:token — public. Shows the invitation, then lets the signed-in user
 * with the invited email accept it. The API validates the token and the email
 * again on acceptance; the client-side email comparison is only for guidance.
 */
export function InvitationPage() {
  const { token = '' } = useParams();
  const invitation = useInvitation(token);
  const auth = useAuth();
  const accept = useAcceptInvitation(token);
  const logout = useLogout();
  const navigate = useNavigate();
  const invitePath = paths.invitation(token);
  const m = useMessages(workspace).invitation;
  const errorMessage = useApiErrorMessage();

  if (invitation.isPending) {
    return (
      <Card className="shadow-raised">
        <title>{pageTitle(m.pageTitle)}</title>
        <LoadingState label={m.loading} />
      </Card>
    );
  }

  if (invitation.isError) {
    const code = invitation.error instanceof ApiError ? (invitation.error.code ?? '') : '';
    return (
      <InvitationCard
        icon={<CircleX className="size-5" aria-hidden="true" />}
        title={isInvalidCode(code, m.invalid) ? m.invalid[code] : m.loadError}
        description={errorMessage(invitation.error)}
        footer={
          <Link to={paths.home} className={buttonVariants({ variant: 'secondary' })}>
            {m.goToApp}
          </Link>
        }
      />
    );
  }

  const details = invitation.data.invitation;
  const redirectState = { from: invitePath, email: details.email };
  const emailMatches =
    auth.status === 'authenticated' && auth.user.email.toLowerCase() === details.email;
  const serverMismatch = hasErrorCode(accept.error, 'INVITATION_EMAIL_MISMATCH');
  const alreadyMember = hasErrorCode(accept.error, 'MEMBERSHIP_ALREADY_EXISTS');

  const onAccept = () =>
    accept.mutate(undefined, {
      onSuccess: ({ organization }) =>
        void navigate(paths.organization(organization.id), {
          replace: true,
          state: { notice: m.accepted({ name: organization.name }) },
        }),
    });

  let action: ReactNode;
  if (auth.status === 'loading') {
    action = <LoadingState label={m.checkingSession} className="min-h-0 py-2" />;
  } else if (auth.status !== 'authenticated') {
    action = (
      <div className="flex flex-col gap-3">
        <Alert tone="info">{m.signInFirst}</Alert>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            to={paths.login}
            state={redirectState}
            className={buttonVariants({ className: 'flex-1' })}
          >
            {m.signIn}
          </Link>
          <Link
            to={paths.register}
            state={redirectState}
            className={buttonVariants({ variant: 'secondary', className: 'flex-1' })}
          >
            {m.createAccount}
          </Link>
        </div>
      </div>
    );
  } else if (!emailMatches || serverMismatch) {
    action = (
      <div className="flex flex-col gap-3">
        <Alert tone="warning" title={m.otherEmailTitle}>
          {m.otherEmailText}
        </Alert>
        <Button
          variant="secondary"
          onClick={() => logout.mutate({ returnTo: invitePath, email: details.email })}
          isLoading={logout.isPending}
        >
          {m.switchAccount}
        </Button>
      </div>
    );
  } else if (alreadyMember) {
    action = (
      <div className="flex flex-col gap-3">
        <Alert tone="info">{m.alreadyMember}</Alert>
        <Link
          to={paths.organization(details.organization.id)}
          className={buttonVariants({ variant: 'secondary' })}
        >
          {m.openWorkspace}
        </Link>
      </div>
    );
  } else {
    action = (
      <div className="flex flex-col gap-3">
        {accept.isError && <Alert tone="danger">{errorMessage(accept.error)}</Alert>}
        <Button size="lg" className="w-full" onClick={onAccept} isLoading={accept.isPending}>
          {accept.isPending ? m.accepting : m.accept}
        </Button>
      </div>
    );
  }

  return (
    <InvitationCard
      icon={<MailOpen className="size-5" aria-hidden="true" />}
      title={m.title({ name: details.organization.name })}
      description={m.description}
      body={
        <InvitationDetails
          email={details.email}
          role={details.role}
          expiresAt={details.expiresAt}
        />
      }
      footer={<div className="w-full">{action}</div>}
    />
  );
}

function InvitationDetails({
  email,
  role,
  expiresAt,
}: {
  email: string;
  role: MemberRole;
  expiresAt: string;
}) {
  const m = useMessages(workspace).invitation;
  const f = useFormat();
  return (
    <dl className="divide-y divide-border rounded-control border border-border text-sm">
      <div className="flex items-center justify-between gap-4 px-4 py-2.5">
        <dt className="text-muted-foreground">{m.invitedEmail}</dt>
        <dd className="min-w-0 truncate font-medium">{email}</dd>
      </div>
      <div className="flex items-center justify-between gap-4 px-4 py-2.5">
        <dt className="text-muted-foreground">{m.role}</dt>
        <dd>
          <RoleBadge role={role} />
        </dd>
      </div>
      <div className="flex items-center justify-between gap-4 px-4 py-2.5">
        <dt className="text-muted-foreground">{m.expires}</dt>
        <dd>{f.dateTime(expiresAt)}</dd>
      </div>
    </dl>
  );
}

function InvitationCard({
  icon,
  title,
  description,
  body,
  footer,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  body?: ReactNode;
  footer: ReactNode;
}) {
  const m = useMessages(workspace).invitation;
  return (
    <Card className="shadow-raised">
      <title>{pageTitle(m.pageTitle)}</title>
      <CardHeader className="gap-1 pb-5">
        <div className="mb-3 flex size-10 items-center justify-center rounded-control bg-primary-soft text-primary-soft-foreground">
          {icon}
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {body && <CardContent>{body}</CardContent>}
      <CardFooter className="border-t-0 pt-0 pb-6">{footer}</CardFooter>
    </Card>
  );
}
