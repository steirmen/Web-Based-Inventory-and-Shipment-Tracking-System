import { useNavigate } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { ProductForm } from '@/components/products/product-form';
import { BackToProducts, NotAllowed } from '@/components/products/product-page-parts';
import { useCreateProduct } from '@/hooks/use-catalog';
import { pageTitle } from '@/lib/app-config';
import { useCurrentOrganization } from '@/lib/organization-context';
import { EMPTY_PRODUCT_FORM, toCreateProductRequest } from '@/lib/product-form';
import { paths } from '@/routes/paths';

export function ProductNewPage() {
  const { organization, can } = useCurrentOrganization();
  const create = useCreateProduct(organization.id);
  const navigate = useNavigate();

  if (!can('PRODUCTS_CREATE')) {
    return (
      <NotAllowed
        title="New product"
        description="Your role can't create products. Ask an owner or admin."
      />
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <title>{pageTitle(`New product · ${organization.name}`)}</title>
      <BackToProducts />
      <PageHeader title="New product" description="Add a product to this workspace's catalog." />
      <ProductForm
        initialValues={EMPTY_PRODUCT_FORM}
        submitLabel="Create product"
        pending={create.isPending}
        cancelTo={paths.products(organization.id)}
        onSubmit={async (values) => {
          const { product } = await create.mutateAsync(toCreateProductRequest(values));
          await navigate(paths.product(organization.id, product.id), {
            state: { notice: 'Product created.' },
          });
        }}
      />
    </div>
  );
}
