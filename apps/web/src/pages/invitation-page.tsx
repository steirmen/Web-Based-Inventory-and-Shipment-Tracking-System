import type { MemberRole } from '@app/shared';
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
import { apiErrorMessage, hasErrorCode } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
import { formatDateTime } from '@/lib/format';
import { paths } from '@/routes/paths';

const INVALID_TITLES: Record<string, string> = {
  INVITATION_EXPIRED: 'This invitation has expired',
  INVITATION_REVOKED: 'This invitation is no longer valid',
  INVITATION_ALREADY_ACCEPTED: 'This invitation has already been used',
  INVITATION_NOT_FOUND: 'Invitation not found',
};

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

  if (invitation.isPending) {
    return (
      <Card className="shadow-raised">
        <title>{pageTitle('Invitation')}</title>
        <LoadingState label="Loading invitation" />
      </Card>
    );
  }

  if (invitation.isError) {
    const code = invitation.error instanceof ApiError ? (invitation.error.code ?? '') : '';
    return (
      <InvitationCard
        icon={<CircleX className="size-5" aria-hidden="true" />}
        title={INVALID_TITLES[code] ?? "We couldn't load this invitation"}
        description={apiErrorMessage(invitation.error)}
        footer={
          <Link to={paths.home} className={buttonVariants({ variant: 'secondary' })}>
            Go to the app
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
          state: { notice: `Invitation accepted. Welcome to ${organization.name}!` },
        }),
    });

  let action: ReactNode;
  if (auth.status === 'loading') {
    action = <LoadingState label="Checking your session" className="min-h-0 py-2" />;
  } else if (auth.status !== 'authenticated') {
    action = (
      <div className="flex flex-col gap-3">
        <Alert tone="info">Please sign in with the invited email to accept.</Alert>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            to={paths.login}
            state={redirectState}
            className={buttonVariants({ className: 'flex-1' })}
          >
            Sign in
          </Link>
          <Link
            to={paths.register}
            state={redirectState}
            className={buttonVariants({ variant: 'secondary', className: 'flex-1' })}
          >
            Create account
          </Link>
        </div>
      </div>
    );
  } else if (!emailMatches || serverMismatch) {
    action = (
      <div className="flex flex-col gap-3">
        <Alert tone="warning" title="This invitation was sent to another email address.">
          Sign out, then sign in with the invited email address to accept it.
        </Alert>
        <Button
          variant="secondary"
          onClick={() => logout.mutate({ returnTo: invitePath, email: details.email })}
          isLoading={logout.isPending}
        >
          Sign out and switch account
        </Button>
      </div>
    );
  } else if (alreadyMember) {
    action = (
      <div className="flex flex-col gap-3">
        <Alert tone="info">You&apos;re already a member of this workspace.</Alert>
        <Link
          to={paths.organization(details.organization.id)}
          className={buttonVariants({ variant: 'secondary' })}
        >
          Open workspace
        </Link>
      </div>
    );
  } else {
    action = (
      <div className="flex flex-col gap-3">
        {accept.isError && <Alert tone="danger">{apiErrorMessage(accept.error)}</Alert>}
        <Button size="lg" className="w-full" onClick={onAccept} isLoading={accept.isPending}>
          {accept.isPending ? 'Accepting…' : 'Accept invitation'}
        </Button>
      </div>
    );
  }

  return (
    <InvitationCard
      icon={<MailOpen className="size-5" aria-hidden="true" />}
      title={`Join ${details.organization.name}`}
      description="You've been invited to a workspace."
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
  return (
    <dl className="divide-y divide-border rounded-control border border-border text-sm">
      <div className="flex items-center justify-between gap-4 px-4 py-2.5">
        <dt className="text-muted-foreground">Invited email</dt>
        <dd className="min-w-0 truncate font-medium">{email}</dd>
      </div>
      <div className="flex items-center justify-between gap-4 px-4 py-2.5">
        <dt className="text-muted-foreground">Role</dt>
        <dd>
          <RoleBadge role={role} />
        </dd>
      </div>
      <div className="flex items-center justify-between gap-4 px-4 py-2.5">
        <dt className="text-muted-foreground">Expires</dt>
        <dd>{formatDateTime(expiresAt)}</dd>
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
  return (
    <Card className="shadow-raised">
      <title>{pageTitle('Invitation')}</title>
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
