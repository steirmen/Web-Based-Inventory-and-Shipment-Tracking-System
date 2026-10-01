import { INVENTORY_LIMITS, type Warehouse } from '@app/shared';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCreateWarehouse, useUpdateWarehouse } from '@/hooks/use-inventory';
import { apiErrorMessage, hasErrorCode } from '@/lib/api-errors';
import { type FieldErrors, hasErrors, serverFieldErrors } from '@/lib/auth-form';
import { useCurrentOrganization } from '@/lib/organization-context';
import {
  toCreateWarehouseRequest,
  toUpdateWarehouseRequest,
  validateWarehouse,
  WAREHOUSE_FIELDS,
  type WarehouseField,
  type WarehouseFormValues,
} from '@/lib/warehouse-form';

const L = INVENTORY_LIMITS;

/**
 * Create (`warehouse` = null) or edit a warehouse in a dialog. The code is
 * set once at creation and shown read-only when editing.
 */
export function WarehouseFormDialog({
  open,
  warehouse,
  onClose,
  onSaved,
}: {
  open: boolean;
  warehouse: Warehouse | null;
  onClose: () => void;
  onSaved: (message: string, warehouse: Warehouse) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={warehouse ? 'Edit warehouse' : 'New warehouse'}
      size="md"
      description={
        warehouse ? undefined : 'A place where you keep stock, such as a store room or depot.'
      }
    >
      {open && (
        <WarehouseForm
          key={warehouse?.id ?? 'new'}
          warehouse={warehouse}
          onCancel={onClose}
          onSaved={onSaved}
        />
      )}
    </Dialog>
  );
}

function WarehouseForm({
  warehouse,
  onCancel,
  onSaved,
}: {
  warehouse: Warehouse | null;
  onCancel: () => void;
  onSaved: (message: string, warehouse: Warehouse) => void;
}) {
  const { organization } = useCurrentOrganization();
  const create = useCreateWarehouse(organization.id);
  const update = useUpdateWarehouse(organization.id);
  const pending = create.isPending || update.isPending;
  const [values, setValues] = useState<WarehouseFormValues>({
    name: warehouse?.name ?? '',
    code: warehouse?.code ?? '',
    address: warehouse?.address ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors<WarehouseField>>({});
  const [formError, setFormError] = useState<unknown>(null);

  const set = (field: WarehouseField) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const onError = (error: unknown) => {
    if (hasErrorCode(error, 'WAREHOUSE_CODE_TAKEN')) {
      setErrors({ code: apiErrorMessage(error) });
      return;
    }
    const fields = serverFieldErrors(error, WAREHOUSE_FIELDS);
    setErrors(fields);
    setFormError(hasErrors(fields) ? null : error);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const validation = validateWarehouse(values, { isNew: !warehouse });
    setErrors(validation);
    setFormError(null);
    if (hasErrors(validation)) return;

    if (warehouse) {
      const body = toUpdateWarehouseRequest(warehouse, values);
      if (Object.keys(body).length === 0) {
        onSaved('No changes to save.', warehouse);
        return;
      }
      update.mutate(
        { warehouseId: warehouse.id, body },
        { onSuccess: (data) => onSaved('Warehouse saved.', data.warehouse), onError },
      );
    } else {
      create.mutate(toCreateWarehouseRequest(values), {
        onSuccess: (data) => onSaved(`${data.warehouse.name} created.`, data.warehouse),
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
            maxLength={L.warehouseNameMaxLength}
            value={values.name}
            onChange={(event) => set('name')(event.target.value)}
            data-autofocus
          />
        )}
      </FormField>
      <FormField
        label="Code"
        error={errors.code}
        hint={
          warehouse
            ? "The code can't be changed after the warehouse is created."
            : 'Short and unique, e.g. MAIN or EAST-1. It can’t be changed later.'
        }
      >
        {(control) => (
          <Input
            {...control}
            name="code"
            autoComplete="off"
            spellCheck={false}
            className="font-mono uppercase"
            maxLength={L.warehouseCodeMaxLength}
            value={values.code}
            readOnly={Boolean(warehouse)}
            disabled={Boolean(warehouse)}
            onChange={(event) => set('code')(event.target.value)}
          />
        )}
      </FormField>
      <FormField label="Address" error={errors.address} hint="Optional.">
        {(control) => (
          <Textarea
            {...control}
            name="address"
            rows={3}
            maxLength={L.warehouseAddressMaxLength}
            value={values.address}
            onChange={(event) => set('address')(event.target.value)}
          />
        )}
      </FormField>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" isLoading={pending}>
          {warehouse ? 'Save changes' : 'Create warehouse'}
        </Button>
      </div>
    </form>
  );
}
