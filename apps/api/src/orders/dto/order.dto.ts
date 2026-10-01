import {
  type CreateOrderRequest,
  ORDER_LIMITS,
  ORDER_SORT_FIELDS,
  ORDER_STATUSES,
  type OrderItemInput,
  type OrderListQuery,
  type OrderSortField,
  type OrderStatus,
  SORT_ORDERS,
  type SortOrder,
  type UpdateOrderRequest,
} from '@app/shared';
import { Transform, Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { toLowerCaseId, toOptionalText, toTrimmed } from '../../common/validation/transforms.js';

const L = ORDER_LIMITS;

function apply(decorators: PropertyDecorator[]): PropertyDecorator {
  return (target, key) => decorators.forEach((decorator) => decorator(target, key));
}

/** One line: only the product and a whole quantity. Prices always come from the server. */
export class OrderItemInputDto implements OrderItemInput {
  @Transform(toLowerCaseId)
  @IsUUID('all', { message: 'productId must be a product id.' })
  productId: string;

  @IsInt({ message: 'Quantity must be a whole number.' })
  @Min(1, { message: 'Quantity must be at least 1.' })
  @Max(L.quantityMax, { message: `Quantity must be at most ${L.quantityMax}.` })
  quantity: number;
}

const itemsRules = [
  IsArray({ message: 'items must be a list.' }),
  ArrayMaxSize(L.itemsMax, { message: `An order can have at most ${L.itemsMax} lines.` }),
  ValidateNested({ each: true }),
  Type(() => OrderItemInputDto),
];

const notesRules = [
  Transform(toOptionalText),
  IsOptional(),
  IsString(),
  MaxLength(L.notesMaxLength, { message: `Notes must be at most ${L.notesMaxLength} characters.` }),
];

/** Creates a DRAFT; the order number, status, and totals are set by the server. */
export class CreateOrderDto implements CreateOrderRequest {
  @Transform(toLowerCaseId)
  @IsUUID('all', { message: 'customerId must be a customer id.' })
  customerId: string;

  @Transform(toLowerCaseId)
  @IsUUID('all', { message: 'warehouseId must be a warehouse id.' })
  warehouseId: string;

  @apply(notesRules) notes?: string | null;

  @IsOptional()
  @apply(itemsRules)
  items?: OrderItemInputDto[];
}

/** Edits a DRAFT. Unknown fields (orderNumber, totals, prices, organizationId, …) are rejected. */
export class UpdateOrderDto implements UpdateOrderRequest {
  @Transform(toLowerCaseId)
  @ValidateIf((dto: UpdateOrderDto) => dto.customerId !== undefined)
  @IsUUID('all', { message: 'customerId must be a customer id.' })
  customerId?: string;

  @Transform(toLowerCaseId)
  @ValidateIf((dto: UpdateOrderDto) => dto.warehouseId !== undefined)
  @IsUUID('all', { message: 'warehouseId must be a warehouse id.' })
  warehouseId?: string;

  @apply(notesRules) notes?: string | null;

  @ValidateIf((dto: UpdateOrderDto) => dto.items !== undefined)
  @apply(itemsRules)
  items?: OrderItemInputDto[];

  /** Accepted only so the service can answer with ORDER_STATUS_INVALID. */
  @Allow()
  status?: unknown;
}

export class OrderListQueryDto implements OrderListQuery {
  @IsOptional()
  @Transform(toTrimmed)
  @IsString()
  @MaxLength(L.searchMaxLength, {
    message: `Search must be at most ${L.searchMaxLength} characters.`,
  })
  search?: string;

  @IsOptional()
  @IsIn(ORDER_STATUSES, { message: `status must be one of: ${ORDER_STATUSES.join(', ')}.` })
  status?: OrderStatus;

  @IsOptional()
  @IsUUID('all', { message: 'customerId must be a customer id.' })
  customerId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'warehouseId must be a warehouse id.' })
  warehouseId?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'from must be an ISO 8601 date or date-time.' })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'to must be an ISO 8601 date or date-time.' })
  to?: string;

  /** Whitelisted — never an arbitrary column name. */
  @IsOptional()
  @IsIn(ORDER_SORT_FIELDS, { message: `sortBy must be one of: ${ORDER_SORT_FIELDS.join(', ')}.` })
  sortBy?: OrderSortField;

  @IsOptional()
  @IsIn(SORT_ORDERS, { message: 'sortOrder must be asc or desc.' })
  sortOrder?: SortOrder;

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
