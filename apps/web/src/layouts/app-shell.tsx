import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { BrandMark } from '@/components/layout/brand-mark';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { useAuth, useLogout } from '@/hooks/use-auth';
import { appConfig } from '@/lib/app-config';
import { initials } from '@/lib/initials';
import { cn } from '@/lib/cn';
import { paths } from '@/routes/paths';

/**
 * Top-level page frame: header, main content area, footer.
 * Pages render inside <Outlet /> and inherit the page width and vertical rhythm.
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
        <Container className="flex h-14 items-center justify-between gap-6">
          <Link
            to={paths.home}
            className="-mx-1 flex items-center gap-2.5 rounded-control px-1 py-1 focus-ring"
          >
            <BrandMark />
            <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">
              {appConfig.name}
            </span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-3">
            <nav aria-label="Main" className="flex items-center gap-1">
              {auth.status === 'authenticated' && <ShellNavLink to={paths.home}>Home</ShellNavLink>}
              <ShellNavLink to={paths.healthCheck}>System status</ShellNavLink>
            </nav>
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
          <span>{appConfig.tagline}</span>
        </Container>
      </footer>
    </div>
  );
}

function ShellNavLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          'rounded-control px-3 py-1.5 text-sm font-medium focus-ring transition-colors duration-150',
          isActive
            ? 'bg-surface-muted text-foreground'
            : 'text-muted-foreground hover:bg-surface-muted/70 hover:text-foreground',
        )
      }
    >
      {children}
    </NavLink>
  );
}

/** Signed-in user and sign-out action. A full account menu arrives with later phases. */
function UserMenu({ name }: { name: string }) {
  const logout = useLogout();

  return (
    <div className="flex items-center gap-2 border-l border-border pl-2 sm:pl-3">
      <span
        className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground"
        aria-hidden="true"
      >
        {initials(name)}
      </span>
      <span className="hidden max-w-40 truncate text-sm font-medium md:inline">{name}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => logout.mutate()}
        isLoading={logout.isPending}
        aria-label="Sign out"
      >
        {!logout.isPending && <LogOut aria-hidden="true" />}
        <span className="hidden sm:inline">Sign out</span>
      </Button>
    </div>
  );
}
