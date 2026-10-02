import { Check, ChevronsUpDown, LayoutGrid, Plus } from 'lucide-react';
import { Link, useMatch } from 'react-router';
import { Menu, menuItemClass, MenuSeparator } from '@/components/ui/menu';
import { Spinner } from '@/components/ui/spinner';
import { useOrganizations } from '@/hooks/use-organizations';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { paths, routePatterns } from '@/routes/paths';

/** Square initial of a workspace (decorative: the name is always next to it). */
export function WorkspaceMark({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={
        className ??
        'flex size-6 shrink-0 items-center justify-center rounded-control bg-primary text-[0.6875rem] font-semibold text-primary-foreground'
      }
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * Workspace menu in the app header. Lists only organizations the API returned
 * for the signed-in user; switching is plain navigation to /org/:id, where the
 * API verifies membership again.
 */
export function OrganizationSwitcher() {
  const organizations = useOrganizations();
  const common_ = useMessages(common);
  const m = common_.shell;
  const match = useMatch({ path: routePatterns.organization, end: false });
  const currentId = match?.params.organizationId;

  const list = organizations.data?.organizations ?? [];
  const current = list.find((organization) => organization.id === currentId);

  return (
    <Menu
      label={m.switchWorkspace}
      className="w-72"
      trigger={(props) => (
        <button
          {...props}
          className="flex max-w-48 min-w-0 items-center gap-2 rounded-control py-1.5 pr-2 pl-1.5 text-sm font-medium text-foreground focus-ring transition-colors duration-150 hover:bg-surface-muted aria-expanded:bg-surface-muted sm:max-w-64"
        >
          {current ? (
            <WorkspaceMark name={current.name} />
          ) : (
            <LayoutGrid className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
          )}
          <span className="truncate">{current?.name ?? m.workspaces}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
        </button>
      )}
    >
      {(close) => (
        <>
          <p className="px-2.5 pt-1 pb-1.5 text-xs font-medium text-subtle-foreground">
            {m.yourWorkspaces}
          </p>
          {organizations.isPending && (
            <div className="flex justify-center py-3 text-muted-foreground">
              <Spinner size="sm" label={m.loadingWorkspaces} />
            </div>
          )}
          {organizations.isError && (
            <p className="px-2.5 py-2 text-sm text-danger">{m.workspacesFailed}</p>
          )}
          <div className="max-h-72 overflow-y-auto">
            {list.map((organization) => {
              const isCurrent = organization.id === currentId;
              return (
                <Link
                  key={organization.id}
                  role="menuitem"
                  to={paths.organization(organization.id)}
                  onClick={close}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={menuItemClass}
                >
                  <WorkspaceMark
                    name={organization.name}
                    className="flex size-7 shrink-0 items-center justify-center rounded-control bg-primary-soft text-xs font-semibold text-primary-soft-foreground"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{organization.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {common_.roles[organization.role]}
                    </span>
                  </span>
                  {isCurrent && <Check className="text-primary" aria-label={m.currentWorkspace} />}
                </Link>
              );
            })}
          </div>
          <MenuSeparator />
          <Link role="menuitem" to={paths.organizations} onClick={close} className={menuItemClass}>
            <LayoutGrid className="text-subtle-foreground" aria-hidden="true" />
            {m.allWorkspaces}
          </Link>
          <Link role="menuitem" to={paths.onboarding} onClick={close} className={menuItemClass}>
            <Plus className="text-subtle-foreground" aria-hidden="true" />
            {m.createWorkspace}
          </Link>
        </>
      )}
    </Menu>
  );
}
