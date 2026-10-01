import { CUSTOMER_LIMITS, type Customer } from '@app/shared';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCreateCustomer, useUpdateCustomer } from '@/hooks/use-sales';
import { apiErrorMessage } from '@/lib/api-errors';
import { type FieldErrors, hasErrors, serverFieldErrors } from '@/lib/auth-form';
import {
  CUSTOMER_FIELDS,
  type CustomerField,
  type CustomerFormValues,
  customerFormValues,
  toCustomerRequest,
  toUpdateCustomerRequest,
  validateCustomer,
} from '@/lib/customer-form';
import { useCurrentOrganization } from '@/lib/organization-context';

const L = CUSTOMER_LIMITS;

/** Create (`customer` = null) or edit a customer in a dialog. */
export function CustomerFormDialog({
  open,
  customer,
  onClose,
  onSaved,
}: {
  open: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSaved: (message: string, customer: Customer) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={customer ? 'Edit customer' : 'New customer'}
      description={customer ? undefined : 'Someone you sell to: a person or a business contact.'}
      className="max-w-lg"
    >
      {open && (
        <CustomerForm
          key={customer?.id ?? 'new'}
          customer={customer}
          onCancel={onClose}
          onSaved={onSaved}
        />
      )}
    </Dialog>
  );
}

function CustomerForm({
  customer,
  onCancel,
  onSaved,
}: {
  customer: Customer | null;
  onCancel: () => void;
  onSaved: (message: string, customer: Customer) => void;
}) {
  const { organization } = useCurrentOrganization();
  const create = useCreateCustomer(organization.id);
  const update = useUpdateCustomer(organization.id);
  const pending = create.isPending || update.isPending;
  const [values, setValues] = useState<CustomerFormValues>(customerFormValues(customer));
  const [errors, setErrors] = useState<FieldErrors<CustomerField>>({});
  const [formError, setFormError] = useState<unknown>(null);

  const set = (field: CustomerField) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const onError = (error: unknown) => {
    const fields = serverFieldErrors(error, CUSTOMER_FIELDS);
    setErrors(fields);
    setFormError(hasErrors(fields) ? null : error);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const validation = validateCustomer(values);
    setErrors(validation);
    setFormError(null);
    if (hasErrors(validation)) return;

    if (customer) {
      const body = toUpdateCustomerRequest(customer, values);
      if (Object.keys(body).length === 0) {
        onSaved('No changes to save.', customer);
        return;
      }
      update.mutate(
        { customerId: customer.id, body },
        { onSuccess: (data) => onSaved('Customer saved.', data.customer), onError },
      );
    } else {
      create.mutate(toCustomerRequest(values), {
        onSuccess: (data) => onSaved(`${data.customer.name} added.`, data.customer),
        onError,
      });
    }
  };

  const text = (field: CustomerField, label: string, max: number, extra: object = {}) => (
    <FormField
      label={label}
      error={errors[field]}
      hint={field === 'name' ? undefined : 'Optional.'}
    >
      {(control) => (
        <Input
          {...control}
          name={field}
          maxLength={max}
          value={values[field]}
          onChange={(event) => set(field)(event.target.value)}
          {...extra}
        />
      )}
    </FormField>
  );

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {formError !== null && <Alert tone="danger">{apiErrorMessage(formError)}</Alert>}
      {text('name', 'Name', L.nameMaxLength, { autoComplete: 'off', 'data-autofocus': true })}
      {text('companyName', 'Company', L.companyNameMaxLength, { autoComplete: 'off' })}
      <div className="grid gap-4 sm:grid-cols-2">
        {text('email', 'Email', L.emailMaxLength, { type: 'email', autoComplete: 'off' })}
        {text('phone', 'Phone', L.phoneMaxLength, { type: 'tel', autoComplete: 'off' })}
      </div>
      <FormField label="Address" error={errors.address} hint="Optional.">
        {(control) => (
          <Textarea
            {...control}
            name="address"
            rows={2}
            maxLength={L.addressMaxLength}
            value={values.address}
            onChange={(event) => set('address')(event.target.value)}
          />
        )}
      </FormField>
      <FormField label="Notes" error={errors.notes} hint="Optional, e.g. delivery preferences.">
        {(control) => (
          <Textarea
            {...control}
            name="notes"
            rows={2}
            maxLength={L.notesMaxLength}
            value={values.notes}
            onChange={(event) => set('notes')(event.target.value)}
          />
        )}
      </FormField>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" isLoading={pending}>
          {customer ? 'Save changes' : 'Add customer'}
        </Button>
      </div>
    </form>
  );
}
