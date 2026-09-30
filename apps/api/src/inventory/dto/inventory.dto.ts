import {
  type AdjustStockRequest,
  type DamageStockRequest,
  INVENTORY_LIMITS,
  INVENTORY_SORT_FIELDS,
  type InventoryListQuery,
  type InventoryMovementsQuery,
  type InventorySortField,
  type ReceiveStockRequest,
  SORT_ORDERS,
  type SortOrder,
  STOCK_MOVEMENT_TYPES,
  STOCK_STATUSES,
  type StockMovementListQuery,
  type StockMovementType,
  type StockStatus,
  type TransferStockRequest,
} from '@app/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { toOptionalText, toTrimmed } from '../../common/validation/transforms.js';

const L = INVENTORY_LIMITS;

// --- Shared query parts ----------------------------------------------------------------

/** `page` (≥ 1) and `pageSize` (1…100, default 20). Lists are never unbounded. */
export class PageQueryDto implements InventoryMovementsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be a whole number.' })
  @Min(1, { message: 'page must be at least 1.' })
  @Max(1_000_000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize must be a whole number.' })
  @Min(1, { message: 'pageSize must be at least 1.' })
  @Max(L.pageSizeMax, { message: `pageSize must be at most ${L.pageSizeMax}.` })
  pageSize?: number;
}

const SEARCH_RULES = [
  IsOptional(),
  Transform(toTrimmed),
  IsString(),
  MaxLength(L.searchMaxLength, {
    message: `Search must be at most ${L.searchMaxLength} characters.`,
  }),
];

function apply(decorators: PropertyDecorator[]): PropertyDecorator {
  return (target, key) => decorators.forEach((decorator) => decorator(target, key));
}

export class InventoryListQueryDto extends PageQueryDto implements InventoryListQuery {
  @IsOptional()
  @IsUUID('all', { message: 'warehouseId must be a warehouse id.' })
  warehouseId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'productId must be a product id.' })
  productId?: string;

  @apply(SEARCH_RULES)
  search?: string;

  @IsOptional()
  @IsIn(STOCK_STATUSES, { message: `status must be one of: ${STOCK_STATUSES.join(', ')}.` })
  status?: StockStatus;

  /** Whitelisted — never an arbitrary column name. */
  @IsOptional()
  @IsIn(INVENTORY_SORT_FIELDS, {
    message: `sortBy must be one of: ${INVENTORY_SORT_FIELDS.join(', ')}.`,
  })
  sortBy?: InventorySortField;

  @IsOptional()
  @IsIn(SORT_ORDERS, { message: 'sortOrder must be asc or desc.' })
  sortOrder?: SortOrder;
}

export class StockMovementListQueryDto extends PageQueryDto implements StockMovementListQuery {
  @IsOptional()
  @IsUUID('all', { message: 'warehouseId must be a warehouse id.' })
  warehouseId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'productId must be a product id.' })
  productId?: string;

  @IsOptional()
  @IsIn(STOCK_MOVEMENT_TYPES, {
    message: `movementType must be one of: ${STOCK_MOVEMENT_TYPES.join(', ')}.`,
  })
  movementType?: StockMovementType;

  @IsOptional()
  @IsUUID('all', { message: 'actorUserId must be a user id.' })
  actorUserId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'transferGroupId must be a transfer group id.' })
  transferGroupId?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'from must be an ISO 8601 date or date-time.' })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'to must be an ISO 8601 date or date-time.' })
  to?: string;

  @apply(SEARCH_RULES)
  search?: string;

  @IsOptional()
  @IsIn(SORT_ORDERS, { message: 'sortOrder must be asc or desc.' })
  sortOrder?: SortOrder;
}

// --- Stock operations ------------------------------------------------------------------

const quantityRules = (field: string, min: number) => [
  IsInt({ message: `${field} must be a whole number.` }),
  Min(min, { message: `${field} must be at least ${min}.` }),
  Max(L.quantityMax, { message: `${field} must be at most ${L.quantityMax}.` }),
];

const optionalReason = [
  Transform(toOptionalText),
  IsOptional(),
  IsString(),
  MaxLength(L.reasonMaxLength, {
    message: `Reason must be at most ${L.reasonMaxLength} characters.`,
  }),
];

const requiredReason = [
  Transform(toOptionalText),
  IsString({ message: 'Reason is required.' }),
  IsNotEmpty({ message: 'Reason is required.' }),
  MaxLength(L.reasonMaxLength, {
    message: `Reason must be at most ${L.reasonMaxLength} characters.`,
  }),
];

const warehouseIdRules = (field = 'warehouseId') => [
  IsUUID('all', { message: `${field} must be a warehouse id.` }),
];
const productIdRules = [IsUUID('all', { message: 'productId must be a product id.' })];

/** Receive (PURCHASE) and issue (SALE). */
export class StockQuantityDto implements ReceiveStockRequest {
  @apply(warehouseIdRules()) warehouseId: string;
  @apply(productIdRules) productId: string;
  @apply(quantityRules('Quantity', 1)) quantity: number;
  @apply(optionalReason) reason?: string | null;
}

export class DamageStockDto implements DamageStockRequest {
  @apply(warehouseIdRules()) warehouseId: string;
  @apply(productIdRules) productId: string;
  @apply(quantityRules('Quantity', 1)) quantity: number;
  @apply(requiredReason) reason: string;
}

export class AdjustStockDto implements AdjustStockRequest {
  @apply(warehouseIdRules()) warehouseId: string;
  @apply(productIdRules) productId: string;
  @apply(quantityRules('New quantity', 0)) newQuantity: number;
  @apply(requiredReason) reason: string;
}

export class TransferStockDto implements TransferStockRequest {
  @apply(warehouseIdRules('sourceWarehouseId')) sourceWarehouseId: string;
  @apply(warehouseIdRules('destinationWarehouseId')) destinationWarehouseId: string;
  @apply(productIdRules) productId: string;
  @apply(quantityRules('Quantity', 1)) quantity: number;
  @apply(optionalReason) reason?: string | null;
}
