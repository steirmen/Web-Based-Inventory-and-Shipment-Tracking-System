import { LogOut, Palette } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router';
import { BrandMark } from '@/components/layout/brand-mark';
import { Container } from '@/components/layout/container';
import { OrganizationSwitcher } from '@/components/organization/organization-switcher';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { useAuth, useLogout } from '@/hooks/use-auth';
import { appConfig } from '@/lib/app-config';
import { initials } from '@/lib/initials';
import { paths } from '@/routes/paths';

/**
 * Top-level page frame: header (brand, workspace switcher, user), main content
 * area, footer. Pages render inside <Outlet /> and inherit the page width and
 * vertical rhythm.
 */
export function AppShell() {
  const auth = useAuth();

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only rounded-control bg-surface px-3 py-2 font-medium shadow-raised focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur-sm">
        <Container className="flex h-14 items-center justify-between gap-3 sm:gap-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <Link
              to={paths.home}
              className="-mx-1 flex shrink-0 items-center gap-2.5 rounded-control px-1 py-1 focus-ring"
            >
              <BrandMark />
              <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">
                {appConfig.name}
              </span>
            </Link>
            {auth.status === 'authenticated' && (
              <>
                <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
                <OrganizationSwitcher />
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            {auth.status === 'authenticated' && <UserMenu name={auth.user.name} />}
            {auth.status === 'unauthenticated' && (
              <Link
                to={paths.login}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                Sign in
              </Link>
            )}
          </div>
        </Container>
      </header>

      <main id="main-content" className="flex-1 py-8 sm:py-10">
        <Container>
          <Outlet />
        </Container>
      </main>

      <footer className="border-t border-border">
        <Container className="flex h-12 items-center justify-between gap-4 text-xs text-subtle-foreground">
          <span>{appConfig.name}</span>
          <Link
            to={paths.healthCheck}
            className="rounded-sm focus-ring hover:text-foreground hover:underline"
          >
            System status
          </Link>
        </Container>
      </footer>
    </div>
  );
}

/** Signed-in user, personal appearance settings, and sign-out. */
function UserMenu({ name }: { name: string }) {
  const logout = useLogout();

  return (
    <div className="flex items-center gap-2">
      <span
        className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground"
        aria-hidden="true"
      >
        {initials(name)}
      </span>
      <span className="hidden max-w-40 truncate text-sm font-medium lg:inline">{name}</span>
      <NavLink
        to={paths.appearance}
        className={({ isActive }) =>
          buttonVariants({
            variant: 'ghost',
            size: 'sm',
            className: isActive ? 'bg-surface-muted text-foreground' : undefined,
          })
        }
        aria-label="Appearance"
        title="Appearance"
      >
        <Palette aria-hidden="true" />
        <span className="hidden sm:inline">Appearance</span>
      </NavLink>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => logout.mutate(undefined)}
        isLoading={logout.isPending}
        aria-label="Sign out"
      >
        {!logout.isPending && <LogOut aria-hidden="true" />}
        <span className="hidden sm:inline">Sign out</span>
      </Button>
    </div>
  );
}
