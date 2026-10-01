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

import {
  dayFromParts,
  dayOf,
  formatDay,
  invalidField as invalidDashboardField,
  isCalendarDate,
  isKnownTimeZone,
  localDay,
  startOfLocalDay,
  ymd,
  type Day,
} from '../common/time/local-days.js';

/**
 * Date ranges of the dashboard. A range is a whole number of LOCAL days in the
 * requested IANA time zone (default UTC, the API's existing date convention):
 * local days `from`…`to` (inclusive) become the UTC instants [start, end),
 * where start is `from` 00:00 local and end is the day after `to`, 00:00
 * local. Pure functions; `now` is passed in so tests can pin the clock.
 */

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
        if (!isCalendarDate(value)) {
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
