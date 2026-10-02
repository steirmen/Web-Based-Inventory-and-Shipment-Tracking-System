import { useNavigate } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { ProductForm } from '@/components/products/product-form';
import { BackToProducts, NotAllowed } from '@/components/products/product-page-parts';
import { useCreateProduct } from '@/hooks/use-catalog';
import { useMessages } from '@/i18n/i18n-context';
import { catalog } from '@/i18n/messages/catalog';
import { pageTitle } from '@/lib/app-config';
import { useCurrentOrganization } from '@/lib/organization-context';
import { EMPTY_PRODUCT_FORM, toCreateProductRequest } from '@/lib/product-form';
import { paths } from '@/routes/paths';

export function ProductNewPage() {
  const { organization, can } = useCurrentOrganization();
  const create = useCreateProduct(organization.id);
  const navigate = useNavigate();
  const m = useMessages(catalog).pages;

  if (!can('PRODUCTS_CREATE')) {
    return <NotAllowed title={m.newTitle} description={m.newDenied} />;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <title>{pageTitle(`${m.newTitle} · ${organization.name}`)}</title>
      <BackToProducts />
      <PageHeader title={m.newTitle} description={m.newDescription} />
      <ProductForm
        initialValues={EMPTY_PRODUCT_FORM}
        submitLabel={m.create}
        pending={create.isPending}
        cancelTo={paths.products(organization.id)}
        onSubmit={async (values) => {
          const { product } = await create.mutateAsync(toCreateProductRequest(values));
          await navigate(paths.product(organization.id, product.id), {
            state: { notice: m.created },
          });
        }}
      />
    </div>
  );
}
