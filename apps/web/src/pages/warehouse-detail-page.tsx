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
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { stock } from '@/i18n/messages/stock';
import { common } from '@/i18n/messages/common';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
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
  const s = useMessages(stock);
  const m = s.warehouse;
  const c = useMessages(common);
  const f = useFormat();
  const errorMessage = useApiErrorMessage();

  if (query.isPending) return <DetailSkeleton label={m.loading} />;

  if (query.isError) {
    if (hasErrorCode(query.error, 'WAREHOUSE_NOT_FOUND')) {
      return (
        <div className="flex flex-col gap-6">
          <title>{pageTitle(`${m.notFoundTitle} · ${organization.name}`)}</title>
          <BackToWarehouses />
          <PageHeader title={m.notFoundTitle} />
          <EmptyState
            icon={<SearchX className="size-5" aria-hidden="true" />}
            title={m.notFoundText}
            action={
              <Link
                to={paths.warehouses(organization.id)}
                className={buttonVariants({ variant: 'secondary' })}
              >
                {m.viewAll}
              </Link>
            }
          />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-6">
        <BackToWarehouses />
        <ErrorState title={m.loadError} error={query.error} onRetry={() => void query.refetch()} />
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
          setNotice(action === 'archive' ? m.archivedNotice : m.restoredNotice);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${warehouse.name} · ${organization.name}`)}</title>
      <BackToWarehouses />
      <PageHeader
        eyebrow={m.eyebrow}
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
                {s.warehouses.edit}
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
                  {s.warehouses.archive}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  isLoading={statusChange.isPending}
                  onClick={() => changeStatus('restore')}
                >
                  {!statusChange.isPending && <ArchiveRestore aria-hidden="true" />}
                  {s.warehouses.restore}
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
        <Alert tone="danger">{errorMessage(statusChange.error)}</Alert>
      )}
      {!warehouse.isActive && (
        <Alert tone="warning" title={m.archivedTitle}>
          {can('WAREHOUSES_ARCHIVE') ? m.archivedRestore : m.archivedAsk}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{m.details}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-5 text-sm sm:grid-cols-2">
              <Field label={s.warehouses.code}>
                <span className="font-mono">{warehouse.code}</span>
              </Field>
              <Field label={s.warehouses.status}>
                {warehouse.isActive ? c.status.active : c.status.archived}
              </Field>
              <Field label={s.warehouses.address} className="sm:col-span-2">
                {warehouse.address ? (
                  <span className="whitespace-pre-line">{warehouse.address}</span>
                ) : (
                  <span className="text-subtle-foreground">{m.noAddress}</span>
                )}
              </Field>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{m.stock}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <dl className="grid grid-cols-2 gap-5 text-sm">
              <Field label={m.productsInStock}>
                <span className="text-lg font-semibold tabular-nums">
                  {f.number(warehouse.productCount)}
                </span>
              </Field>
              <Field label={m.totalUnits}>
                <span className="text-lg font-semibold tabular-nums">
                  {f.number(warehouse.totalUnits)}
                </span>
              </Field>
            </dl>
            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
              <Link
                to={warehouseInventoryPath(organization.id, warehouse.id)}
                className={buttonVariants({ variant: 'secondary' })}
              >
                <Package aria-hidden="true" />
                {m.viewInventory}
              </Link>
              <Link
                to={movementsPath(organization.id, { warehouseId: warehouse.id })}
                className={buttonVariants({ variant: 'secondary' })}
              >
                <History aria-hidden="true" />
                {m.viewMovements}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <dl className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:gap-6">
        <div className="flex gap-1">
          <dt>{m.created}</dt>
          <dd>{f.dateTime(warehouse.createdAt)}</dd>
        </div>
        <div className="flex gap-1">
          <dt>{m.updated}</dt>
          <dd>{f.dateTime(warehouse.updatedAt)}</dd>
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
  const m = useMessages(stock).warehouse;
  return <BackLink to={paths.warehouses(organization.id)} label={m.back} />;
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
