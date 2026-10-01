import {
  DASHBOARD_LIMITS,
  type DashboardBucket,
  dashboardBucket,
  type DashboardPeriod,
  type DashboardRange,
  type DashboardSelectedPeriod,
  DEFAULT_DASHBOARD_RANGE,
  DEFAULT_DASHBOARD_TIME_ZONE,
} from '@app/shared';
import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors/app-exception.js';

/**
 * Date ranges of the dashboard. A range is a whole number of LOCAL days in the
 * requested IANA time zone (default UTC, the API's existing date convention):
 * local days `from`…`to` (inclusive) become the UTC instants [start, end),
 * where start is `from` 00:00 local and end is the day after `to`, 00:00
 * local. Pure functions; `now` is passed in so tests can pin the clock.
 */

/** A calendar day as days since 1970-01-01 (time-zone free arithmetic). */
type Day = number;

const DAY_MS = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const dayOf = (date: string): Day => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
export const formatDay = (day: Day): string => new Date(day * DAY_MS).toISOString().slice(0, 10);

function ymd(day: Day): { year: number; month: number; date: number } {
  const value = new Date(day * DAY_MS);
  return { year: value.getUTCFullYear(), month: value.getUTCMonth(), date: value.getUTCDate() };
}
const dayFromParts = (year: number, month: number, date: number): Day =>
  Date.UTC(year, month, date) / DAY_MS;

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let value = formatters.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, value);
  }
  return value;
}

/** The wall-clock time in `timeZone` at `instant`, as if it were UTC (ms). */
function wallClock(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(new Date(instant))
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/** `YYYY-MM-DD HH:mm`: the wall-clock time of `instant` in `timeZone` (report exports). */
export function formatLocalDateTime(instant: Date, timeZone: string): string {
  return new Date(wallClock(instant.getTime(), timeZone))
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ');
}

/** The local calendar day in `timeZone` at `instant`. */
export function localDay(instant: Date, timeZone: string): Day {
  return Math.floor(wallClock(instant.getTime(), timeZone) / DAY_MS);
}

/** The UTC instant of 00:00 local time on `day` in `timeZone` (DST-aware). */
export function startOfLocalDay(day: Day, timeZone: string): Date {
  const local = day * DAY_MS;
  // offset = wall clock − UTC; refine once in case the offset changes between the guesses (DST).
  let instant = local - (wallClock(local, timeZone) - local);
  instant = local - (wallClock(instant, timeZone) - instant);
  return new Date(instant);
}

/** IANA zone names only: `Europe/Istanbul`, `UTC`, `America/Argentina/Buenos_Aires`, `Etc/GMT+3`. */
const ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

/**
 * Is `timeZone` a known IANA zone name? The name is used as given (ICU would
 * "canonicalize" Asia/Kolkata to the legacy Asia/Calcutta); PostgreSQL knows
 * the same names, case-insensitively. Numeric offsets (`+03:00`) are refused:
 * PostgreSQL reads them with the inverted POSIX sign in `AT TIME ZONE`.
 */
export function isKnownTimeZone(timeZone: string): boolean {
  if (timeZone.length > DASHBOARD_LIMITS.timeZoneMaxLength || !ZONE_NAME.test(timeZone)) {
    return false;
  }
  try {
    // Throws a RangeError for unknown zones.
    return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
}

export function invalidDashboardField(field: string, message: string): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    'VALIDATION_ERROR',
    'The request contains invalid fields.',
    [{ field, messages: [message] }],
  );
}

function period(fromDay: Day, toDay: Day, timeZone: string): DashboardPeriod {
  return {
    from: formatDay(fromDay),
    to: formatDay(toDay),
    start: startOfLocalDay(fromDay, timeZone).toISOString(),
    end: startOfLocalDay(toDay + 1, timeZone).toISOString(),
    days: toDay - fromDay + 1,
  };
}

export interface ResolvedDashboardPeriods {
  current: DashboardSelectedPeriod;
  /** The same number of days immediately before `current`. */
  previous: DashboardPeriod;
  bucket: DashboardBucket;
}

export interface DashboardPeriodInput {
  range?: DashboardRange;
  from?: string;
  to?: string;
  timeZone?: string;
}

/**
 * Resolves the query into local days and UTC boundaries. Presets that end
 * "now" (TODAY, LAST_N_DAYS, THIS_MONTH, THIS_YEAR) include today.
 * Throws `400 VALIDATION_ERROR` with field details for invalid combinations.
 */
