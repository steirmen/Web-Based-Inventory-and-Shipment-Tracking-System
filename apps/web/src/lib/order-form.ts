import {
  type CreateOrderRequest,
  type Currency,
  type Order,
  type OrderCustomerRef,
  ORDER_LIMITS,
  type UpdateOrderRequest,
} from '@app/shared';
import { ApiError } from '@/api/http-client';
import type { Translation } from '@/i18n/define';
import type { sales } from '@/i18n/messages/sales';
import { hasErrorCode } from './api-errors';
import type { FieldErrors } from './auth-form';
import { lineTotal, sumMoney } from './order-money';

/**
 * State, client-side checks, and request building for the order builder.
 * Totals shown here are a preview (exact decimal math); the server snapshots
 * prices and computes the stored totals.
 */

export interface OrderLineDraft {
  productId: string;
  name: string;
  sku: string;
  /** Snapshot price for saved lines; the current product price for new ones. */
  unitPrice: string;
  /** Currency of the price (every line of an order has the same one). */
  currency: Currency;
  /** As typed. */
  quantity: string;
  /** Already saved on the order (its price is a snapshot and won't change). */
  saved: boolean;
  archived: boolean;
}

export interface OrderFormState {
  customer: OrderCustomerRef | null;
  warehouseId: string;
  notes: string;
  lines: OrderLineDraft[];
}

export type OrderField = 'customerId' | 'warehouseId' | 'notes' | 'items';

export interface OrderFormErrors {
  fields: FieldErrors<OrderField>;
  /** Per product id. */
  lines: Record<string, string>;
}

const WHOLE_NUMBER = /^\d+$/;

/** A whole number within the allowed range, or null. */
export function parseQuantity(value: string): number | null {
  const trimmed = value.trim();
  if (!WHOLE_NUMBER.test(trimmed)) return null;
  const quantity = Number(trimmed);
  return quantity >= 1 && quantity <= ORDER_LIMITS.quantityMax ? quantity : null;
}

export function orderFormState(order: Order | null): OrderFormState {
  return {
    customer: order?.customer ?? null,
    warehouseId: order?.warehouse.id ?? '',
    notes: order?.notes ?? '',
    lines:
      order?.items.map((item) => ({
        productId: item.productId,
        name: item.productName,
        sku: item.sku,
        unitPrice: item.unitPrice,
        currency: item.currency,
        quantity: String(item.quantity),
        saved: true,
        archived: item.productStatus !== 'ACTIVE',
      })) ?? [],
  };
}

type BuilderMessages = Translation<typeof sales.en>['builder'];

/** The order's currency: the currency of its lines (all the same), null without lines. */
export const orderCurrency = (state: OrderFormState): Currency | null =>
  state.lines[0]?.currency ?? null;

export function validateOrderForm(
  state: OrderFormState,
  m: BuilderMessages,
  formatNumber: (value: number) => string = (value) => value.toLocaleString('en-US'),
): OrderFormErrors {
  const lines: Record<string, string> = {};
  for (const line of state.lines) {
    if (parseQuantity(line.quantity) === null) {
      lines[line.productId] = m.quantityRange({ max: formatNumber(ORDER_LIMITS.quantityMax) });
    }
  }
  return {
    fields: {
      customerId: state.customer ? undefined : m.chooseCustomer,
      warehouseId: state.warehouseId ? undefined : m.warehouseRequired,
      items: state.lines.length > ORDER_LIMITS.itemsMax ? m.tooManyLines : undefined,
      notes: state.notes.trim().length > ORDER_LIMITS.notesMaxLength ? m.notesTooLong : undefined,
    },
    lines,
  };
}

export const hasOrderErrors = (errors: OrderFormErrors) =>
  Object.values(errors.fields).some(Boolean) || Object.keys(errors.lines).length > 0;

/** Line total preview, or null while the quantity is invalid. */
export function linePreview(line: OrderLineDraft): string | null {
  const quantity = parseQuantity(line.quantity);
  return quantity === null ? null : lineTotal(line.unitPrice, quantity);
}

export function subtotalPreview(lines: OrderLineDraft[]): string {
  return sumMoney(lines.flatMap((line) => linePreview(line) ?? []));
}

const itemsOf = (lines: OrderLineDraft[]) =>
  lines.map((line) => ({ productId: line.productId, quantity: parseQuantity(line.quantity) ?? 0 }));

export function toCreateOrderRequest(state: OrderFormState): CreateOrderRequest {
  return {
    customerId: state.customer!.id,
    warehouseId: state.warehouseId,
    notes: state.notes.trim() || null,
    items: itemsOf(state.lines),
  };
}

/** Only what changed; `items` (the complete list) only when a line was added, removed, or changed. */
export function toUpdateOrderRequest(order: Order, state: OrderFormState): UpdateOrderRequest {
  const changes: UpdateOrderRequest = {};
  if (state.customer && state.customer.id !== order.customer?.id) {
    changes.customerId = state.customer.id;
  }
  if (state.warehouseId !== order.warehouse.id) changes.warehouseId = state.warehouseId;
  const notes = state.notes.trim() || null;
  if (notes !== order.notes) changes.notes = notes;
  const items = itemsOf(state.lines);
  const same =
    items.length === order.items.length &&
    items.every((item, index) => {
      const saved = order.items[index]!;
      return saved.productId === item.productId && saved.quantity === item.quantity;
    });
  if (!same) changes.items = items;
  return changes;
}

const FIELD_FOR_CODE: Partial<Record<string, OrderField>> = {
  ORDER_CUSTOMER_NOT_FOUND: 'customerId',
  ORDER_CUSTOMER_INACTIVE: 'customerId',
  ORDER_WAREHOUSE_NOT_FOUND: 'warehouseId',
  ORDER_WAREHOUSE_INACTIVE: 'warehouseId',
  ORDER_PRODUCT_NOT_FOUND: 'items',
  ORDER_PRODUCT_INACTIVE: 'items',
  ORDER_TOTAL_LIMIT: 'items',
  ORDER_CURRENCY_MISMATCH: 'items',
};

/** Where a failed save belongs: a field, a line (by product id), or the form as a whole. */
export function mapOrderError(
  error: unknown,
  lines: OrderLineDraft[],
  errorMessage: (error: unknown) => string,
  fieldError: (params: { message: string }) => string,
  invalidValue: string,
): { errors: OrderFormErrors; form: unknown } {
  const errors: OrderFormErrors = { fields: {}, lines: {} };
  if (!(error instanceof ApiError) || !error.code) return { errors, form: error };
  const field = FIELD_FOR_CODE[error.code];
  if (field) {
    errors.fields[field] = errorMessage(error);
    return { errors, form: null };
  }
  if (hasErrorCode(error, 'VALIDATION_ERROR')) {
    for (const detail of error.details ?? []) {
      const match = /^items\.(\d+)\./.exec(detail.field);
      const line = match ? lines[Number(match[1])] : undefined;
      const message = detail.messages[0]
        ? fieldError({ message: detail.messages[0] })
        : invalidValue;
      if (line) errors.lines[line.productId] = message;
      else if (['customerId', 'warehouseId', 'notes', 'items'].includes(detail.field)) {
        errors.fields[detail.field as OrderField] = message;
      }
    }
    if (hasOrderErrors(errors)) return { errors, form: null };
  }
  return { errors, form: error };
}
