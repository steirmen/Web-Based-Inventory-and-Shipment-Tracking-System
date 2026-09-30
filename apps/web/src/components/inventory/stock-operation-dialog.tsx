import { INVENTORY_LIMITS, type Warehouse } from '@app/shared';
import { ArrowRight } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import type { StockOperationResult } from '@/api/inventory';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useInventory, useStockOperation, useWarehouses } from '@/hooks/use-inventory';
import { apiErrorMessage } from '@/lib/api-errors';
import { type FieldErrors, hasErrors } from '@/lib/auth-form';
import { formatDelta } from '@/lib/inventory-params';
import { useCurrentOrganization } from '@/lib/organization-context';
import {
  mapStockError,
  parseUnits,
  REASON_REQUIRED,
  type StockField,
  type StockFormValues,
  type StockOperationKind,
  toStockOperation,
  validateStockForm,
} from '@/lib/stock-form';
import { type ProductChoice, ProductPicker } from './product-picker';

const COPY: Record<
  StockOperationKind,
  { title: string; description: string; submit: string; quantity: string }
> = {
  receive: {
    title: 'Receive stock',
    description: 'Add units that arrived, e.g. a supplier delivery.',
    submit: 'Receive',
    quantity: 'Quantity to receive',
  },
  issue: {
    title: 'Issue stock',
    description: 'Remove units that left the warehouse, e.g. a sale.',
    submit: 'Issue',
    quantity: 'Quantity to remove',
  },
  damage: {
    title: 'Record damage',
    description: 'Write off units that are damaged, lost, or expired.',
    submit: 'Write off',
    quantity: 'Quantity to write off',
  },
  adjust: {
    title: 'Adjust stock',
    description: 'Set the quantity you counted. The difference is recorded as an adjustment.',
    submit: 'Save count',
    quantity: 'New quantity',
  },
  transfer: {
    title: 'Transfer stock',
    description: 'Move units from one warehouse to another.',
    submit: 'Transfer',
    quantity: 'Quantity to transfer',
  },
};

export interface StockOperationStart {
  kind: StockOperationKind;
  /** Preselected (source) warehouse. */
  warehouseId?: string;
  /** Preselected product; it can't be changed in the dialog. */
  product?: ProductChoice;
}

/**
 * One dialog for every stock operation. It shows the current stock and the
 * expected result as a preview (UX only: the server re-reads the locked
 * stock and validates again). Submitting twice is impossible while a request
 * runs.
 */
export function StockOperationDialog({
  start,
  onClose,
  onDone,
}: {
  /** `null` keeps the dialog closed. */
  start: StockOperationStart | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <Dialog
      open={start !== null}
      onClose={onClose}
      title={start ? COPY[start.kind].title : ''}
      description={start ? COPY[start.kind].description : undefined}
      className="max-w-lg"
    >
      {start && (
        <StockOperationForm
          key={`${start.kind}:${start.warehouseId ?? ''}:${start.product?.id ?? ''}`}
          start={start}
          onCancel={onClose}
          onDone={onDone}
        />
      )}
    </Dialog>
  );
}

