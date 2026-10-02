import {
  CATALOG_LIMITS,
  type CategoryListQuery,
  type CreateCategoryRequest,
  type UpdateCategoryRequest,
} from '@app/shared';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { toNormalizedName, toOptionalText, toTrimmed } from '../../common/validation/transforms.js';

const NAME_MAX = CATALOG_LIMITS.categoryNameMaxLength;
const DESCRIPTION_MAX = CATALOG_LIMITS.categoryDescriptionMaxLength;

export class CreateCategoryDto implements CreateCategoryRequest {
  @Transform(toNormalizedName)
  @IsString()
  @IsNotEmpty({ message: 'Name is required.' })
  @MaxLength(NAME_MAX, { message: `Name must be at most ${NAME_MAX} characters.` })
  name: string;

  /** Blank → null. */
  @Transform(toOptionalText)
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX, {
    message: `Description must be at most ${DESCRIPTION_MAX} characters.`,
  })
  description?: string | null;
}

export class CategoryListQueryDto implements CategoryListQuery {
  @IsOptional()
  @Transform(toTrimmed)
  @IsString()
  @MaxLength(CATALOG_LIMITS.searchMaxLength, {
    message: `Search must be at most ${CATALOG_LIMITS.searchMaxLength} characters.`,
  })
  search?: string;
}

/** Only name and description; anything else (id, organizationId) is rejected. */
export class UpdateCategoryDto implements UpdateCategoryRequest {
  @Transform(toNormalizedName)
  @ValidateIf((dto: UpdateCategoryDto) => dto.name !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'Name is required.' })
  @MaxLength(NAME_MAX, { message: `Name must be at most ${NAME_MAX} characters.` })
  name?: string;

  @Transform(toOptionalText)
  @IsOptional()
  @IsString()
  @MaxLength(DESCRIPTION_MAX, {
    message: `Description must be at most ${DESCRIPTION_MAX} characters.`,
  })
  description?: string | null;
}
