import { Link, Outlet } from 'react-router';
import { GuestAppearanceControl } from '@/components/appearance/guest-appearance-control';
import { LanguageSwitch } from '@/components/i18n/language-switch';
import { BrandMark } from '@/components/layout/brand-mark';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { appConfig } from '@/lib/app-config';
import { paths } from '@/routes/paths';

/**
 * Minimal frame for guest pages (sign in, create account, invitations): brand,
 * centered card, footer, and in the top-right corner the guest Appearance
 * control and the TR | EN language switch (no sign-in needed for either).
 */
export function AuthLayout() {
  const m = useMessages(common);
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* `relative`: the Appearance popover aligns with this bar's right edge, not its trigger. */}
      <header className="relative flex min-h-13 items-center justify-end gap-2 px-4 pt-4 sm:px-6">
        <GuestAppearanceControl />
        <LanguageSwitch />
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
      <footer className="pb-6 text-center text-xs text-subtle-foreground">{m.app.tagline}</footer>
    </div>
  );
}
