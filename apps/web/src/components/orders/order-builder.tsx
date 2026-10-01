import { ORDER_LIMITS, type Order } from '@app/shared';
import { Plus, Trash2, TriangleAlert } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CustomerPicker } from '@/components/customers/customer-picker';
import { type ProductChoice, ProductPicker } from '@/components/inventory/product-picker';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useInventory, useWarehouses } from '@/hooks/use-inventory';
import { useCreateOrder, useUpdateOrder } from '@/hooks/use-sales';
import { apiErrorMessage } from '@/lib/api-errors';
import { formatMoney } from '@/lib/money';
import {
  hasOrderErrors,
  linePreview,
  mapOrderError,
  type OrderFormErrors,
  type OrderFormState,
  type OrderLineDraft,
  orderFormState,
  parseQuantity,
  subtotalPreview,
  toCreateOrderRequest,
  toUpdateOrderRequest,
  validateOrderForm,
} from '@/lib/order-form';
import { useCurrentOrganization } from '@/lib/organization-context';
import { paths } from '@/routes/paths';

const NO_ERRORS: OrderFormErrors = { fields: {}, lines: {} };

/**
 * Creates a DRAFT (`order` = null) or edits one. Customer and products are
 * searched on the server; stock is shown per line for the chosen warehouse
 * (informational — nothing is reserved, and the server checks stock again
 * when the order is processed). Saving twice is impossible while a request runs.
 */
