import { CATALOG_LIMITS, type Category } from '@app/shared';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCreateCategory, useUpdateCategory } from '@/hooks/use-catalog';
import { apiErrorMessage, hasErrorCode } from '@/lib/api-errors';
import { type FieldErrors, hasErrors, serverFieldErrors } from '@/lib/auth-form';
import { useCurrentOrganization } from '@/lib/organization-context';
import {
  CATEGORY_FIELDS,
  type CategoryField,
  type CategoryFormValues,
  toCategoryRequest,
  validateCategory,
} from '@/lib/product-form';

/**
 * Create (`category` = null) or edit a category in a modal dialog. Server
 * errors land on the matching field: a duplicate name on "Name".
 */
export function CategoryFormDialog({
  open,
  category,
  onClose,
  onSaved,
}: {
  open: boolean;
  category: Category | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={category ? 'Edit category' : 'New category'}
      description={
        category ? undefined : 'Group related products, e.g. "Office supplies" or "Packaging".'
      }
    >
      {/* Re-mounted per opening so the form starts from the category's current values. */}
      {open && (
        <CategoryForm
          key={category?.id ?? 'new'}
          category={category}
          onCancel={onClose}
          onSaved={onSaved}
        />
      )}
    </Dialog>
  );
}

function CategoryForm({
  category,
  onCancel,
  onSaved,
}: {
  category: Category | null;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const { organization } = useCurrentOrganization();
  const create = useCreateCategory(organization.id);
  const update = useUpdateCategory(organization.id);
  const mutation = category ? update : create;
  const [values, setValues] = useState<CategoryFormValues>({
    name: category?.name ?? '',
    description: category?.description ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors<CategoryField>>({});
  const [formError, setFormError] = useState<unknown>(null);

  const set = (field: CategoryField) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const onError = (error: unknown) => {
    if (hasErrorCode(error, 'CATEGORY_NAME_TAKEN')) {
      setErrors({ name: apiErrorMessage(error) });
      return;
    }
    const fields = serverFieldErrors(error, CATEGORY_FIELDS);
    setErrors(fields);
    setFormError(hasErrors(fields) ? null : error);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending) return;
    const validation = validateCategory(values);
    setErrors(validation);
    setFormError(null);
    if (hasErrors(validation)) return;
    const body = toCategoryRequest(values);

    if (category) {
      update.mutate(
        { categoryId: category.id, body },
        { onSuccess: () => onSaved('Category saved.'), onError },
      );
    } else {
      create.mutate(body, {
        onSuccess: ({ category: created }) => onSaved(`${created.name} created.`),
        onError,
      });
    }
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {formError !== null && <Alert tone="danger">{apiErrorMessage(formError)}</Alert>}
      <FormField label="Name" error={errors.name}>
        {(control) => (
          <Input
            {...control}
            name="name"
            autoComplete="off"
            maxLength={CATALOG_LIMITS.categoryNameMaxLength}
            value={values.name}
            onChange={(event) => set('name')(event.target.value)}
            data-autofocus
          />
        )}
      </FormField>
      <FormField label="Description" error={errors.description} hint="Optional.">
        {(control) => (
          <Textarea
            {...control}
            name="description"
            rows={3}
            maxLength={CATALOG_LIMITS.categoryDescriptionMaxLength}
            value={values.description}
            onChange={(event) => set('description')(event.target.value)}
          />
        )}
      </FormField>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" isLoading={mutation.isPending}>
          {category ? 'Save changes' : 'Create category'}
        </Button>
      </div>
    </form>
  );
}
