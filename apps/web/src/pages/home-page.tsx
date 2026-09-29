import { LogOut } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuth, useLogout } from '@/hooks/use-auth';
import { pageTitle } from '@/lib/app-config';

/**
 * Minimal authenticated landing page. It proves the sign-in lifecycle works;
 * it is not the product dashboard.
 */
export function HomePage() {
  const auth = useAuth();
  const logout = useLogout();

  // RequireAuth guarantees a user; while signing out, render nothing until it redirects.
  if (auth.status !== 'authenticated') {
    return null;
  }
  const { user } = auth;

  return (
    <div className="flex flex-col gap-8">
      <title>{pageTitle('Home')}</title>

      <PageHeader
        eyebrow="Home"
        title={`Welcome, ${user.name}`}
        description="Your account is ready. Workspace setup, including organizations, products, inventory, and orders, will be introduced in upcoming releases."
      />

      <Card className="max-w-xl">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Your session</CardTitle>
            <CardDescription>
              You are signed in as <span className="font-medium text-foreground">{user.email}</span>
              .
            </CardDescription>
          </div>
          <Badge tone="success" dot>
            Authenticated
          </Badge>
        </CardHeader>

        {logout.isError && (
          <CardContent>
            <Alert tone="danger">We couldn&apos;t sign you out. Please try again.</Alert>
          </CardContent>
        )}

        <CardFooter>
          <Button variant="secondary" onClick={() => logout.mutate()} isLoading={logout.isPending}>
            {!logout.isPending && <LogOut aria-hidden="true" />}
            Sign out
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
