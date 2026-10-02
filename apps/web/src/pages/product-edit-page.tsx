import { Link, useNavigate, useParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { ErrorState, DetailSkeleton } from '@/components/layout/page-state';
import { ProductForm } from '@/components/products/product-form';
import {
  BackToProducts,
  NotAllowed,
  ProductNotFound,
} from '@/components/products/product-page-parts';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button-variants';
import { useProduct, useUpdateProduct } from '@/hooks/use-catalog';
import { hasErrorCode } from '@/lib/api-errors';
import { useMessages } from '@/i18n/i18n-context';
import { catalog } from '@/i18n/messages/catalog';
import { common } from '@/i18n/messages/common';
import { pageTitle } from '@/lib/app-config';
import { useCurrentOrganization } from '@/lib/organization-context';
import { productToFormValues, toUpdateProductRequest } from '@/lib/product-form';
import { paths } from '@/routes/paths';

export function ProductEditPage() {
  const { organization, can } = useCurrentOrganization();
  const { productId = '' } = useParams();
  const product = useProduct(organization.id, productId);
  const update = useUpdateProduct(organization.id, productId);
  const navigate = useNavigate();
  const m = useMessages(catalog).pages;
  const c = useMessages(common);

  if (!can('PRODUCTS_UPDATE')) {
    return <NotAllowed title={m.editTitle} description={m.editDenied} />;
  }

  if (product.isPending) {
    return <DetailSkeleton label={m.loading} />;
  }

  if (product.isError) {
    if (hasErrorCode(product.error, 'PRODUCT_NOT_FOUND')) return <ProductNotFound />;
    return (
      <div className="flex flex-col gap-6">
        <BackToProducts />
        <ErrorState
          title={m.loadError}
          error={product.error}
          onRetry={() => void product.refetch()}
        />
      </div>
    );
  }

  const current = product.data.product;
  const detailPath = paths.product(organization.id, current.id);

  if (current.status === 'ARCHIVED') {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <title>{pageTitle(`${m.editNamed({ name: current.name })} · ${organization.name}`)}</title>
        <BackToProducts />
        <PageHeader title={m.editNamed({ name: current.name })} />
        <Alert tone="warning" title={m.archivedTitle}>
          {m.restoreBeforeEditing}
        </Alert>
        <Link
          to={detailPath}
          className={buttonVariants({ variant: 'secondary', className: 'self-start' })}
        >
          {m.viewProduct}
        </Link>
      </div>
    );
  }

  const initialValues = productToFormValues(current);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <title>{pageTitle(`${m.editNamed({ name: current.name })} · ${organization.name}`)}</title>
      <BackToProducts />
      <PageHeader
        title={m.editNamed({ name: current.name })}
        description={<span className="font-mono text-[0.8125rem]">{current.sku}</span>}
      />
      <ProductForm
        key={current.id}
        initialValues={initialValues}
        costOptional={current.cost === null}
        submitLabel={c.actions.saveChanges}
        pending={update.isPending}
        cancelTo={detailPath}
        onSubmit={async (values) => {
          const changes = toUpdateProductRequest(initialValues, values);
          if (Object.keys(changes).length > 0) {
            await update.mutateAsync(changes);
          }
          await navigate(detailPath, {
            state: {
              notice: Object.keys(changes).length > 0 ? m.saved : m.noChanges,
            },
          });
        }}
      />
    </div>
  );
}