export function OrderBuilder({ order }: { order: Order | null }) {
  const { organization } = useCurrentOrganization();
  const navigate = useNavigate();
  const warehouses = useWarehouses(organization.id);
  const create = useCreateOrder(organization.id);
  const update = useUpdateOrder(organization.id);
  const pending = create.isPending || update.isPending;
  const [state, setState] = useState<OrderFormState>(() => orderFormState(order));
  const [picked, setPicked] = useState<ProductChoice | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [errors, setErrors] = useState<OrderFormErrors>(NO_ERRORS);
  const [formError, setFormError] = useState<unknown>(null);

  const change = (next: Partial<OrderFormState>) => {
    setState((current) => ({ ...current, ...next }));
    setErrors(NO_ERRORS);
  };
  const setLine = (productId: string, quantity: string) =>
    change({
      lines: state.lines.map((line) =>
        line.productId === productId ? { ...line, quantity } : line,
      ),
    });

  const addPicked = () => {
    if (!picked) return;
    if (state.lines.some((line) => line.productId === picked.id)) {
      setPickError(`${picked.name} is already on the order — change its quantity instead.`);
      return;
    }
    if (!picked.price) return;
    change({
      lines: [
        ...state.lines,
        {
          productId: picked.id,
          name: picked.name,
          sku: picked.sku,
          unitPrice: picked.price,
          quantity: '1',
          saved: false,
          archived: false,
        },
      ],
    });
    setPicked(null);
    setPickError(null);
  };

  const active = (warehouses.data?.warehouses ?? []).filter((warehouse) => warehouse.isActive);
  const current = order && !order.warehouse.isActive ? order.warehouse : null;
  const warehouse = warehouses.data?.warehouses.find((entry) => entry.id === state.warehouseId);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const validation = validateOrderForm(state);
    setErrors(validation);
    setFormError(null);
    if (hasOrderErrors(validation)) return;

    const onError = (error: unknown) => {
      const mapped = mapOrderError(error, state.lines);
      setErrors(mapped.errors);
      setFormError(mapped.form);
    };
    const done = (id: string, notice: string) =>
      void navigate(paths.order(organization.id, id), { state: { notice } });

    if (order) {
      const body = toUpdateOrderRequest(order, state);
      if (Object.keys(body).length === 0) {
        done(order.id, 'No changes to save.');
        return;
      }
      update.mutate(
        { orderId: order.id, body },
        { onSuccess: (data) => done(data.order.id, 'Draft saved.'), onError },
      );
    } else {
      create.mutate(toCreateOrderRequest(state), {
        onSuccess: (data) => done(data.order.id, `Draft ${data.order.orderNumber} created.`),
        onError,
      });
    }
  };

  const subtotal = subtotalPreview(state.lines);

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      {formError !== null && <Alert tone="danger">{apiErrorMessage(formError)}</Alert>}

      <Card>
        <CardHeader>
          <StepTitle step={1}>Customer and warehouse</StepTitle>
          <CardDescription>The warehouse the order will be fulfilled from.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <FormField label="Customer" error={errors.fields.customerId}>
            {(control) => (
              <CustomerPicker
                control={control}
                selected={state.customer}
                onChange={(customer) => change({ customer })}
              />
            )}
          </FormField>
          <FormField label="Warehouse" error={errors.fields.warehouseId}>
            {(control) => (
              <Select
                {...control}
                name="warehouseId"
                value={state.warehouseId}
                onChange={(event) => change({ warehouseId: event.target.value })}
              >
                <option value="">
                  {warehouses.isPending ? 'Loading warehouses…' : 'Choose a warehouse'}
                </option>
                {current && (
                  <option value={current.id}>
                    {current.name} ({current.code}) — archived
                  </option>
                )}
                {active.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} ({entry.code})
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <StepTitle step={2}>Products</StepTitle>
          <CardDescription>
            Prices are taken from the product when it is added and stay fixed on this order.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            <FormField label="Add a product" className="md:flex-1" error={pickError ?? undefined}>
              {(control) => (
                <ProductPicker
                  control={control}
                  value={picked?.id ?? ''}
                  selected={picked}
                  onChange={(product) => {
                    setPicked(product);
                    setPickError(null);
                  }}
                />
              )}
            </FormField>
            <Button
              variant="secondary"
              onClick={addPicked}
              disabled={!picked?.price}
              className="md:mb-0.5"
            >
              <Plus aria-hidden="true" />
              Add to order
            </Button>
          </div>

          {errors.fields.items && <Alert tone="danger">{errors.fields.items}</Alert>}

          {state.lines.length === 0 ? (
            <p className="rounded-control border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              No products yet. You can save the draft now, but it needs at least one product before
              it can be confirmed.
            </p>
          ) : (
            <ul
              className="divide-y divide-border rounded-control border border-border"
              aria-label="Order lines"
            >
              {state.lines.map((line) => (
                <OrderLineRow
                  key={line.productId}
                  line={line}
                  warehouseId={state.warehouseId}
                  warehouseCode={warehouse?.code}
                  error={errors.lines[line.productId]}
                  onQuantity={(quantity) => setLine(line.productId, quantity)}
                  onRemove={() =>
                    change({
                      lines: state.lines.filter((entry) => entry.productId !== line.productId),
                    })
                  }
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <StepTitle step={3}>Review and save</StepTitle>
          <CardDescription>
            Saving keeps the order as a draft: nothing is reserved or deducted yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <FormField
            label="Notes"
            error={errors.fields.notes}
            hint="Optional, visible on the order."
          >
            {(control) => (
              <Textarea
                {...control}
                name="notes"
                rows={3}
                maxLength={ORDER_LIMITS.notesMaxLength}
                value={state.notes}
                onChange={(event) => change({ notes: event.target.value })}
              />
            )}
          </FormField>
          <div className="flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <dl className="flex items-baseline gap-3 text-sm" aria-label="Order total">
              <dt className="text-muted-foreground">
                Total ({state.lines.length} {state.lines.length === 1 ? 'line' : 'lines'})
              </dt>
              <dd className="text-xl font-semibold tabular-nums">{formatMoney(subtotal)}</dd>
            </dl>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Link
                to={order ? paths.order(organization.id, order.id) : paths.orders(organization.id)}
                className={buttonVariants({ variant: 'secondary' })}
              >
                Cancel
              </Link>
              <Button type="submit" isLoading={pending}>
                {order ? 'Save draft' : 'Create draft'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

/** One line: product, current stock in the chosen warehouse, price, quantity, and line total. */
/** Card title with its step number: the builder reads top to bottom, 1 → 3. */
function StepTitle({ step, children }: { step: number; children: string }) {
  return (
    <CardTitle className="flex items-center gap-2.5">
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground"
        aria-hidden="true"
      >
        {step}
      </span>
      {children}
    </CardTitle>
  );
}

function OrderLineRow({
  line,
  warehouseId,
  warehouseCode,
  error,
  onQuantity,
  onRemove,
}: {
  line: OrderLineDraft;
  warehouseId: string;
  warehouseCode: string | undefined;
  error: string | undefined;
  onQuantity: (value: string) => void;
  onRemove: () => void;
}) {
  const { organization } = useCurrentOrganization();
  // Re-read whenever the warehouse changes; never trusted by the server.
  const stock = useInventory(
    organization.id,
    { warehouseId, productId: line.productId, page: 1, pageSize: 1 },
    { enabled: Boolean(warehouseId) },
  );
  const available =
    warehouseId && stock.data && !stock.isPlaceholderData
      ? (stock.data.items[0]?.quantity ?? 0)
      : null;
  const quantity = parseQuantity(line.quantity);
  const short = available !== null && quantity !== null && quantity > available;
  const total = linePreview(line);
  const inputId = `quantity-${line.productId}`;
  const messageId = `${inputId}-message`;

  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 p-3 sm:grid-cols-[1fr_7rem_6rem_7rem_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium">{line.name}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{line.sku}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {!warehouseId
            ? 'Choose a warehouse to see stock.'
            : available === null
              ? 'Checking stock…'
              : `${available.toLocaleString()} in stock${warehouseCode ? ` in ${warehouseCode}` : ''}`}
        </p>
        {line.archived && (
          <p className="mt-1 text-xs text-danger">
            Product archived — remove it before confirming.
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="justify-self-end sm:order-last"
        onClick={onRemove}
        aria-label={`Remove ${line.name}`}
        title="Remove"
      >
        <Trash2 aria-hidden="true" />
      </Button>
      <div className="text-sm sm:text-right">
        <span className="text-xs text-muted-foreground sm:hidden">Unit price </span>
        <span className="tabular-nums">{formatMoney(line.unitPrice)}</span>
        {!line.saved && <span className="block text-xs text-muted-foreground">current price</span>}
      </div>
      <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
        <label htmlFor={inputId} className="sr-only">
          Quantity of {line.name}
        </label>
        <Input
          id={inputId}
          inputMode="numeric"
          autoComplete="off"
          className="tabular-nums"
          value={line.quantity}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || short ? messageId : undefined}
          onChange={(event) => onQuantity(event.target.value)}
        />
        {(error || short) && (
          <p
            id={messageId}
            className={error ? 'text-xs text-danger' : 'text-xs text-warning-soft-foreground'}
          >
            {error ?? (
              <span className="inline-flex items-center gap-1">
                <TriangleAlert className="size-3" aria-hidden="true" />
                More than the {available} in stock
              </span>
            )}
          </p>
        )}
      </div>
      <p className="text-right text-sm font-medium tabular-nums">
        <span className="text-xs font-normal text-muted-foreground sm:hidden">Line total </span>
        {total === null ? '—' : formatMoney(total)}
      </p>
    </li>
  );
}