function StockOperationForm({
  start,
  onCancel,
  onDone,
}: {
  start: StockOperationStart;
  onCancel: () => void;
  onDone: (message: string) => void;
}) {
  const { kind } = start;
  const { organization } = useCurrentOrganization();
  const warehouses = useWarehouses(organization.id);
  const operation = useStockOperation(organization.id);
  const [product, setProduct] = useState<ProductChoice | null>(start.product ?? null);
  const [values, setValues] = useState<StockFormValues>({
    warehouseId: start.warehouseId ?? '',
    destinationWarehouseId: '',
    productId: start.product?.id ?? '',
    quantity: '',
    reason: '',
  });
  const [errors, setErrors] = useState<FieldErrors<StockField>>({});
  const [formError, setFormError] = useState<unknown>(null);

  // Current stock of the chosen product in every warehouse (one request, ≤ 100 rows).
  const stock = useInventory(
    organization.id,
    { productId: values.productId, page: 1, pageSize: INVENTORY_LIMITS.pageSizeMax },
    { enabled: Boolean(values.productId) },
  );
  const quantityIn = (warehouseId: string): number | undefined => {
    if (!values.productId || !warehouseId || !stock.data || stock.isPlaceholderData) {
      return undefined;
    }
    return stock.data.items.find((item) => item.warehouse.id === warehouseId)?.quantity ?? 0;
  };

  const active = (warehouses.data?.warehouses ?? []).filter((warehouse) => warehouse.isActive);
  const byId = (id: string) => warehouses.data?.warehouses.find((warehouse) => warehouse.id === id);
  const source = byId(values.warehouseId);
  const destination = byId(values.destinationWarehouseId);
  const current = quantityIn(values.warehouseId);
  const destinationCurrent = quantityIn(values.destinationWarehouseId);
  const units = parseUnits(values.quantity);

  const set = (field: StockField) => (value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (operation.isPending) return;
    const validation = validateStockForm(kind, values, current);
    setErrors(validation);
    setFormError(null);
    if (hasErrors(validation)) return;

    operation.mutate(toStockOperation(kind, values), {
      onSuccess: (result) => onDone(successMessage(result, product?.name ?? 'the product')),
      onError: (error) => {
        const mapped = mapStockError(error);
        setErrors(mapped.fields);
        setFormError(mapped.form ?? null);
      },
    });
  };

  const warehouseSelect = (
    field: 'warehouseId' | 'destinationWarehouseId',
    label: string,
    exclude?: string,
  ) => (
    <FormField label={label} error={errors[field]}>
      {(control) => (
        <Select
          {...control}
          name={field}
          value={values[field]}
          onChange={(event) => set(field)(event.target.value)}
        >
          <option value="">
            {warehouses.isPending ? 'Loading warehouses…' : 'Choose a warehouse'}
          </option>
          {active
            .filter((warehouse) => warehouse.id !== exclude)
            .map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name} ({warehouse.code})
              </option>
            ))}
        </Select>
      )}
    </FormField>
  );

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {formError !== null && <Alert tone="danger">{apiErrorMessage(formError)}</Alert>}
      {warehouses.isSuccess && active.length === 0 && (
        <Alert tone="warning">
          There is no active warehouse. Create or restore a warehouse first.
        </Alert>
      )}

      {start.product ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Product</p>
          <p className="text-sm">
            {start.product.name}{' '}
            <span className="font-mono text-xs text-muted-foreground">{start.product.sku}</span>
          </p>
        </div>
      ) : (
        <FormField label="Product" error={errors.productId}>
          {(control) => (
            <ProductPicker
              control={control}
              value={values.productId}
              selected={product}
              onChange={(choice) => {
                setProduct(choice);
                set('productId')(choice?.id ?? '');
              }}
            />
          )}
        </FormField>
      )}

      {kind === 'transfer' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {warehouseSelect('warehouseId', 'From warehouse')}
          {warehouseSelect('destinationWarehouseId', 'To warehouse', values.warehouseId)}
        </div>
      ) : (
        warehouseSelect('warehouseId', 'Warehouse')
      )}

      <FormField
        label={COPY[kind].quantity}
        error={errors.quantity}
        hint={kind === 'adjust' ? 'The total you counted, not the difference.' : undefined}
      >
        {(control) => (
          <Input
            {...control}
            name="quantity"
            inputMode="numeric"
            autoComplete="off"
            className="tabular-nums"
            value={values.quantity}
            onChange={(event) => set('quantity')(event.target.value)}
          />
        )}
      </FormField>

      <Preview
        kind={kind}
        units={units}
        current={current}
        source={source}
        destination={destination}
        destinationCurrent={destinationCurrent}
        loading={Boolean(values.productId && values.warehouseId) && stock.isFetching}
      />

      <FormField
        label="Reason"
        error={errors.reason}
        hint={REASON_REQUIRED[kind] ? 'Required.' : 'Optional, e.g. a delivery note number.'}
      >
        {(control) => (
          <Textarea
            {...control}
            name="reason"
            rows={2}
            maxLength={INVENTORY_LIMITS.reasonMaxLength}
            value={values.reason}
            onChange={(event) => set('reason')(event.target.value)}
          />
        )}
      </FormField>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={operation.isPending}>
          Cancel
        </Button>
        <Button type="submit" isLoading={operation.isPending}>
          {COPY[kind].submit}
        </Button>
      </div>
    </form>
  );
}

