import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { pageTitle } from '@/lib/app-config';
import { paths } from '@/routes/paths';

/** A readable explanation of a routing/rendering failure — never a stack trace. */
function errorMessage(error: unknown, m: { chunk: string; crash: string }): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`;
  if (isChunkLoadError(error)) return m.chunk;
  return m.crash;
}

/**
 * Rendered by the router when a route throws while loading or rendering.
 *
 * - `inShell`: a page-level boundary (inside AppShell / OrganizationLayout):
 *   the header and navigation stay, so the user can go elsewhere.
 * - Otherwise the last-resort boundary at the root, which replaces everything.
 *
 * The router logs the real error to the console for developers; the page shows
 * only a generic explanation (no messages, stacks, or internals).
 */
export function RouteErrorPage({ inShell = false }: { inShell?: boolean }) {
  const error = useRouteError();
  const m = useMessages(common).routeError;

  const card = (
    <Card className="w-full max-w-md">
      <title>{pageTitle(m.title)}</title>
      <CardHeader>
        <CardTitle>{inShell ? m.pageTitle : m.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert tone="danger">{errorMessage(error, m)}</Alert>
        <div className="flex flex-wrap gap-2">
          {/* Full page load on purpose: resets any broken client state. */}
          <a
            href={inShell ? window.location.href : paths.home}
            className={buttonVariants({ variant: 'secondary' })}
          >
            {m.reload}
          </a>
          {inShell && (
            <Link to={paths.home} className={buttonVariants({ variant: 'ghost' })}>
              {m.home}
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return inShell ? (
    <div className="flex justify-center py-8">{card}</div>
  ) : (
    <div className="flex min-h-dvh items-center justify-center p-4">{card}</div>
  );
}

/**
 * Pages are downloaded on demand (route-level code splitting). A failed
 * download (offline, or an old tab after a new version was deployed) is not
 * a bug in the page: reloading fetches the current files.
 */
function isChunkLoadError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(
      error.message,
    )
  );
}
