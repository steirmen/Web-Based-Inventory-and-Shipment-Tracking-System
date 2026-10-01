import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { pageTitle } from '@/lib/app-config';
import { paths } from '@/routes/paths';

/** Rendered by the router when a route throws while rendering. Replaces the whole shell. */
export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : isChunkLoadError(error)
      ? 'This page could not be loaded. Check your connection, then reload the app.'
      : error instanceof Error
        ? error.message
        : 'An unexpected error occurred.';

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <title>{pageTitle('Something went wrong')}</title>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert tone="danger">{message}</Alert>
          {/* Full page load on purpose: resets any broken client state. */}
          <a href={paths.home} className={buttonVariants({ variant: 'secondary' })}>
            Reload the app
          </a>
        </CardContent>
      </Card>
    </div>
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
