import type { ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { BrandMark } from '@/components/layout/brand-mark';
import { Container } from '@/components/layout/container';
import { appConfig } from '@/lib/app-config';
import { cn } from '@/lib/cn';
import { paths } from '@/routes/paths';

/**
 * Top-level page frame: header, main content area, footer.
 * Pages render inside <Outlet /> and inherit the page width and vertical rhythm.
 */
export function AppShell() {
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
            <span className="text-[15px] font-semibold tracking-tight">{appConfig.name}</span>
          </Link>

          <nav aria-label="Main" className="flex items-center gap-1">
            <ShellNavLink to={paths.home}>Overview</ShellNavLink>
            <ShellNavLink to={paths.healthCheck}>System status</ShellNavLink>
          </nav>
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
