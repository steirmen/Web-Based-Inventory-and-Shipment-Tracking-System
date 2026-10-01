import {
  DASHBOARD_LIMITS,
  DASHBOARD_RANGES,
  type DashboardRange,
  type DashboardSummaryQuery,
} from '@app/shared';
import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { toTrimmed } from '../../common/validation/transforms.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Field-level validation. Combinations (CUSTOM needs from/to, from ≤ to,
 * maximum length, known time zone) are checked by `resolveDashboardPeriods`.
 */
export class DashboardSummaryQueryDto implements DashboardSummaryQuery {
  @IsOptional()
  @IsIn(DASHBOARD_RANGES, { message: `range must be one of: ${DASHBOARD_RANGES.join(', ')}.` })
  range?: DashboardRange;

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'from must be a date in YYYY-MM-DD format.' })
  @IsISO8601({ strict: true }, { message: 'from must be a valid date.' })
  from?: string;

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'to must be a date in YYYY-MM-DD format.' })
  @IsISO8601({ strict: true }, { message: 'to must be a valid date.' })
  to?: string;

  @IsOptional()
  @Transform(toTrimmed)
  @IsString()
  @MaxLength(DASHBOARD_LIMITS.timeZoneMaxLength, {
    message: `timeZone must be at most ${DASHBOARD_LIMITS.timeZoneMaxLength} characters.`,
  })
  timeZone?: string;
}
