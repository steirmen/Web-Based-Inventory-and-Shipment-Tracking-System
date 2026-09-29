import { Navigate, Outlet, useLocation } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/hooks/use-auth';
import { paths } from './paths';

interface RedirectState {
  from?: unknown;
}

/**
 * Only allows internal paths as post-login destinations (no open redirects,
 * no bouncing back to the guest pages).
 */
function safeRedirectTarget(from: unknown): string {
  if (
    typeof from === 'string' &&
    from.startsWith('/') &&
    !from.startsWith('//') &&
    !from.startsWith(paths.login) &&
    !from.startsWith(paths.register)
  ) {
    return from;
  }
  return paths.home;
}

function SessionCheckPending() {
  return (
    <div className="flex min-h-64 flex-1 items-center justify-center text-muted-foreground">
      <Spinner size="lg" label="Checking your session" />
    </div>
  );
}

/**
 * Wraps routes that require a signed-in user. Waits for the session check to
 * finish before deciding, so signed-in users never see a redirect flash.
 */
export function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();

  switch (auth.status) {
    case 'loading':
      return <SessionCheckPending />;
    case 'error':
      return (
        <div className="mx-auto flex max-w-md flex-col gap-4 py-12">
          <Alert tone="danger" title="We couldn't verify your session">
            The server could not be reached. Check your connection and try again.
          </Alert>
          <Button variant="secondary" className="self-start" onClick={auth.retry}>
            Try again
          </Button>
        </div>
      );
    case 'unauthenticated':
      return (
        <Navigate
          to={paths.login}
          replace
          state={{ from: `${location.pathname}${location.search}` } satisfies RedirectState}
        />
      );
    case 'authenticated':
      return <Outlet />;
  }
}

/** Wraps login/register: signed-in users are sent back into the app. */
export function RequireGuest() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <SessionCheckPending />
      </div>
    );
  }
  if (auth.status === 'authenticated') {
    const state = location.state as RedirectState | null;
    return <Navigate to={safeRedirectTarget(state?.from)} replace />;
  }
  // Unauthenticated, or the session check failed: the form itself reports server problems.
  return <Outlet />;
}
