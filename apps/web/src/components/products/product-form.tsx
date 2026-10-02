import { CATALOG_LIMITS, CURRENCIES, type Currency } from '@app/shared';
import { type ComponentProps, type FormEvent, type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { catalog } from '@/i18n/messages/catalog';
import { common } from '@/i18n/messages/common';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-errors';
import { type FieldErrors, hasErrors, serverFieldErrors } from '@/lib/auth-form';
import { currencySymbol } from '@/lib/money';
import {
  PRODUCT_FIELDS,
  type ProductField,
  type ProductFormValues,
  validateProduct,
} from '@/lib/product-form';
import { CategoryPicker } from './category-picker';

const L = CATALOG_LIMITS;

/**
 * Create/edit form for a product. `onSubmit` returns the mutation promise so
 * server errors can be mapped onto the fields; the button is disabled while
 * it is pending, which prevents duplicate submissions. Price and cost share
 * one currency (chosen next to the price, shown next to the cost).
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
  const m = useMessages(catalog);
  const c = useMessages(common);
  const f = useFormat();
  const errorMessage = useApiErrorMessage();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FieldErrors<ProductField>>({});
  const [formError, setFormError] = useState<unknown>(null);

  const set = (field: ProductField) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  /** Where an API error belongs: a specific field, or the form as a whole. */
  const mapSubmitError = (
    error: unknown,
  ): { fields: FieldErrors<ProductField>; form?: unknown } => {
    if (hasErrorCode(error, 'VALIDATION_ERROR')) {
      const fields = serverFieldErrors(error, PRODUCT_FIELDS, c.errors);
      return hasErrors(fields) ? { fields } : { fields, form: error };
    }
    if (hasErrorCode(error, 'PRODUCT_SKU_TAKEN')) {
      return { fields: { sku: errorMessage(error) } };
    }
    if (hasErrorCode(error, 'PRODUCT_CATEGORY_NOT_FOUND')) {
      return { fields: { categoryId: m.form.categoryGone } };
    }
    return { fields: {}, form: error };
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const validation = validateProduct(values, m.validation, {
      costOptional,
      formatNumber: f.number,
    });
    setErrors(validation);
    setFormError(null);
    if (hasErrors(validation)) return;
    try {
      await onSubmit(values);
    } catch (error) {
      const mapped = mapSubmitError(error);
      setErrors(mapped.fields);
      setFormError(mapped.form ?? null);
    }
  };

  const symbol = currencySymbol(values.currency, f.locale);

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      {notice}
      {formError !== null && <Alert tone="danger">{errorMessage(formError)}</Alert>}
      {hasErrors(errors) && formError === null && <Alert tone="danger">{m.form.checkFields}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>{m.form.details}</CardTitle>
          <CardDescription>{m.form.detailsHint}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <FormField label={m.form.name} error={errors.name} className="sm:col-span-2">
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
          <FormField label={m.form.sku} error={errors.sku} hint={m.form.skuHint}>
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
          <FormField label={m.form.category} error={errors.categoryId}>
            {(control) => (
              <CategoryPicker
                control={control}
                value={
                  values.categoryId ? { id: values.categoryId, name: values.categoryName } : null
                }
                onChange={(category) => {
                  setValues((current) => ({
                    ...current,
                    categoryId: category?.id ?? '',
                    categoryName: category?.name ?? '',
                  }));
                  setErrors((current) => ({ ...current, categoryId: undefined }));
                }}
              />
            )}
          </FormField>
          <FormField
            label={m.form.description}
            error={errors.description}
            hint={m.form.optional}
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
          <CardTitle>{m.form.pricing}</CardTitle>
          <CardDescription>{m.form.pricingHint}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <FormField
            label={m.form.price}
            error={errors.price ?? errors.currency}
            hint={m.form.priceHint}
          >
            {(control) => (
              <div className="flex gap-2">
                <MoneyInput
                  {...control}
                  name="price"
                  symbol={symbol}
                  value={values.price}
                  onChange={(event) => set('price')(event.target.value)}
                />
                <Select
                  aria-label={m.form.currency}
                  name="currency"
                  wrapperClassName="w-28 shrink-0"
                  value={values.currency}
                  onChange={(event) => set('currency')(event.target.value as Currency)}
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency} ({currencySymbol(currency, f.locale)})
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </FormField>
          <FormField
            label={m.form.cost}
            error={errors.cost}
            hint={costOptional ? m.form.costOptionalHint : m.form.costHint}
          >
            {(control) => (
              <div className="flex gap-2">
                <MoneyInput
                  {...control}
                  name="cost"
                  symbol={symbol}
                  value={values.cost}
                  onChange={(event) => set('cost')(event.target.value)}
                />
                <span
                  className="flex h-9 w-28 shrink-0 items-center justify-center rounded-control border border-border bg-surface-muted text-sm font-medium text-muted-foreground"
                  title={m.form.currency}
                >
                  {values.currency}
                </span>
              </div>
            )}
          </FormField>
          <FormField
            label={m.form.minimumStock}
            error={errors.minimumStock}
            hint={m.form.minimumStockHint}
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
          {m.form.cancel}
        </Link>
        <Button type="submit" isLoading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** A decimal amount field with the currency symbol in front (the amount stays a string). */
function MoneyInput({
  symbol,
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & { symbol: string }) {
  return (
    <div className="relative min-w-0 flex-1">
      <span
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
        aria-hidden="true"
      >
        {symbol}
      </span>
      <Input {...props} inputMode="decimal" autoComplete="off" className="pl-8 tabular-nums" />
    </div>
  );
}
