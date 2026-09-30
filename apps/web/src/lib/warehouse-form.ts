import {
  type CreateWarehouseRequest,
  INVENTORY_LIMITS,
  type UpdateWarehouseRequest,
  WAREHOUSE_CODE_PATTERN,
  type Warehouse,
} from '@app/shared';
import type { FieldErrors } from './auth-form';

/** Client-side checks for the warehouse form; the API remains authoritative. */

const L = INVENTORY_LIMITS;

export interface WarehouseFormValues {
  name: string;
  code: string;
  address: string;
}

export type WarehouseField = keyof WarehouseFormValues;

export const WAREHOUSE_FIELDS: readonly WarehouseField[] = ['name', 'code', 'address'];

const collapse = (value: string) => value.trim().replace(/\s+/g, ' ');

/** The code as the server will store it ("east-1 " → "EAST-1"). */
export const normalizeWarehouseCode = (value: string) => value.trim().toUpperCase();

export function validateWarehouse(
  values: WarehouseFormValues,
  options: { isNew: boolean },
): FieldErrors<WarehouseField> {
  const name = collapse(values.name);
  const code = normalizeWarehouseCode(values.code);
  return {
    name: !name
      ? 'Enter a warehouse name.'
      : name.length > L.warehouseNameMaxLength
        ? `Use at most ${L.warehouseNameMaxLength} characters.`
        : undefined,
    // The code can't change after creation, so it's only checked for new warehouses.
    code: !options.isNew
      ? undefined
      : !code
        ? 'Enter a short code, e.g. MAIN.'
        : code.length > L.warehouseCodeMaxLength
          ? `Use at most ${L.warehouseCodeMaxLength} characters.`
          : !WAREHOUSE_CODE_PATTERN.test(code)
            ? 'Use letters, numbers, - and _ (starting with a letter or number).'
            : undefined,
    address:
      values.address.trim().length > L.warehouseAddressMaxLength
        ? `Use at most ${L.warehouseAddressMaxLength} characters.`
        : undefined,
  };
}

export function toCreateWarehouseRequest(values: WarehouseFormValues): CreateWarehouseRequest {
  return {
    name: collapse(values.name),
    code: normalizeWarehouseCode(values.code),
    address: values.address.trim() || null,
  };
}

/** Only name and address; the code is immutable. */
export function toUpdateWarehouseRequest(
  warehouse: Warehouse,
  values: WarehouseFormValues,
): UpdateWarehouseRequest {
  const changes: UpdateWarehouseRequest = {};
  const name = collapse(values.name);
  const address = values.address.trim() || null;
  if (name !== warehouse.name) changes.name = name;
  if (address !== warehouse.address) changes.address = address;
  return changes;
}
