import { Archive, ArchiveRestore, Pencil } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { ErrorState, DetailSkeleton } from '@/components/layout/page-state';
import { ArchiveProductDialog } from '@/components/products/archive-product-dialog';
import { BackToProducts, ProductNotFound } from '@/components/products/product-page-parts';
import { ProductStatusBadge } from '@/components/products/product-status-badge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useProduct, useProductStatusChange } from '@/hooks/use-catalog';
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { catalog } from '@/i18n/messages/catalog';
import { common } from '@/i18n/messages/common';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
import { useCurrentOrganization } from '@/lib/organization-context';
import { paths } from '@/routes/paths';

/** Flash message passed through navigation state after create/edit (never persisted). */
function readNotice(state: unknown): string | null {
  if (state && typeof state === 'object' && 'notice' in state) {
    const { notice } = state as { notice: unknown };
    return typeof notice === 'string' ? notice : null;
  }
  return null;
}

export function ProductDetailPage() {
  const { organization, can } = useCurrentOrganization();
  const { productId = '' } = useParams();
  const location = useLocation();
  const product = useProduct(organization.id, productId);
  const statusChange = useProductStatusChange(organization.id);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [notice, setNotice] = useState(() => readNotice(location.state));
  const navigate = useNavigate();
  const m = useMessages(catalog);
  const c = useMessages(common);
  const f = useFormat();
  const errorMessage = useApiErrorMessage();

  // Show the flash message once: drop it from history so a reload doesn't repeat it.
  useEffect(() => {
    if (readNotice(location.state)) {
      void navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  if (product.isPending) {
    return <DetailSkeleton label={m.pages.loading} />;
  }

  if (product.isError) {
    if (hasErrorCode(product.error, 'PRODUCT_NOT_FOUND')) return <ProductNotFound />;
    return (
      <div className="flex flex-col gap-6">
        <BackToProducts />
        <ErrorState
          title={m.pages.loadError}
          error={product.error}
          onRetry={() => void product.refetch()}
        />
      </div>
    );
  }

  const current = product.data.product;
  const archived = current.status === 'ARCHIVED';

  const changeStatus = (action: 'archive' | 'restore') => {
    setNotice(null);
    statusChange.mutate(
      { productId: current.id, action },
      {
        onSuccess: () => {
          setConfirmingArchive(false);
          setNotice(action === 'archive' ? m.detail.archivedNotice : m.detail.restoredNotice);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${current.name} · ${organization.name}`)}</title>
      <BackToProducts />
      <PageHeader
        eyebrow={m.detail.eyebrow}
        title={<span className="break-words">{current.name}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[0.8125rem] break-all">{current.sku}</span>
            <ProductStatusBadge status={current.status} />
          </span>
        }
        actions={
          <>
            {!archived && can('PRODUCTS_UPDATE') && (
              <Link
                to={paths.productEdit(organization.id, current.id)}
                className={buttonVariants({ variant: 'secondary' })}
              >
                <Pencil aria-hidden="true" />
                {m.actions.edit}
              </Link>
            )}
            {can('PRODUCTS_ARCHIVE') &&
              (archived ? (
                <Button
                  variant="secondary"
                  isLoading={statusChange.isPending}
                  onClick={() => changeStatus('restore')}
                >
                  {!statusChange.isPending && <ArchiveRestore aria-hidden="true" />}
                  {m.actions.restore}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    statusChange.reset();
                    setConfirmingArchive(true);
                  }}
                >
                  <Archive aria-hidden="true" />
                  {m.actions.archive}
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
      {archived && (
        <Alert tone="warning" title={m.detail.archivedTitle}>
          {can('PRODUCTS_ARCHIVE') ? m.detail.canRestore : m.detail.askToRestore}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{m.detail.details}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-5 text-sm sm:grid-cols-2">
              <Field label={m.detail.category}>
                {current.category?.name ?? (
                  <span className="text-subtle-foreground">{m.detail.none}</span>
                )}
              </Field>
              <Field label={m.detail.status}>
                {archived ? c.status.archived : c.status.active}
              </Field>
              <Field label={m.detail.description} className="sm:col-span-2">
                {current.description ? (
                  <span className="whitespace-pre-line">{current.description}</span>
                ) : (
                  <span className="text-subtle-foreground">{m.detail.noDescription}</span>
                )}
              </Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.detail.pricing}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-5 text-sm lg:grid-cols-1">
              <Field label={m.detail.price}>
                <span className="tabular-nums">{f.money(current.price, current.currency)}</span>
              </Field>
              <Field label={m.detail.cost}>
                <span className="tabular-nums">{f.money(current.cost, current.currency)}</span>
              </Field>
              <Field label={m.detail.currency}>
                {current.currency} · {c.currency[current.currency]}
              </Field>
              <Field label={m.detail.minimumStock}>
                <span className="tabular-nums">{f.number(current.minimumStock)}</span>
              </Field>
            </dl>
          </CardContent>
        </Card>
      </div>

      <dl className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:gap-6">
        <div className="flex gap-1">
          <dt>{m.detail.created}</dt>
          <dd>{f.dateTime(current.createdAt)}</dd>
        </div>
        <div className="flex gap-1">
          <dt>{m.detail.updated}</dt>
          <dd>{f.dateTime(current.updatedAt)}</dd>
        </div>
      </dl>

      <ArchiveProductDialog
        product={confirmingArchive ? current : null}
        pending={statusChange.isPending}
        error={statusChange.isError ? statusChange.error : null}
        onConfirm={() => changeStatus('archive')}
        onCancel={() => setConfirmingArchive(false)}
      />
    </div>
  );
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
