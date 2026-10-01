import {
  type CreateCustomerRequest,
  CUSTOMER_LIMITS,
  CUSTOMER_SORT_FIELDS,
  CUSTOMER_STATUSES,
  type CustomerListQuery,
  type CustomerSortField,
  type CustomerStatus,
  PHONE_PATTERN,
  SORT_ORDERS,
  type SortOrder,
  type UpdateCustomerRequest,
} from '@app/shared';
import { Transform, Type } from 'class-transformer';
import {
  Allow,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  toNormalizedName,
  toOptionalEmail,
  toOptionalName,
  toOptionalText,
  toTrimmed,
} from '../../common/validation/transforms.js';

const L = CUSTOMER_LIMITS;

const maxLength = (field: string, max: number) =>
  MaxLength(max, { message: `${field} must be at most ${max} characters.` });

/** Rules shared by create (name required) and update (everything optional). Blank optional text → null. */
const rules = {
  name: [
    Transform(toNormalizedName),
    IsString(),
    IsNotEmpty({ message: 'Name is required.' }),
    maxLength('Name', L.nameMaxLength),
  ],
  companyName: [
    Transform(toOptionalName),
    IsOptional(),
    IsString(),
    maxLength('Company', L.companyNameMaxLength),
  ],
  email: [
    Transform(toOptionalEmail),
    IsOptional(),
    IsString(),
    maxLength('Email', L.emailMaxLength),
    IsEmail({}, { message: 'Enter a valid email address.' }),
  ],
  phone: [
    Transform(toOptionalText),
    IsOptional(),
    IsString(),
    maxLength('Phone', L.phoneMaxLength),
    Matches(PHONE_PATTERN, { message: 'Use digits, spaces, and + - ( ) . / only.' }),
  ],
  address: [
    Transform(toOptionalText),
    IsOptional(),
    IsString(),
    maxLength('Address', L.addressMaxLength),
  ],
  notes: [
    Transform(toOptionalText),
    IsOptional(),
    IsString(),
    maxLength('Notes', L.notesMaxLength),
  ],
} satisfies Record<keyof CreateCustomerRequest, PropertyDecorator[]>;

function apply(decorators: PropertyDecorator[]): PropertyDecorator {
  return (target, key) => decorators.forEach((decorator) => decorator(target, key));
}

export class CreateCustomerDto implements CreateCustomerRequest {
  @apply(rules.name) name: string;
  @apply(rules.companyName) companyName?: string | null;
  @apply(rules.email) email?: string | null;
  @apply(rules.phone) phone?: string | null;
  @apply(rules.address) address?: string | null;
  @apply(rules.notes) notes?: string | null;
}

/** Partial update. `id`, `organizationId`, timestamps, and unknown fields are rejected. */
export class UpdateCustomerDto implements UpdateCustomerRequest {
  @ValidateIf((dto: UpdateCustomerDto) => dto.name !== undefined)
  @apply(rules.name)
  name?: string;

  @apply(rules.companyName) companyName?: string | null;
  @apply(rules.email) email?: string | null;
  @apply(rules.phone) phone?: string | null;
  @apply(rules.address) address?: string | null;
  @apply(rules.notes) notes?: string | null;

  /** Accepted only so the service can answer with CUSTOMER_STATUS_INVALID. */
  @Allow()
  isActive?: unknown;
}

export class CustomerListQueryDto implements CustomerListQuery {
  @IsOptional()
  @Transform(toTrimmed)
  @IsString()
  @MaxLength(L.searchMaxLength, {
    message: `Search must be at most ${L.searchMaxLength} characters.`,
  })
  search?: string;

  @IsOptional()
  @IsIn(CUSTOMER_STATUSES, { message: 'status must be ACTIVE or ARCHIVED.' })
  status?: CustomerStatus;

  /** Whitelisted — never an arbitrary column name. */
  @IsOptional()
  @IsIn(CUSTOMER_SORT_FIELDS, {
    message: `sortBy must be one of: ${CUSTOMER_SORT_FIELDS.join(', ')}.`,
  })
  sortBy?: CustomerSortField;

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
