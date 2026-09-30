import { Link, useNavigate, useParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { ErrorState, LoadingState } from '@/components/layout/page-state';
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

  if (!can('PRODUCTS_UPDATE')) {
    return (
      <NotAllowed
        title="Edit product"
        description="Your role can't edit products. Ask an owner or admin."
      />
    );
  }

  if (product.isPending) {
    return <LoadingState label="Loading product" />;
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
  const detailPath = paths.product(organization.id, current.id);

  if (current.status === 'ARCHIVED') {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <title>{pageTitle(`Edit ${current.name} · ${organization.name}`)}</title>
        <BackToProducts />
        <PageHeader title={`Edit ${current.name}`} />
        <Alert tone="warning" title="This product is archived">
          Restore it before editing.
        </Alert>
        <Link
          to={detailPath}
          className={buttonVariants({ variant: 'secondary', className: 'self-start' })}
        >
          View product
        </Link>
      </div>
    );
  }

  const initialValues = productToFormValues(current);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <title>{pageTitle(`Edit ${current.name} · ${organization.name}`)}</title>
      <BackToProducts />
      <PageHeader
        title={`Edit ${current.name}`}
        description={<span className="font-mono text-[13px]">{current.sku}</span>}
      />
      <ProductForm
        key={current.id}
        initialValues={initialValues}
        costOptional={current.cost === null}
        submitLabel="Save changes"
        pending={update.isPending}
        cancelTo={detailPath}
        onSubmit={async (values) => {
          const changes = toUpdateProductRequest(initialValues, values);
          if (Object.keys(changes).length > 0) {
            await update.mutateAsync(changes);
          }
          await navigate(detailPath, {
            state: {
              notice: Object.keys(changes).length > 0 ? 'Changes saved.' : 'No changes to save.',
            },
          });
        }}
      />
    </div>
  );
}
