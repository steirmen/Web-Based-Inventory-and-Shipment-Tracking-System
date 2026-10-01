import { ChevronDown, LayoutGrid, LogOut, Palette } from 'lucide-react';
import { Link, Outlet, ScrollRestoration } from 'react-router';
import { BrandMark } from '@/components/layout/brand-mark';
import { Container } from '@/components/layout/container';
import { RouteProgress } from '@/components/layout/route-loading';
import { OrganizationSwitcher } from '@/components/organization/organization-switcher';
import { buttonVariants } from '@/components/ui/button-variants';
import { Menu, menuItemClass, MenuSeparator } from '@/components/ui/menu';
import { Spinner } from '@/components/ui/spinner';
import { useAuth, useLogout } from '@/hooks/use-auth';
import { appConfig } from '@/lib/app-config';
import { initials } from '@/lib/initials';
import { paths } from '@/routes/paths';

/**
 * Top-level page frame: header (brand, workspace switcher, user menu), main
 * content area, footer. Pages render inside <Outlet /> and inherit the page
 * width and vertical rhythm; workspace pages add the workspace navigation
 * (OrganizationLayout).
 */
export function AppShell() {
  const auth = useAuth();

  return (
    <div className="flex min-h-dvh flex-col">
      <RouteProgress />
      {/* A new page starts at the top (Back restores the old position). Keyed by path, so
          filters, sorting, and paging (search params) never make the page jump. */}
      <ScrollRestoration getKey={(location) => location.pathname} />
      <a
        href="#main-content"
        className="sr-only rounded-control bg-surface px-3 py-2 font-medium shadow-raised focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur-sm">
        <Container className="flex h-14 items-center justify-between gap-3 sm:gap-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link
              to={paths.home}
              className="-mx-1 flex shrink-0 items-center gap-2.5 rounded-control px-1 py-1 focus-ring"
            >
              <BrandMark />
              <span className="hidden text-[0.9375rem] font-semibold tracking-tight sm:inline">
                {appConfig.name}
              </span>
            </Link>
            {auth.status === 'authenticated' && (
              <>
                <span className="text-border-strong select-none" aria-hidden="true">
                  /
                </span>
                <OrganizationSwitcher />
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            {auth.status === 'authenticated' && (
              <UserMenu name={auth.user.name} email={auth.user.email} />
            )}
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

      <main id="main-content" tabIndex={-1} className="flex-1 py-6 outline-none sm:py-8">
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

/** Signed-in user: personal settings (appearance), workspaces, and sign-out. */
function UserMenu({ name, email }: { name: string; email: string }) {
  const logout = useLogout();

  return (
    <Menu
      label="Account"
      align="end"
      trigger={(props) => (
        <button
          {...props}
          aria-label={`Account: ${name}`}
          className="flex items-center gap-2 rounded-full py-1 pr-1 pl-1 text-sm font-medium text-foreground focus-ring transition-colors duration-150 hover:bg-surface-muted aria-expanded:bg-surface-muted lg:rounded-control lg:pr-2"
        >
          <span
            className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground"
            aria-hidden="true"
          >
            {initials(name)}
          </span>
          <span className="hidden max-w-40 truncate lg:inline">{name}</span>
          <ChevronDown
            className="hidden size-4 text-subtle-foreground lg:block"
            aria-hidden="true"
          />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="px-2.5 pt-1.5 pb-2">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
          <MenuSeparator />
          <Link role="menuitem" to={paths.appearance} onClick={close} className={menuItemClass}>
            <Palette className="text-subtle-foreground" aria-hidden="true" />
            Appearance
          </Link>
          <Link role="menuitem" to={paths.organizations} onClick={close} className={menuItemClass}>
            <LayoutGrid className="text-subtle-foreground" aria-hidden="true" />
            Your workspaces
          </Link>
          <MenuSeparator />
          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            disabled={logout.isPending}
            onClick={() => logout.mutate(undefined)}
          >
            {logout.isPending ? (
              <Spinner size="sm" label={null} />
            ) : (
              <LogOut className="text-subtle-foreground" aria-hidden="true" />
            )}
            Sign out
          </button>
        </>
      )}
    </Menu>
  );
}