/** Current → expected quantities. Only shown once the stock is known. */
function Preview({
  kind,
  units,
  current,
  source,
  destination,
  destinationCurrent,
  loading,
}: {
  kind: StockOperationKind;
  units: number | null;
  current: number | undefined;
  source: Warehouse | undefined;
  destination: Warehouse | undefined;
  destinationCurrent: number | undefined;
  loading: boolean;
}) {
  if (current === undefined) {
    return loading ? (
      <p className="text-sm text-muted-foreground">Checking current stock…</p>
    ) : null;
  }
  const n = units ?? 0;
  const rows: [string, ReactNode][] = [];

  switch (kind) {
    case 'receive':
      rows.push(['Current stock', current], ['Quantity to receive', n], ['New stock', current + n]);
      break;
    case 'issue':
    case 'damage':
      rows.push(
        ['Current stock', current],
        [kind === 'issue' ? 'Quantity to remove' : 'Quantity to write off', n],
        ['Remaining stock', current - n],
      );
      break;
    case 'adjust':
      rows.push(
        ['Current', current],
        ['New', units ?? '—'],
        [
          'Adjustment',
          units === null ? '—' : units === current ? 'No change' : formatDelta(units - current),
        ],
      );
      break;
    case 'transfer':
      if (!source || !destination || destinationCurrent === undefined) {
        rows.push([`${source?.name ?? 'Source'} now`, current]);
        break;
      }
      rows.push(
        [`${source.name} (${source.code})`, `${current} units`],
        [`${destination.name} (${destination.code})`, `${destinationCurrent} units`],
        ['Transfer', n],
        [
          'After',
          <span key="after" className="inline-flex flex-wrap items-center gap-1">
            {source.code} {current - n}
            <ArrowRight className="size-3" aria-hidden="true" />
            {destination.code} {destinationCurrent + n}
          </span>,
        ],
      );
      break;
  }

  const insufficient =
    (kind === 'issue' || kind === 'damage' || kind === 'transfer') &&
    units !== null &&
    units > current;

  return (
    <div className="flex flex-col gap-2 rounded-control border border-border bg-surface-muted/50 p-3">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm" aria-label="Preview">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {insufficient && (
        <p className="text-xs text-danger">More than the {current} units on hand.</p>
      )}
      <p className="text-xs text-subtle-foreground">
        Preview only. The final numbers are checked when you submit.
      </p>
    </div>
  );
}

function successMessage(result: StockOperationResult, productName: string): string {
  switch (result.kind) {
    case 'receive': {
      const { movement, inventory } = result.data;
      return `Received ${movement.quantityDelta} × ${productName} into ${inventory.warehouse.code}. New stock: ${inventory.quantity}.`;
    }
    case 'issue':
    case 'damage': {
      const { movement, inventory } = result.data;
      const verb = result.kind === 'issue' ? 'Issued' : 'Wrote off';
      return `${verb} ${Math.abs(movement.quantityDelta)} × ${productName} from ${inventory.warehouse.code}. Remaining: ${inventory.quantity}.`;
    }
    case 'adjust': {
      const { movement, inventory } = result.data;
      if (!movement) return 'No changes were made: the count matches the current quantity.';
      return `Adjusted ${productName} in ${inventory?.warehouse.code ?? 'the warehouse'} by ${formatDelta(movement.quantityDelta)} to ${movement.quantityAfter}.`;
    }
    case 'transfer': {
      const { source, destination, movements } = result.data;
      return `Transferred ${movements[1].quantityDelta} × ${productName} from ${source.warehouse.code} (now ${source.quantity}) to ${destination.warehouse.code} (now ${destination.quantity}).`;
    }
  }
}
