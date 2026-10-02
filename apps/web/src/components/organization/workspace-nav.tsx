import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Settings,
  ShoppingCart,
  Tags,
  Users,
  UsersRound,
  Warehouse,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router';
import type { Translation } from '@/i18n/define';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { cn } from '@/lib/cn';
import { paths } from '@/routes/paths';

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Only an exact match is active (the overview, whose path prefixes all others). */
  end?: boolean;
}

interface NavGroup {
  /** Group heading on wide screens; null for the overview. */
  label: string | null;
  items: NavItem[];
}

type NavMessages = Translation<typeof common.en>['nav'];

function navGroups(organizationId: string, m: NavMessages): NavGroup[] {
  return [
    {
      label: null,
      items: [
        {
          label: m.overview,
          to: paths.organization(organizationId),
          icon: LayoutDashboard,
          end: true,
        },
      ],
    },
    {
      label: m.sales,
      items: [
        { label: m.orders, to: paths.orders(organizationId), icon: ShoppingCart },
        { label: m.customers, to: paths.customers(organizationId), icon: Users },
      ],
    },
    {
      label: m.catalog,
      items: [
        { label: m.products, to: paths.products(organizationId), icon: Package },
        { label: m.categories, to: paths.categories(organizationId), icon: Tags },
      ],
    },
    {
      label: m.stock,
      items: [
        { label: m.inventory, to: paths.inventory(organizationId), icon: Boxes },
        { label: m.warehouses, to: paths.warehouses(organizationId), icon: Warehouse },
        {
          label: m.stockMovements,
          to: paths.stockMovements(organizationId),
          icon: ArrowLeftRight,
        },
      ],
    },
    {
      label: m.insights,
      items: [{ label: m.reports, to: paths.reports(organizationId), icon: BarChart3 }],
    },
    {
      label: m.workspace,
      items: [
        { label: m.team, to: paths.organizationTeam(organizationId), icon: UsersRound },
        {
          label: m.settings,
          to: paths.organizationSettings(organizationId),
          icon: Settings,
        },
      ],
    },
  ];
}

/**
 * Navigation of a workspace. One `<nav>` for every screen size: from `lg` it
 * is a sticky sidebar with labelled groups; below that, the same links form a
 * horizontally scrolling bar (the active link is scrolled into view). Every
 * link is shown to every member — permissions decide what a page offers,
 * not whether it can be opened.
 */
export function WorkspaceNav({ organizationId }: { organizationId: string }) {
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const m = useMessages(common).nav;

  // On the narrow bar, center the current section after a navigation (scrolls only the bar).
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && active && nav.scrollWidth > nav.clientWidth) {
      nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
    }
  }, [pathname]);

  return (
    <nav
      ref={navRef}
      aria-label={m.label}
      className={cn(
        // Narrow: one scrolling row under the header.
        '-mx-4 flex [scrollbar-width:none] gap-1 overflow-x-auto border-b border-border px-4 pb-2 sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden',
        // …whose right edge fades out, hinting that it scrolls.
        '[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] lg:[mask-image:none]',
        // Wide: sticky column next to the page.
        'lg:sticky lg:top-20 lg:mx-0 lg:max-h-[calc(100dvh-6rem)] lg:flex-col lg:gap-5 lg:self-start lg:overflow-x-visible lg:overflow-y-auto lg:border-b-0 lg:px-0 lg:pb-0',
      )}
    >
      {navGroups(organizationId, m).map((group) => (
        <div key={group.label ?? 'main'} className="contents lg:flex lg:flex-col lg:gap-0.5">
          {group.label && (
            <p className="hidden px-3 pb-1 text-[0.6875rem] font-semibold tracking-wider text-subtle-foreground uppercase lg:block">
              {group.label}
            </p>
          )}
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-2 rounded-control px-3 py-1.5 text-sm font-medium whitespace-nowrap focus-ring transition-colors duration-150 lg:py-2',
                  isActive
                    ? 'bg-primary-soft text-primary-soft-foreground'
                    : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={cn(
                      'size-4 shrink-0',
                      isActive ? 'text-primary-soft-foreground' : 'text-subtle-foreground',
                    )}
                    aria-hidden="true"
                  />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}
