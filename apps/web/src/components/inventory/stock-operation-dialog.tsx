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
import { type Formatter, useFormat } from '@/i18n/format';
import type { Translation } from '@/i18n/define';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { stock as stockMessages } from '@/i18n/messages/stock';
import { useApiErrorMessage } from '@/lib/api-errors';
import { type FieldErrors, hasErrors } from '@/lib/auth-form';
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

type OperationMessages = Translation<typeof stockMessages.en>['operation'];

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
  const m = useMessages(stockMessages).operation;
  return (
    <Dialog
      open={start !== null}
      onClose={onClose}
      title={start ? m[start.kind].title : ''}
      description={start ? m[start.kind].description : undefined}
      size="md"
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
  const s = useMessages(stockMessages);
  const m = s.operation;
  const c = useMessages(common);
  const f = useFormat();
  const errorMessage = useApiErrorMessage();
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
    const validation = validateStockForm(kind, values, current, s.validation, f.number);
    setErrors(validation);
    setFormError(null);
    if (hasErrors(validation)) return;

    operation.mutate(toStockOperation(kind, values), {
      onSuccess: (result) => onDone(successMessage(result, product?.name ?? m.theProduct, m, f)),
      onError: (error) => {
        const mapped = mapStockError(error, errorMessage, c.errors);
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
          <option value="">{warehouses.isPending ? m.loadingWarehouses : m.chooseWarehouse}</option>
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
      {formError !== null && <Alert tone="danger">{errorMessage(formError)}</Alert>}
      {warehouses.isSuccess && active.length === 0 && (
        <Alert tone="warning">{m.noActiveWarehouse}</Alert>
      )}

      {start.product ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">{m.product}</p>
          <p className="text-sm">
            {start.product.name}{' '}
            <span className="font-mono text-xs text-muted-foreground">{start.product.sku}</span>
          </p>
        </div>
      ) : (
        <FormField label={m.product} error={errors.productId}>
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
          {warehouseSelect('warehouseId', m.fromWarehouse)}
          {warehouseSelect('destinationWarehouseId', m.toWarehouse, values.warehouseId)}
        </div>
      ) : (
        warehouseSelect('warehouseId', m.warehouse)
      )}

      <FormField
        label={m[kind].quantity}
        error={errors.quantity}
        hint={kind === 'adjust' ? m.adjustHint : undefined}
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
        label={m.reason}
        error={errors.reason}
        hint={REASON_REQUIRED[kind] ? m.reasonRequired : m.reasonOptional}
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
          {m.cancel}
        </Button>
        <Button type="submit" isLoading={operation.isPending}>
          {m[kind].submit}
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
  const m = useMessages(stockMessages).operation;
  const f = useFormat();
  if (current === undefined) {
    return loading ? <p className="text-sm text-muted-foreground">{m.checking}</p> : null;
  }
  const n = units ?? 0;
  const rows: [string, ReactNode][] = [];

  switch (kind) {
    case 'receive':
      rows.push(
        [m.currentStock, f.number(current)],
        [m.receive.quantity, f.number(n)],
        [m.newStock, f.number(current + n)],
      );
      break;
    case 'issue':
    case 'damage':
      rows.push(
        [m.currentStock, f.number(current)],
        [m[kind].quantity, f.number(n)],
        [m.remaining, f.number(current - n)],
      );
      break;
    case 'adjust':
      rows.push(
        [m.current, f.number(current)],
        [m.new, units === null ? '—' : f.number(units)],
        [
          m.adjustment,
          units === null ? '—' : units === current ? m.noChange : f.signed(units - current),
        ],
      );
      break;
    case 'transfer':
      if (!source || !destination || destinationCurrent === undefined) {
        rows.push([m.sourceNow({ name: source?.name ?? m.source }), f.number(current)]);
        break;
      }
      rows.push(
        [`${source.name} (${source.code})`, m.units({ count: f.number(current) })],
        [
          `${destination.name} (${destination.code})`,
          m.units({ count: f.number(destinationCurrent) }),
        ],
        [m.transferRow, f.number(n)],
        [
          m.after,
          <span key="after" className="inline-flex flex-wrap items-center gap-1">
            {source.code} {f.number(current - n)}
            <ArrowRight className="size-3" aria-hidden="true" />
            {destination.code} {f.number(destinationCurrent + n)}
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
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm" aria-label={m.preview}>
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {insufficient && (
        <p className="text-xs text-danger">{m.moreThanOnHand({ count: f.number(current) })}</p>
      )}
      <p className="text-xs text-subtle-foreground">{m.previewOnly}</p>
    </div>
  );
}

function successMessage(
  result: StockOperationResult,
  product: string,
  m: OperationMessages,
  f: Formatter,
): string {
  switch (result.kind) {
    case 'receive': {
      const { movement, inventory } = result.data;
      return m.received({
        count: f.number(movement.quantityDelta),
        product,
        warehouse: inventory.warehouse.code,
        total: f.number(inventory.quantity),
      });
    }
    case 'issue':
    case 'damage': {
      const { movement, inventory } = result.data;
      const params = {
        count: f.number(Math.abs(movement.quantityDelta)),
        product,
        warehouse: inventory.warehouse.code,
        total: f.number(inventory.quantity),
      };
      return result.kind === 'issue' ? m.issued(params) : m.wroteOff(params);
    }
    case 'adjust': {
      const { movement, inventory } = result.data;
      if (!movement) return m.noAdjustment;
      return m.adjusted({
        product,
        warehouse: inventory?.warehouse.code ?? m.theWarehouse,
        delta: f.signed(movement.quantityDelta),
        total: f.number(movement.quantityAfter),
      });
    }
    case 'transfer': {
      const { source, destination, movements } = result.data;
      return m.transferred({
        count: f.number(movements[1].quantityDelta),
        product,
        from: source.warehouse.code,
        fromTotal: f.number(source.quantity),
        to: destination.warehouse.code,
        toTotal: f.number(destination.quantity),
      });
    }
  }
}
