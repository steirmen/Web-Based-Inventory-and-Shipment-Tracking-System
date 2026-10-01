import {
  INVENTORY_REPORT_SORT_FIELDS,
  type InventoryReportQuery,
  type InventoryReportSortField,
  ORDER_STATUSES,
  ORDERS_REPORT_SORT_FIELDS,
  type OrdersReportQuery,
  type OrdersReportSortField,
  type OrderStatus,
  REPORT_LIMITS as L,
  SALES_REPORT_SORT_FIELDS,
  SALES_REPORT_STATUSES,
  type SalesReportQuery,
  type SalesReportSortField,
  type SalesReportStatus,
  SORT_ORDERS,
  type SortOrder,
  STOCK_STATUSES,
  type StockStatus,
} from '@app/shared';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { toTrimmed } from '../../common/validation/transforms.js';
import { DashboardSummaryQueryDto } from '../../dashboard/dto/dashboard.dto.js';

/**
 * Report queries. Every field is validated here; sort fields come from
 * whitelists (mapped to SQL by the service, never used as column names), and
 * ids are checked against the organization by the service.
 */

function apply(decorators: PropertyDecorator[]): PropertyDecorator {
  return (target, key) => decorators.forEach((decorator) => decorator(target, key));
}

const SEARCH = apply([
  IsOptional(),
  Transform(toTrimmed),
  IsString(),
  MaxLength(L.searchMaxLength, {
    message: `Search must be at most ${L.searchMaxLength} characters.`,
  }),
]);
const PAGE = apply([
  IsOptional(),
  Type(() => Number),
  IsInt({ message: 'page must be a whole number.' }),
  Min(1, { message: 'page must be at least 1.' }),
  Max(1_000_000),
]);
const PAGE_SIZE = apply([
  IsOptional(),
  Type(() => Number),
  IsInt({ message: 'pageSize must be a whole number.' }),
  Min(1, { message: 'pageSize must be at least 1.' }),
  Max(L.pageSizeMax, { message: `pageSize must be at most ${L.pageSizeMax}.` }),
]);
const SORT_ORDER = apply([
  IsOptional(),
  IsIn(SORT_ORDERS, { message: 'sortOrder must be asc or desc.' }),
]);
const id = (name: string) =>
  apply([IsOptional(), IsUUID('all', { message: `${name}Id must be a ${name} id.` })]);

/** Date range (as on the dashboard) plus the shared list parameters. */
class PeriodReportQueryDto extends DashboardSummaryQueryDto {
  @SEARCH
  search?: string;

  @SORT_ORDER
  sortOrder?: SortOrder;

  @PAGE
  page?: number;

  @PAGE_SIZE
  pageSize?: number;

  @id('warehouse')
  warehouseId?: string;

  @id('customer')
  customerId?: string;
}

export class SalesReportQueryDto extends PeriodReportQueryDto implements SalesReportQuery {
  @id('product')
  productId?: string;

  @id('category')
  categoryId?: string;

  /** Realized statuses only: the sales report never lists draft, confirmed, or cancelled orders. */
  @IsOptional()
  @IsIn(SALES_REPORT_STATUSES, {
    message: `status must be one of: ${SALES_REPORT_STATUSES.join(', ')}.`,
  })
  status?: SalesReportStatus;

  @IsOptional()
  @IsIn(SALES_REPORT_SORT_FIELDS, {
    message: `sortBy must be one of: ${SALES_REPORT_SORT_FIELDS.join(', ')}.`,
  })
  sortBy?: SalesReportSortField;
}

export class OrdersReportQueryDto extends PeriodReportQueryDto implements OrdersReportQuery {
  @IsOptional()
  @IsIn(ORDER_STATUSES, { message: `status must be one of: ${ORDER_STATUSES.join(', ')}.` })
  status?: OrderStatus;

  @IsOptional()
  @IsIn(ORDERS_REPORT_SORT_FIELDS, {
    message: `sortBy must be one of: ${ORDERS_REPORT_SORT_FIELDS.join(', ')}.`,
  })
  sortBy?: OrdersReportSortField;
}

export class InventoryReportQueryDto implements InventoryReportQuery {
  @SEARCH
  search?: string;

  @SORT_ORDER
  sortOrder?: SortOrder;

  @PAGE
  page?: number;

  @PAGE_SIZE
  pageSize?: number;

  @id('warehouse')
  warehouseId?: string;

  @id('product')
  productId?: string;

  @id('category')
  categoryId?: string;

  @IsOptional()
  @IsIn(STOCK_STATUSES, { message: `status must be one of: ${STOCK_STATUSES.join(', ')}.` })
  status?: StockStatus;

  /** `true` / `false` in the query string. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsIn([true, false], { message: 'includeArchived must be true or false.' })
  includeArchived?: boolean;

  @IsOptional()
  @IsIn(INVENTORY_REPORT_SORT_FIELDS, {
    message: `sortBy must be one of: ${INVENTORY_REPORT_SORT_FIELDS.join(', ')}.`,
  })
  sortBy?: InventoryReportSortField;
}
