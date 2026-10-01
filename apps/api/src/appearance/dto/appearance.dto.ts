import {
  ANIMATION_INTENSITIES,
  type AnimationIntensity,
  APPEARANCE_LIMITS,
  APPEARANCE_MODES,
  type AppearanceConfig,
  type AppearanceMode,
  BACKGROUND_EFFECTS,
  type BackgroundEffect,
  type CreateAppearanceProfileRequest,
  CUSTOM_TONES,
  type CustomTone,
  type Density,
  DENSITIES,
  FONT_SCALES,
  type FontScale,
  HEX_COLOR_PATTERN,
  RADII,
  type Radius,
  THEME_IDS,
  type ThemeId,
  type UpdateAppearanceProfileRequest,
} from '@app/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { toNormalizedName } from '../../common/validation/transforms.js';

const oneOf = (field: string, values: readonly string[]) =>
  IsIn(values, { message: `${field} must be one of: ${values.join(', ')}.` });

/**
 * The complete appearance configuration. Every field is required and must be
 * one of the identifiers @app/shared defines; unknown fields (userId,
 * organizationId, CSS, …) are rejected by the global ValidationPipe.
 */
export class AppearanceConfigDto implements AppearanceConfig {
  @oneOf('mode', APPEARANCE_MODES) mode: AppearanceMode;
  @oneOf('theme', THEME_IDS) theme: ThemeId;

  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsString({ message: 'customAccent must be a color like #4f46e5.' })
  @Matches(HEX_COLOR_PATTERN, { message: 'customAccent must be a color like #4f46e5.' })
  customAccent: string;

  @oneOf('customTone', CUSTOM_TONES) customTone: CustomTone;
  @oneOf('backgroundEffect', BACKGROUND_EFFECTS) backgroundEffect: BackgroundEffect;
  @oneOf('animationIntensity', ANIMATION_INTENSITIES) animationIntensity: AnimationIntensity;
  @oneOf('density', DENSITIES) density: Density;
  @oneOf('radius', RADII) radius: Radius;
  @oneOf('fontScale', FONT_SCALES) fontScale: FontScale;
}

const nameRules = (target: object, key: string | symbol) => {
  for (const decorator of [
    Transform(toNormalizedName),
    IsString(),
    IsNotEmpty({ message: 'Name is required.' }),
    MaxLength(APPEARANCE_LIMITS.profileNameMaxLength, {
      message: `Name must be at most ${APPEARANCE_LIMITS.profileNameMaxLength} characters.`,
    }),
  ]) {
    decorator(target, key);
  }
};

export class CreateAppearanceProfileDto implements CreateAppearanceProfileRequest {
  @nameRules name: string;

  @IsDefined({ message: 'appearance is required.' })
  @ValidateNested()
  @Type(() => AppearanceConfigDto)
  appearance: AppearanceConfigDto;
}

export class UpdateAppearanceProfileDto implements UpdateAppearanceProfileRequest {
  @ValidateIf((dto: UpdateAppearanceProfileDto) => dto.name !== undefined)
  @nameRules
  name?: string;

  @ValidateIf((dto: UpdateAppearanceProfileDto) => dto.appearance !== undefined)
  @IsDefined({ message: 'appearance must be a complete configuration.' })
  @ValidateNested()
  @Type(() => AppearanceConfigDto)
  appearance?: AppearanceConfigDto;
}
