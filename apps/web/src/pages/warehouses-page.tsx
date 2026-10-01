import type { Warehouse } from '@app/shared';
import {
  Archive,
  ArchiveRestore,
  Eye,
  Pencil,
  Plus,
  Warehouse as WarehouseIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { WarehouseStatusBadge } from '@/components/inventory/inventory-badges';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/layout/page-state';
import { Can } from '@/components/organization/can';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArchiveWarehouseDialog } from '@/components/warehouses/archive-warehouse-dialog';
import { WarehouseFormDialog } from '@/components/warehouses/warehouse-form-dialog';
import { useWarehouses, useWarehouseStatusChange } from '@/hooks/use-inventory';
import { apiErrorMessage } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
import { cn } from '@/lib/cn';
import { useCurrentOrganization } from '@/lib/organization-context';
import { paths } from '@/routes/paths';

type Editing = { mode: 'create' } | { mode: 'edit'; warehouse: Warehouse } | null;

/** Warehouses of the current organization. Management actions follow the viewer's role. */
export function WarehousesPage() {
  const { organization, can } = useCurrentOrganization();
  const warehouses = useWarehouses(organization.id);
  const statusChange = useWarehouseStatusChange(organization.id);
  const [editing, setEditing] = useState<Editing>(null);
  const [archiveTarget, setArchiveTarget] = useState<Warehouse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const list = warehouses.data?.warehouses ?? [];
  const manage = can('WAREHOUSES_UPDATE') || can('WAREHOUSES_ARCHIVE');

  const changeStatus = (warehouse: Warehouse, action: 'archive' | 'restore') => {
    setNotice(null);
    statusChange.mutate(
      { warehouseId: warehouse.id, action },
      {
        onSuccess: () => {
          setArchiveTarget(null);
          setNotice(`${warehouse.name} ${action === 'archive' ? 'archived' : 'restored'}.`);
        },
      },
    );
  };

  const actions = {
    edit: (warehouse: Warehouse) => {
      setNotice(null);
      setEditing({ mode: 'edit', warehouse });
    },
    archive: (warehouse: Warehouse) => {
      statusChange.reset();
      setArchiveTarget(warehouse);
    },
    restore: (warehouse: Warehouse) => changeStatus(warehouse, 'restore'),
  };

  const addButton = (
    <Can permission="WAREHOUSES_CREATE">
      <Button
        onClick={() => {
          setNotice(null);
          setEditing({ mode: 'create' });
        }}
      >
        <Plus aria-hidden="true" />
        Create warehouse
      </Button>
    </Can>
  );

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`Warehouses · ${organization.name}`)}</title>
      <PageHeader
        title="Warehouses"
        description="Where your stock is kept. Archived warehouses keep their history."
        actions={addButton}
      />

      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {statusChange.isError && !archiveTarget && (
        <Alert tone="danger">{apiErrorMessage(statusChange.error)}</Alert>
      )}

      {warehouses.isPending && <ListSkeleton label="Loading warehouses" />}
      {warehouses.isError && (
        <ErrorState
          title="We couldn't load warehouses"
          error={warehouses.error}
          onRetry={() => void warehouses.refetch()}
        />
      )}
      {warehouses.isSuccess && list.length === 0 && (
        <EmptyState
          icon={<WarehouseIcon className="size-5" aria-hidden="true" />}
          title="No warehouses yet"
          description={
            can('WAREHOUSES_CREATE')
              ? 'Create a warehouse to start tracking stock.'
              : 'An owner or admin can create the first warehouse.'
          }
          action={addButton}
        />
      )}

      {list.length > 0 && (
        <Card className="overflow-hidden">
          <Table className="hidden @4xl:table">
            <TableHeader>
              <tr>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead align="right">Products</TableHead>
                <TableHead align="right">Units</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {list.map((warehouse) => (
                <TableRow
                  key={warehouse.id}
                  className={cn(!warehouse.isActive && 'text-muted-foreground')}
                >
                  <TableCell className="max-w-56">
                    <Link
                      to={paths.warehouse(organization.id, warehouse.id)}
                      className="block truncate rounded-sm font-medium text-foreground focus-ring hover:underline"
                    >
                      {warehouse.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {warehouse.code}
                  </TableCell>
                  <TableCell className="max-w-64 truncate">
                    {warehouse.address ?? <span className="text-subtle-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <WarehouseStatusBadge isActive={warehouse.isActive} />
                  </TableCell>
                  <TableCell align="right">{warehouse.productCount.toLocaleString()}</TableCell>
                  <TableCell align="right">{warehouse.totalUnits.toLocaleString()}</TableCell>
                  <TableCell className="py-2">
                    <WarehouseRowActions
                      compact
                      warehouse={warehouse}
                      manage={manage}
                      pending={
                        statusChange.isPending &&
                        statusChange.variables.warehouseId === warehouse.id
                      }
                      {...actions}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <ul className="divide-y divide-border @4xl:hidden" aria-label="Warehouses">
            {list.map((warehouse) => (
              <li key={warehouse.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={paths.warehouse(organization.id, warehouse.id)}
                      className="block truncate rounded-sm font-medium focus-ring hover:underline"
                    >
                      {warehouse.name}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">{warehouse.code}</p>
                  </div>
                  <WarehouseStatusBadge isActive={warehouse.isActive} />
                </div>
                {warehouse.address && (
                  <p className="text-sm break-words text-muted-foreground">{warehouse.address}</p>
                )}
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Products</dt>
                    <dd className="tabular-nums">{warehouse.productCount.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Units</dt>
                    <dd className="tabular-nums">{warehouse.totalUnits.toLocaleString()}</dd>
                  </div>
                </dl>
                <WarehouseRowActions
                  warehouse={warehouse}
                  manage={manage}
                  pending={
                    statusChange.isPending && statusChange.variables.warehouseId === warehouse.id
                  }
                  {...actions}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <WarehouseFormDialog
        open={editing !== null}
        warehouse={editing?.mode === 'edit' ? editing.warehouse : null}
        onClose={() => setEditing(null)}
        onSaved={(message) => {
          setEditing(null);
          setNotice(message);
        }}
      />
      <ArchiveWarehouseDialog
        warehouse={archiveTarget}
        pending={statusChange.isPending}
        error={statusChange.isError ? statusChange.error : null}
        onConfirm={() => archiveTarget && changeStatus(archiveTarget, 'archive')}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  );
}

/**
 * View for everyone; Edit and Archive/Restore only with the matching
 * permissions (UX only). `compact` (table rows): icon-only with tooltips.
 */
function WarehouseRowActions({
  warehouse,
  manage,
  pending,
  edit,
  archive,
  restore,
  compact = false,
}: {
  compact?: boolean;
  warehouse: Warehouse;
  manage: boolean;
  pending: boolean;
  edit: (warehouse: Warehouse) => void;
  archive: (warehouse: Warehouse) => void;
  restore: (warehouse: Warehouse) => void;
}) {
  const { organization, can } = useCurrentOrganization();
  const size = compact ? 'icon-sm' : 'sm';
  return (
    <div className="flex flex-wrap items-center gap-1 @4xl:flex-nowrap @4xl:justify-end">
      <Link
        to={paths.warehouse(organization.id, warehouse.id)}
        className={buttonVariants({ variant: 'ghost', size })}
        aria-label={`View ${warehouse.name}`}
        title={compact ? 'View' : undefined}
      >
        <Eye aria-hidden="true" />
        {!compact && 'View'}
      </Link>
      {manage && can('WAREHOUSES_UPDATE') && (
        <Button
          variant="ghost"
          size={size}
          onClick={() => edit(warehouse)}
          aria-label={`Edit ${warehouse.name}`}
          title={compact ? 'Edit' : undefined}
        >
          <Pencil aria-hidden="true" />
          {!compact && 'Edit'}
        </Button>
      )}
      {manage &&
        can('WAREHOUSES_ARCHIVE') &&
        (warehouse.isActive ? (
          <Button
            variant="ghost"
            size={size}
            onClick={() => archive(warehouse)}
            aria-label={`Archive ${warehouse.name}`}
            title={compact ? 'Archive' : undefined}
          >
            <Archive aria-hidden="true" />
            {!compact && 'Archive'}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size={size}
            isLoading={pending}
            onClick={() => restore(warehouse)}
            aria-label={`Restore ${warehouse.name}`}
            title={compact ? 'Restore' : undefined}
          >
            {!pending && <ArchiveRestore aria-hidden="true" />}
            {!compact && 'Restore'}
          </Button>
        ))}
    </div>
  );
}
