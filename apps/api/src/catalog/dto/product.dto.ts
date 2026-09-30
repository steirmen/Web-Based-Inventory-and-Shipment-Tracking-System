import {
  CATALOG_LIMITS,
  type CreateProductRequest,
  MONEY_PATTERN,
  PRODUCT_SORT_FIELDS,
  PRODUCT_STATUSES,
  type ProductListQuery,
  type ProductSortField,
  type ProductStatus,
  SKU_PATTERN,
  SORT_ORDERS,
  type SortOrder,
  type UpdateProductRequest,
} from '@app/shared';
import { Transform, Type } from 'class-transformer';
import {
  Allow,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { toNormalizedName, toOptionalText, toTrimmed } from '../../common/validation/transforms.js';

const L = CATALOG_LIMITS;
const MONEY_MESSAGE = (field: string) =>
  `${field} must be a non-negative amount with up to 2 decimals, sent as a string (e.g. "19.99").`;

/**
 * Validation rules shared by create (all required) and update (all optional).
 * Money must arrive as a decimal STRING so it is never parsed as a float.
 */
const rules = {
  name: [
    Transform(toNormalizedName),
    IsString(),
    IsNotEmpty({ message: 'Name is required.' }),
    MaxLength(L.productNameMaxLength, {
      message: `Name must be at most ${L.productNameMaxLength} characters.`,
    }),
  ],
  sku: [
    Transform(toTrimmed),
    IsString(),
    IsNotEmpty({ message: 'SKU is required.' }),
    MaxLength(L.skuMaxLength, { message: `SKU must be at most ${L.skuMaxLength} characters.` }),
    Matches(SKU_PATTERN, {
      message: 'Use letters, numbers, and . _ - / (starting with a letter or number).',
    }),
  ],
  description: [
    Transform(toOptionalText),
    IsOptional(),
    IsString(),
    MaxLength(L.productDescriptionMaxLength, {
      message: `Description must be at most ${L.productDescriptionMaxLength} characters.`,
    }),
  ],
  categoryId: [IsOptional(), IsUUID('all', { message: 'categoryId must be a category id.' })],
  price: [
    IsString({ message: MONEY_MESSAGE('Price') }),
    Matches(MONEY_PATTERN, { message: MONEY_MESSAGE('Price') }),
  ],
  cost: [
    IsString({ message: MONEY_MESSAGE('Cost') }),
    Matches(MONEY_PATTERN, { message: MONEY_MESSAGE('Cost') }),
  ],
  minimumStock: [
    IsInt({ message: 'Minimum stock must be a whole number.' }),
    Min(0, { message: 'Minimum stock cannot be negative.' }),
    Max(L.minimumStockMax, { message: `Minimum stock must be at most ${L.minimumStockMax}.` }),
  ],
} satisfies Record<keyof CreateProductRequest, PropertyDecorator[]>;

function apply(decorators: PropertyDecorator[]): PropertyDecorator {
  return (target, key) => decorators.forEach((decorator) => decorator(target, key));
}

/** For update: validate only when present, and never accept null for required fields. */
const whenPresent = (field: string) =>
  ValidateIf((dto: Record<string, unknown>) => dto[field] !== undefined);

export class CreateProductDto implements CreateProductRequest {
  @apply(rules.name) name: string;
  @apply(rules.sku) sku: string;
  @apply(rules.description) description?: string | null;
  /** null or omitted = no category. */
  @apply(rules.categoryId) categoryId?: string | null;
  @apply(rules.price) price: string;
  @apply(rules.cost) cost: string;
  @apply(rules.minimumStock) minimumStock: number;
}

/** Partial update. `id`, `organizationId`, and timestamps are rejected by the ValidationPipe. */
export class UpdateProductDto implements UpdateProductRequest {
  @whenPresent('name') @apply(rules.name) name?: string;
  @whenPresent('sku') @apply(rules.sku) sku?: string;
  @apply(rules.description) description?: string | null;
  @apply(rules.categoryId) categoryId?: string | null;
  @whenPresent('price') @apply(rules.price) price?: string;
  @whenPresent('cost') @apply(rules.cost) cost?: string;
  @whenPresent('minimumStock') @apply(rules.minimumStock) minimumStock?: number;

  /** Accepted only so the service can answer with PRODUCT_STATUS_INVALID. */
  @Allow()
  status?: unknown;
}

export class ProductListQueryDto implements ProductListQuery {
  @IsOptional()
  @Transform(toTrimmed)
  @IsString()
  @MaxLength(L.searchMaxLength, {
    message: `Search must be at most ${L.searchMaxLength} characters.`,
  })
  search?: string;

  @IsOptional()
  @IsUUID('all', { message: 'categoryId must be a category id.' })
  categoryId?: string;

  @IsOptional()
  @IsIn(PRODUCT_STATUSES, { message: 'status must be ACTIVE or ARCHIVED.' })
  status?: ProductStatus;

  /** Whitelisted — never an arbitrary column name. */
  @IsOptional()
  @IsIn(PRODUCT_SORT_FIELDS, {
    message: `sortBy must be one of: ${PRODUCT_SORT_FIELDS.join(', ')}.`,
  })
  sortBy?: ProductSortField;

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
