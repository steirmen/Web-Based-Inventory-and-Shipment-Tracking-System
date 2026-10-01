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
import { apiErrorMessage, hasErrorCode } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
import { formatDateTime } from '@/lib/format';
import { formatMoney } from '@/lib/money';
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

  // Show the flash message once: drop it from history so a reload doesn't repeat it.
  useEffect(() => {
    if (readNotice(location.state)) {
      void navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  if (product.isPending) {
    return <DetailSkeleton label="Loading product" />;
  }

  if (product.isError) {
    if (hasErrorCode(product.error, 'PRODUCT_NOT_FOUND')) return <ProductNotFound />;
    return (
      <div className="flex flex-col gap-6">
        <BackToProducts />
        <ErrorState
          title="We couldn't load this product"
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
          setNotice(action === 'archive' ? 'Product archived.' : 'Product restored.');
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${current.name} · ${organization.name}`)}</title>
      <BackToProducts />
      <PageHeader
        eyebrow="Product"
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
                Edit
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
                  Restore
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
                  Archive
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
      {archived && (
        <Alert tone="warning" title="This product is archived">
          {can('PRODUCTS_ARCHIVE')
            ? 'Restore it to make changes.'
            : 'An owner or admin can restore it.'}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-5 text-sm sm:grid-cols-2">
              <Field label="Category">
                {current.category?.name ?? <span className="text-subtle-foreground">None</span>}
              </Field>
              <Field label="Status">{archived ? 'Archived' : 'Active'}</Field>
              <Field label="Description" className="sm:col-span-2">
                {current.description ? (
                  <span className="whitespace-pre-line">{current.description}</span>
                ) : (
                  <span className="text-subtle-foreground">No description</span>
                )}
              </Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-5 text-sm lg:grid-cols-1">
              <Field label="Price">
                <span className="tabular-nums">{formatMoney(current.price)}</span>
              </Field>
              <Field label="Cost">
                <span className="tabular-nums">{formatMoney(current.cost)}</span>
              </Field>
              <Field label="Minimum stock">
                <span className="tabular-nums">{current.minimumStock}</span>
              </Field>
            </dl>
          </CardContent>
        </Card>
      </div>

      <dl className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:gap-6">
        <div className="flex gap-1">
          <dt>Created</dt>
          <dd>{formatDateTime(current.createdAt)}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Last updated</dt>
          <dd>{formatDateTime(current.updatedAt)}</dd>
        </div>
      </dl>
      <p className="text-xs text-subtle-foreground">
        Inventory tracking will be available in a future module.
      </p>

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
