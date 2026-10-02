import { INVENTORY_LIMITS } from '@app/shared';
import type { StockOperation } from '@/api/inventory';
import type { Translation } from '@/i18n/define';
import type { common } from '@/i18n/messages/common';
import type { stock } from '@/i18n/messages/stock';
import { hasErrorCode } from './api-errors';
import { type FieldErrors, hasErrors, serverFieldErrors } from './auth-form';

type Validation = Translation<typeof stock.en>['validation'];

/**
 * Client-side checks and request building for the stock operation dialog.
 * Previews and checks here are UX only: the server re-reads the locked stock
 * and validates every operation again.
 */

export type StockOperationKind = StockOperation['kind'];

export interface StockFormValues {
  warehouseId: string;
  /** Transfers only. */
  destinationWarehouseId: string;
  productId: string;
  /** Units to receive/issue/damage/transfer, or the counted quantity for an adjustment. */
  quantity: string;
  reason: string;
}

export type StockField = keyof StockFormValues;

const L = INVENTORY_LIMITS;
const WHOLE_NUMBER = /^\d+$/;

export const REASON_REQUIRED: Record<StockOperationKind, boolean> = {
  receive: false,
  issue: false,
  damage: true,
  adjust: true,
  transfer: false,
};

/** Parses a whole number, or null for anything else ("1.5", "-2", "1e3", ""). */
export function parseUnits(value: string): number | null {
  const trimmed = value.trim();
  return WHOLE_NUMBER.test(trimmed) ? Number(trimmed) : null;
}

export function validateStockForm(
  kind: StockOperationKind,
  values: StockFormValues,
  /** Known stock at the (source) warehouse; undefined while unknown. */
  available: number | undefined,
  m: Validation,
  formatNumber: (value: number) => string = (value) => value.toLocaleString('en-US'),
): FieldErrors<StockField> {
  const units = parseUnits(values.quantity);
  const minimum = kind === 'adjust' ? 0 : 1;
  const reason = values.reason.trim();

  let quantity: string | undefined;
  if (units === null || units < minimum) {
    quantity = kind === 'adjust' ? m.countRequired : m.unitsRequired;
  } else if (units > L.quantityMax) {
    quantity = m.tooMany({ max: formatNumber(L.quantityMax) });
  } else if (
    (kind === 'issue' || kind === 'damage' || kind === 'transfer') &&
    available !== undefined &&
    units > available
  ) {
    quantity = m.onlyAvailable({ count: formatNumber(available), one: available === 1 });
  }

  return {
    warehouseId: values.warehouseId
      ? undefined
      : kind === 'transfer'
        ? m.chooseSource
        : m.chooseWarehouse,
    destinationWarehouseId:
      kind !== 'transfer'
        ? undefined
        : !values.destinationWarehouseId
          ? m.chooseDestination
          : values.destinationWarehouseId === values.warehouseId
            ? m.differentWarehouse
            : undefined,
    productId: values.productId ? undefined : m.chooseProduct,
    quantity,
    reason:
      REASON_REQUIRED[kind] && !reason
        ? kind === 'damage'
          ? m.describeDamage
          : m.explainCount
        : reason.length > L.reasonMaxLength
          ? m.reasonTooLong
          : undefined,
  };
}

export function toStockOperation(
  kind: StockOperationKind,
  values: StockFormValues,
): StockOperation {
  const units = parseUnits(values.quantity) ?? 0;
  const reason = values.reason.trim() || null;
  const base = { warehouseId: values.warehouseId, productId: values.productId };
  switch (kind) {
    case 'receive':
    case 'issue':
      return { kind, body: { ...base, quantity: units, reason } };
    case 'damage':
      return { kind, body: { ...base, quantity: units, reason: reason ?? '' } };
    case 'adjust':
      return { kind, body: { ...base, newQuantity: units, reason: reason ?? '' } };
    case 'transfer':
      return {
        kind,
        body: {
          sourceWarehouseId: values.warehouseId,
          destinationWarehouseId: values.destinationWarehouseId,
          productId: values.productId,
          quantity: units,
          reason,
        },
      };
  }
}

/** API field names → form fields. */
const SERVER_FIELDS: Record<string, StockField> = {
  warehouseId: 'warehouseId',
  sourceWarehouseId: 'warehouseId',
  destinationWarehouseId: 'destinationWarehouseId',
  productId: 'productId',
  quantity: 'quantity',
  newQuantity: 'quantity',
  reason: 'reason',
};

/** Where a failed operation's error belongs: a field, or the form as a whole. */
export function mapStockError(
  error: unknown,
  errorMessage: (error: unknown) => string,
  errors: Translation<typeof common.en>['errors'],
): { fields: FieldErrors<StockField>; form?: unknown } {
  const message = errorMessage(error);
  if (
    hasErrorCode(error, 'INVENTORY_INSUFFICIENT_STOCK') ||
    hasErrorCode(error, 'INVENTORY_QUANTITY_LIMIT')
  ) {
    return { fields: { quantity: message } };
  }
  if (
    hasErrorCode(error, 'INVENTORY_PRODUCT_INACTIVE') ||
    hasErrorCode(error, 'INVENTORY_PRODUCT_NOT_FOUND')
  ) {
    return { fields: { productId: message } };
  }
  if (hasErrorCode(error, 'INVENTORY_WAREHOUSE_NOT_FOUND')) {
    return { fields: { warehouseId: message } };
  }
  if (hasErrorCode(error, 'INVENTORY_SAME_WAREHOUSE')) {
    return { fields: { destinationWarehouseId: message } };
  }
  if (hasErrorCode(error, 'VALIDATION_ERROR')) {
    const raw = serverFieldErrors(error, Object.keys(SERVER_FIELDS), errors);
    const fields: FieldErrors<StockField> = {};
    for (const [field, text] of Object.entries(raw)) {
      const target = SERVER_FIELDS[field];
      if (target && text) fields[target] = text;
    }
    return hasErrors(fields) ? { fields } : { fields, form: error };
  }
  // INVENTORY_WAREHOUSE_INACTIVE names the warehouse in its message, which fits either select: show it on top.
  return { fields: {}, form: error };
}
