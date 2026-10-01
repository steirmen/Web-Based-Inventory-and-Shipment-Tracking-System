import { Archive, ArchiveRestore, History, Package, Pencil, SearchX } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useParams } from 'react-router';
import { BackLink } from '@/components/layout/back-link';
import { WarehouseStatusBadge } from '@/components/inventory/inventory-badges';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, DetailSkeleton } from '@/components/layout/page-state';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArchiveWarehouseDialog } from '@/components/warehouses/archive-warehouse-dialog';
import { WarehouseFormDialog } from '@/components/warehouses/warehouse-form-dialog';
import { useWarehouse, useWarehouseStatusChange } from '@/hooks/use-inventory';
import { apiErrorMessage, hasErrorCode } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
import { formatDateTime } from '@/lib/format';
import { movementsPath, warehouseInventoryPath } from '@/lib/inventory-params';
import { useCurrentOrganization } from '@/lib/organization-context';
import { paths } from '@/routes/paths';

export function WarehouseDetailPage() {
  const { organization, can } = useCurrentOrganization();
  const { warehouseId = '' } = useParams();
  const query = useWarehouse(organization.id, warehouseId);
  const statusChange = useWarehouseStatusChange(organization.id);
  const [editing, setEditing] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (query.isPending) return <DetailSkeleton label="Loading warehouse" />;

  if (query.isError) {
    if (hasErrorCode(query.error, 'WAREHOUSE_NOT_FOUND')) {
      return (
        <div className="flex flex-col gap-6">
          <title>{pageTitle(`Warehouse not found · ${organization.name}`)}</title>
          <BackToWarehouses />
          <PageHeader title="Warehouse not found" />
          <EmptyState
            icon={<SearchX className="size-5" aria-hidden="true" />}
            title="This warehouse doesn't exist in this workspace."
            action={
              <Link
                to={paths.warehouses(organization.id)}
                className={buttonVariants({ variant: 'secondary' })}
              >
                View all warehouses
              </Link>
            }
          />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-6">
        <BackToWarehouses />
        <ErrorState
          title="We couldn't load this warehouse"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const warehouse = query.data.warehouse;
  const changeStatus = (action: 'archive' | 'restore') => {
    setNotice(null);
    statusChange.mutate(
      { warehouseId: warehouse.id, action },
      {
        onSuccess: () => {
          setConfirmingArchive(false);
          setNotice(action === 'archive' ? 'Warehouse archived.' : 'Warehouse restored.');
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${warehouse.name} · ${organization.name}`)}</title>
      <BackToWarehouses />
      <PageHeader
        eyebrow="Warehouse"
        title={<span className="break-words">{warehouse.name}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[0.8125rem]">{warehouse.code}</span>
            <WarehouseStatusBadge isActive={warehouse.isActive} />
          </span>
        }
        actions={
          <>
            {can('WAREHOUSES_UPDATE') && (
              <Button
                variant="secondary"
                onClick={() => {
                  setNotice(null);
                  setEditing(true);
                }}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Button>
            )}
            {can('WAREHOUSES_ARCHIVE') &&
              (warehouse.isActive ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    statusChange.reset();
                    setConfirmingArchive(true);
                  }}
                >
                  <Archive aria-hidden="true" />
                  Archive
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  isLoading={statusChange.isPending}
                  onClick={() => changeStatus('restore')}
                >
                  {!statusChange.isPending && <ArchiveRestore aria-hidden="true" />}
                  Restore
                </Button>
              ))}
          </>
        }
      />

      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {statusChange.isError && !confirmingArchive && (
        <Alert tone="danger">{apiErrorMessage(statusChange.error)}</Alert>
      )}
      {!warehouse.isActive && (
        <Alert tone="warning" title="This warehouse is archived">
          Its stock and history stay visible, but no stock can be moved in or out
          {can('WAREHOUSES_ARCHIVE')
            ? ' until you restore it.'
            : '. An owner or admin can restore it.'}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-5 text-sm sm:grid-cols-2">
              <Field label="Code">
                <span className="font-mono">{warehouse.code}</span>
              </Field>
              <Field label="Status">{warehouse.isActive ? 'Active' : 'Archived'}</Field>
              <Field label="Address" className="sm:col-span-2">
                {warehouse.address ? (
                  <span className="whitespace-pre-line">{warehouse.address}</span>
                ) : (
                  <span className="text-subtle-foreground">No address</span>
                )}
              </Field>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Stock</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <dl className="grid grid-cols-2 gap-5 text-sm">
              <Field label="Products in stock">
                <span className="text-lg font-semibold tabular-nums">
                  {warehouse.productCount.toLocaleString()}
                </span>
              </Field>
              <Field label="Total units">
                <span className="text-lg font-semibold tabular-nums">
                  {warehouse.totalUnits.toLocaleString()}
                </span>
              </Field>
            </dl>
            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
              <Link
                to={warehouseInventoryPath(organization.id, warehouse.id)}
                className={buttonVariants({ variant: 'secondary' })}
              >
                <Package aria-hidden="true" />
                View inventory
              </Link>
              <Link
                to={movementsPath(organization.id, { warehouseId: warehouse.id })}
                className={buttonVariants({ variant: 'secondary' })}
              >
                <History aria-hidden="true" />
                View stock movements
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <dl className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:gap-6">
        <div className="flex gap-1">
          <dt>Created</dt>
          <dd>{formatDateTime(warehouse.createdAt)}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Last updated</dt>
          <dd>{formatDateTime(warehouse.updatedAt)}</dd>
        </div>
      </dl>

      <WarehouseFormDialog
        open={editing}
        warehouse={warehouse}
        onClose={() => setEditing(false)}
        onSaved={(message) => {
          setEditing(false);
          setNotice(message);
        }}
      />
      <ArchiveWarehouseDialog
        warehouse={confirmingArchive ? warehouse : null}
        pending={statusChange.isPending}
        error={statusChange.isError ? statusChange.error : null}
        onConfirm={() => changeStatus('archive')}
        onCancel={() => setConfirmingArchive(false)}
      />
    </div>
  );
}

function BackToWarehouses() {
  const { organization } = useCurrentOrganization();
  return <BackLink to={paths.warehouses(organization.id)} label="Warehouses" />;
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-foreground">{children}</dd>
    </div>
  );
}
