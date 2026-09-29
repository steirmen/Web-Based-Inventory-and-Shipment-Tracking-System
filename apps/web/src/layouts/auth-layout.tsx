import { Link, Outlet } from 'react-router';
import { BrandMark } from '@/components/layout/brand-mark';
import { appConfig } from '@/lib/app-config';
import { paths } from '@/routes/paths';

/** Minimal frame for guest pages (sign in, create account): brand, centered card, footer. */
export function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:py-16">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <Link
            to={paths.home}
            className="flex items-center gap-2.5 self-center rounded-control px-1 py-1 focus-ring"
          >
            <BrandMark className="size-9" />
            <span className="text-lg font-semibold tracking-tight">{appConfig.name}</span>
          </Link>
          <Outlet />
        </div>
      </main>
      <footer className="pb-6 text-center text-xs text-subtle-foreground">
        {appConfig.tagline}
      </footer>
    </div>
  );
}