export function resolveDashboardPeriods(
  input: DashboardPeriodInput,
  now: Date,
): ResolvedDashboardPeriods {
  const range = input.range ?? DEFAULT_DASHBOARD_RANGE;
  const timeZone = input.timeZone ?? DEFAULT_DASHBOARD_TIME_ZONE;
  if (!isKnownTimeZone(timeZone)) {
    throw invalidDashboardField(
      'timeZone',
      'timeZone must be an IANA time zone, e.g. Europe/Istanbul.',
    );
  }

  if (range !== 'CUSTOM') {
    for (const field of ['from', 'to'] as const) {
      if (input[field] !== undefined) {
        throw invalidDashboardField(field, `${field} can only be used with range CUSTOM.`);
      }
    }
  }

  const today = localDay(now, timeZone);
  const { year, month } = ymd(today);
  let fromDay: Day;
  let toDay: Day = today;
  switch (range) {
    case 'TODAY':
      fromDay = today;
      break;
    case 'LAST_7_DAYS':
      fromDay = today - 6;
      break;
    case 'LAST_30_DAYS':
      fromDay = today - 29;
      break;
    case 'THIS_MONTH':
      fromDay = dayFromParts(year, month, 1);
      break;
    case 'PREVIOUS_MONTH':
      fromDay = dayFromParts(year, month - 1, 1);
      toDay = dayFromParts(year, month, 1) - 1;
      break;
    case 'THIS_YEAR':
      fromDay = dayFromParts(year, 0, 1);
      break;
    case 'CUSTOM': {
      for (const field of ['from', 'to'] as const) {
        const value = input[field];
        if (value === undefined) {
          throw invalidDashboardField(field, `${field} is required when range is CUSTOM.`);
        }
        // Round trip: rejects impossible dates such as 2026-02-30 (Date.parse rolls them over).
        const day = DATE_ONLY.test(value) ? dayOf(value) : Number.NaN;
        if (Number.isNaN(day) || formatDay(day) !== value) {
          throw invalidDashboardField(field, `${field} must be a date in YYYY-MM-DD format.`);
        }
      }
      fromDay = dayOf(input.from!);
      toDay = dayOf(input.to!);
      if (fromDay > toDay) throw invalidDashboardField('to', 'to must not be before from.');
      if (toDay - fromDay + 1 > DASHBOARD_LIMITS.customRangeMaxDays) {
        throw invalidDashboardField(
          'to',
          `A custom range can cover at most ${DASHBOARD_LIMITS.customRangeMaxDays} days.`,
        );
      }
      break;
    }
  }

  const days = toDay - fromDay + 1;
  return {
    current: { range, timeZone, ...period(fromDay, toDay, timeZone) },
    previous: period(fromDay - days, fromDay - 1, timeZone),
    bucket: dashboardBucket(days),
  };
}

export interface DashboardBucketSlot {
  /** Bucket start as PostgreSQL's date_trunc returns it (may precede the period). */
  key: string;
  /** First and last day of the bucket inside the period. */
  period: string;
  periodEnd: string;
}

/**
 * Every bucket of the period, in order — the x-axis of the time series, so
 * empty buckets can be returned as zeros. Keys match
 * `date_trunc(day|week|month, local time)`: weeks start on Monday (ISO).
 */
export function dashboardBuckets(
  from: string,
  to: string,
  bucket: DashboardBucket,
): DashboardBucketSlot[] {
  const first = dayOf(from);
  const last = dayOf(to);
  const slots: DashboardBucketSlot[] = [];
  let day = first;
  while (day <= last) {
    let start: Day;
    let next: Day;
    if (bucket === 'DAY') {
      start = day;
      next = day + 1;
    } else if (bucket === 'WEEK') {
      // 1970-01-01 was a Thursday: (day + 3) % 7 is 0 on Mondays.
      start = day - ((((day + 3) % 7) + 7) % 7);
      next = start + 7;
    } else {
      const { year, month } = ymd(day);
      start = dayFromParts(year, month, 1);
      next = dayFromParts(year, month + 1, 1);
    }
    slots.push({
      key: formatDay(start),
      period: formatDay(day),
      periodEnd: formatDay(Math.min(next - 1, last)),
    });
    day = next;
  }
  return slots;
}

/** PostgreSQL `date_trunc` unit for a bucket (whitelisted, never client input). */
export const BUCKET_UNIT: Record<DashboardBucket, string> = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
};
