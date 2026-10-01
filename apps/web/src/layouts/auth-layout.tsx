import { Link, Outlet } from 'react-router';
import { GuestAppearanceControl } from '@/components/appearance/guest-appearance-control';
import { BrandMark } from '@/components/layout/brand-mark';
import { appConfig } from '@/lib/app-config';
import { paths } from '@/routes/paths';

/**
 * Minimal frame for guest pages (sign in, create account, invitations): brand,
 * centered card, footer, and the guest Appearance control in the top-right corner.
 */
export function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex min-h-13 justify-end px-4 pt-4 sm:px-6">
        <GuestAppearanceControl />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-4 pt-4 pb-10 sm:pb-16">
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
