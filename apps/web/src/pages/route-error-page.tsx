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
