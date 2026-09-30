import { CATALOG_LIMITS } from '@app/shared';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCategories } from '@/hooks/use-catalog';
import { apiErrorMessage, hasErrorCode } from '@/lib/api-errors';
import { type FieldErrors, hasErrors, serverFieldErrors } from '@/lib/auth-form';
import { useCurrentOrganization } from '@/lib/organization-context';
import {
  PRODUCT_FIELDS,
  type ProductField,
  type ProductFormValues,
  validateProduct,
} from '@/lib/product-form';

const L = CATALOG_LIMITS;

/**
 * Where an API error belongs: a specific field (validation, duplicate SKU,
 * missing category) or the form as a whole.
 */
function mapSubmitError(error: unknown): { fields: FieldErrors<ProductField>; form?: unknown } {
  if (hasErrorCode(error, 'VALIDATION_ERROR')) {
    const fields = serverFieldErrors(error, PRODUCT_FIELDS);
    return hasErrors(fields) ? { fields } : { fields, form: error };
  }
  if (hasErrorCode(error, 'PRODUCT_SKU_TAKEN')) {
    return { fields: { sku: apiErrorMessage(error) } };
  }
  if (hasErrorCode(error, 'PRODUCT_CATEGORY_NOT_FOUND')) {
    return { fields: { categoryId: 'This category no longer exists. Choose another one.' } };
  }
  return { fields: {}, form: error };
}

/**
 * Create/edit form for a product. `onSubmit` returns the mutation promise so
 * server errors can be mapped onto the fields; the button is disabled while
 * it is pending, which prevents duplicate submissions.
 */
export function ProductForm({
  initialValues,
  costOptional = false,
  submitLabel,
  pending,
  cancelTo,
  notice,
  onSubmit,
}: {
  initialValues: ProductFormValues;
  costOptional?: boolean;
  submitLabel: string;
  pending: boolean;
  cancelTo: string;
  /** Extra content above the fields, e.g. a conflict message. */
  notice?: ReactNode;
  onSubmit: (values: ProductFormValues) => Promise<unknown>;
}) {
  const { organization, can } = useCurrentOrganization();
  const categories = useCategories(organization.id);
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FieldErrors<ProductField>>({});
  const [formError, setFormError] = useState<unknown>(null);

  const set = (field: ProductField) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const validation = validateProduct(values, { costOptional });
    setErrors(validation);
    setFormError(null);
    if (hasErrors(validation)) return;
    try {
      await onSubmit(values);
    } catch (error) {
      const mapped = mapSubmitError(error);
      setErrors(mapped.fields);
      setFormError(mapped.form ?? null);
      if (mapped.fields.categoryId) void categories.refetch();
    }
  };

  const categoryList = categories.data?.categories ?? [];
  // Keep a selected category visible even if the list has not loaded (or it was just removed).
  const selectedMissing =
    values.categoryId !== '' && !categoryList.some((c) => c.id === values.categoryId);

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      {notice}
      {formError !== null && <Alert tone="danger">{apiErrorMessage(formError)}</Alert>}
      {hasErrors(errors) && formError === null && (
        <Alert tone="danger">Please check the highlighted fields.</Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>How the product is identified in your catalog.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <FormField label="Name" error={errors.name} className="sm:col-span-2">
            {(control) => (
              <Input
                {...control}
                name="name"
                autoComplete="off"
                maxLength={L.productNameMaxLength}
                value={values.name}
                onChange={(event) => set('name')(event.target.value)}
              />
            )}
          </FormField>
          <FormField
            label="SKU"
            error={errors.sku}
            hint="Unique in this workspace. Letters, numbers, and . _ - /"
          >
            {(control) => (
              <Input
                {...control}
                name="sku"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                maxLength={L.skuMaxLength}
                value={values.sku}
                onChange={(event) => set('sku')(event.target.value)}
              />
            )}
          </FormField>
          <FormField
            label="Category"
            error={errors.categoryId}
            hint={
              categories.isError
                ? "Categories couldn't be loaded. You can still save without one."
                : categoryList.length === 0 && categories.isSuccess
                  ? can('CATEGORIES_CREATE')
                    ? 'No categories yet. Create them on the Categories page.'
                    : 'No categories yet.'
                  : undefined
            }
          >
            {(control) => (
              <Select
                {...control}
                name="categoryId"
                value={values.categoryId}
                onChange={(event) => set('categoryId')(event.target.value)}
              >
                <option value="">No category</option>
                {categoryList.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
                {selectedMissing && <option value={values.categoryId}>Current category</option>}
              </Select>
            )}
          </FormField>
          <FormField
            label="Description"
            error={errors.description}
            hint="Optional."
            className="sm:col-span-2"
          >
            {(control) => (
              <Textarea
                {...control}
                name="description"
                maxLength={L.productDescriptionMaxLength}
                value={values.description}
                onChange={(event) => set('description')(event.target.value)}
              />
            )}
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing and stock level</CardTitle>
          <CardDescription>
            Amounts in your workspace currency, with up to 2 decimals.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-3">
          <FormField label="Price" error={errors.price} hint="Selling price, e.g. 19.99">
            {(control) => (
              <Input
                {...control}
                name="price"
                inputMode="decimal"
                autoComplete="off"
                className="tabular-nums"
                value={values.price}
                onChange={(event) => set('price')(event.target.value)}
              />
            )}
          </FormField>
          <FormField
            label="Cost"
            error={errors.cost}
            hint={costOptional ? 'What you pay. Optional for this product.' : 'What you pay.'}
          >
            {(control) => (
              <Input
                {...control}
                name="cost"
                inputMode="decimal"
                autoComplete="off"
                className="tabular-nums"
                value={values.cost}
                onChange={(event) => set('cost')(event.target.value)}
              />
            )}
          </FormField>
          <FormField
            label="Minimum stock"
            error={errors.minimumStock}
            hint="Reorder level. 0 for none."
          >
            {(control) => (
              <Input
                {...control}
                name="minimumStock"
                inputMode="numeric"
                autoComplete="off"
                className="tabular-nums"
                value={values.minimumStock}
                onChange={(event) => set('minimumStock')(event.target.value)}
              />
            )}
          </FormField>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link to={cancelTo} className={buttonVariants({ variant: 'secondary' })}>
          Cancel
        </Link>
        <Button type="submit" isLoading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
