import { Building2, Check, ChevronsUpDown, LayoutGrid, Plus } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link, useMatch } from 'react-router';
import { Spinner } from '@/components/ui/spinner';
import { useOrganizations } from '@/hooks/use-organizations';
import { ROLE_LABELS } from '@/lib/organization-form';
import { paths, routePatterns } from '@/routes/paths';

const itemClass =
  'flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left text-sm text-foreground outline-none hover:bg-surface-muted focus-visible:bg-surface-muted';

/**
 * Workspace menu in the app header. Lists only organizations the API returned
 * for the signed-in user; switching is plain navigation to /org/:id, where the
 * API verifies membership again.
 */
export function OrganizationSwitcher() {
  const organizations = useOrganizations();
  const match = useMatch({ path: routePatterns.organization, end: false });
  const currentId = match?.params.organizationId;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const list = organizations.data?.organizations ?? [];
  const current = list.find((organization) => organization.id === currentId);

  const close = (focusButton = false) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-48 min-w-0 items-center gap-2 rounded-control px-2 py-1.5 text-sm font-medium text-foreground focus-ring transition-colors duration-150 hover:bg-surface-muted sm:max-w-64"
      >
        <Building2 className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
        <span className="truncate">{current?.name ?? 'Workspaces'}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          tabIndex={-1}
          aria-label="Switch workspace"
          onKeyDown={onMenuKeyDown}
          className="absolute top-full left-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-card border border-border bg-surface p-1.5 shadow-raised"
        >
          <p className="px-2.5 pt-1 pb-1.5 text-xs font-medium text-subtle-foreground">
            Your workspaces
          </p>
          {organizations.isPending && (
            <div className="flex justify-center py-3 text-muted-foreground">
              <Spinner size="sm" label="Loading workspaces" />
            </div>
          )}
          {organizations.isError && (
            <p className="px-2.5 py-2 text-sm text-danger">Couldn&apos;t load workspaces.</p>
          )}
          <div className="max-h-72 overflow-y-auto">
            {list.map((organization) => {
              const isCurrent = organization.id === currentId;
              return (
                <Link
                  key={organization.id}
                  role="menuitem"
                  to={paths.organization(organization.id)}
                  onClick={() => close()}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={itemClass}
                >
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-control bg-primary-soft text-xs font-semibold text-primary-soft-foreground"
                    aria-hidden="true"
                  >
                    {organization.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{organization.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {ROLE_LABELS[organization.role]}
                    </span>
                  </span>
                  {isCurrent && (
                    <Check
                      className="size-4 shrink-0 text-primary"
                      aria-label="Current workspace"
                    />
                  )}
                </Link>
              );
            })}
          </div>
          <div className="my-1.5 border-t border-border" />
          <Link
            role="menuitem"
            to={paths.organizations}
            onClick={() => close()}
            className={itemClass}
          >
            <LayoutGrid className="size-4 text-subtle-foreground" aria-hidden="true" />
            All workspaces
          </Link>
          <Link role="menuitem" to={paths.onboarding} onClick={() => close()} className={itemClass}>
            <Plus className="size-4 text-subtle-foreground" aria-hidden="true" />
            Create workspace
          </Link>
        </div>
      )}
    </div>
  );
}
