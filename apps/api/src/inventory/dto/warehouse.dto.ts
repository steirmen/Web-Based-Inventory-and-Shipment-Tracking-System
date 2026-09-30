import {
  type CreateWarehouseRequest,
  INVENTORY_LIMITS,
  type UpdateWarehouseRequest,
  WAREHOUSE_CODE_PATTERN,
} from '@app/shared';
import { Transform } from 'class-transformer';
import {
  Allow,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  toNormalizedName,
  toOptionalText,
  toUpperCode,
} from '../../common/validation/transforms.js';

const L = INVENTORY_LIMITS;

export class CreateWarehouseDto implements CreateWarehouseRequest {
  @Transform(toNormalizedName)
  @IsString()
  @IsNotEmpty({ message: 'Name is required.' })
  @MaxLength(L.warehouseNameMaxLength, {
    message: `Name must be at most ${L.warehouseNameMaxLength} characters.`,
  })
  name: string;

  /** Stored upper-case; unique within the organization. */
  @Transform(toUpperCode)
  @IsString()
  @IsNotEmpty({ message: 'Code is required.' })
  @MaxLength(L.warehouseCodeMaxLength, {
    message: `Code must be at most ${L.warehouseCodeMaxLength} characters.`,
  })
  @Matches(WAREHOUSE_CODE_PATTERN, {
    message: 'Use letters, numbers, - and _ (starting with a letter or number).',
  })
  code: string;

  /** Blank → null. */
  @Transform(toOptionalText)
  @IsOptional()
  @IsString()
  @MaxLength(L.warehouseAddressMaxLength, {
    message: `Address must be at most ${L.warehouseAddressMaxLength} characters.`,
  })
  address?: string | null;
}

/** Name and address only. `id`, `organizationId`, timestamps, and unknown fields are rejected. */
export class UpdateWarehouseDto implements UpdateWarehouseRequest {
  @Transform(toNormalizedName)
  @ValidateIf((dto: UpdateWarehouseDto) => dto.name !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'Name is required.' })
  @MaxLength(L.warehouseNameMaxLength, {
    message: `Name must be at most ${L.warehouseNameMaxLength} characters.`,
  })
  name?: string;

  @Transform(toOptionalText)
  @IsOptional()
  @IsString()
  @MaxLength(L.warehouseAddressMaxLength, {
    message: `Address must be at most ${L.warehouseAddressMaxLength} characters.`,
  })
  address?: string | null;

  /** Accepted only so the service can answer with WAREHOUSE_CODE_IMMUTABLE. */
  @Allow()
  code?: unknown;

  /** Accepted only so the service can answer with WAREHOUSE_STATUS_INVALID. */
  @Allow()
  isActive?: unknown;
}
