import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors/app-exception.js';

/** Client-facing warehouse, inventory, and stock movement errors. */

export const warehouseNotFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'WAREHOUSE_NOT_FOUND', 'Warehouse not found.');

export const warehouseCodeTaken = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'WAREHOUSE_CODE_TAKEN',
    'Another warehouse in this workspace already uses this code.',
  );

export const warehouseCodeImmutable = () =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    'WAREHOUSE_CODE_IMMUTABLE',
    'A warehouse code cannot be changed after it is created.',
  );

export const warehouseStatusInvalid = () =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    'WAREHOUSE_STATUS_INVALID',
    'Warehouse status cannot be changed here. Use archive or restore instead.',
  );

export const inventoryWarehouseInactive = (code: string) =>
  new AppException(
    HttpStatus.CONFLICT,
    'INVENTORY_WAREHOUSE_INACTIVE',
    `Warehouse ${code} is archived. Restore it before moving stock in or out of it.`,
  );

export const inventoryNotFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'INVENTORY_NOT_FOUND', 'Inventory record not found.');

/** A warehouse id in a body or filter that is not a warehouse of this organization. */
export const inventoryWarehouseNotFound = () =>
  new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'INVENTORY_WAREHOUSE_NOT_FOUND',
    'The selected warehouse does not exist in this workspace.',
  );

/** A product id in a body or filter that is not a product of this organization. */
export const inventoryProductNotFound = () =>
  new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'INVENTORY_PRODUCT_NOT_FOUND',
    'The selected product does not exist in this workspace.',
  );

export const inventoryProductInactive = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'INVENTORY_PRODUCT_INACTIVE',
    'This product is archived. Restore it before changing its stock.',
  );

export const inventoryQuantityLimit = (max: number) =>
  new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'INVENTORY_QUANTITY_LIMIT',
    `The resulting quantity would exceed the maximum of ${max.toLocaleString('en-US')} units.`,
  );

export const insufficientStock = (available: number, warehouseCode: string) =>
  new AppException(
    HttpStatus.CONFLICT,
    'INVENTORY_INSUFFICIENT_STOCK',
    `Not enough stock: ${available} ${available === 1 ? 'unit' : 'units'} available in ${warehouseCode}.`,
  );

export const inventorySameWarehouse = () =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    'INVENTORY_SAME_WAREHOUSE',
    'Choose two different warehouses for a transfer.',
  );

export const stockMovementActorNotFound = () =>
  new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'STOCK_MOVEMENT_ACTOR_NOT_FOUND',
    'The selected user has no access to or history in this workspace.',
  );

/** A concurrent stock change won a lock race (deadlock, lock or transaction timeout). */
export const inventoryConcurrencyConflict = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'INVENTORY_CONCURRENCY_CONFLICT',
    'Another stock change for the same items was in progress. Nothing was changed; please try again.',
  );
