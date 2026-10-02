import { DEFAULT_DASHBOARD_TIME_ZONE, type DashboardBucket } from '@app/shared';

/**
 * Calendar days and the viewer's time zone in the web app: the single place
 * for date-only values (`YYYY-MM-DD`) shared by the dashboard, the reports,
 * and the date filters of the order and stock movement lists. The API cuts the
 * same local days (apps/api/src/common/time/local-days.ts, docs/timezone.md).
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Days since 1970-01-01 of a valid yyyy-mm-dd date, or null (rejects e.g. 2026-02-30). */
export function dayOf(value: string): number | null {
  if (!DATE_PATTERN.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) return null;
  return time / DAY_MS;
}

/** IANA zone names only (never numeric offsets), as the API accepts them. */
const TIME_ZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

/** A time zone from a URL: kept when it looks like an IANA name, else '' (the API validates it again). */
export function timeZoneParam(value: string | null): string {
  return value && value.length <= 64 && TIME_ZONE_PATTERN.test(value) ? value : '';
}

/**
 * The viewer's IANA time zone, so "today" and the chart's days are the
 * viewer's days. Falls back to UTC when the browser reports none (or an
 * offset the API does not accept).
 */
export function browserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && TIME_ZONE_PATTERN.test(zone) ? zone : DEFAULT_DASHBOARD_TIME_ZONE;
  } catch {
    return DEFAULT_DASHBOARD_TIME_ZONE;
  }
}

// --- Display ------------------------------------------------------------------------

/** Date-only values are calendar days: format them in UTC so they never shift. */
const formatters = new Map<string, Record<'day' | 'shortDay' | 'month', Intl.DateTimeFormat>>();
function formattersFor(locale: string) {
  let entry = formatters.get(locale);
  if (!entry) {
    entry = {
      day: new Intl.DateTimeFormat(locale, {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      shortDay: new Intl.DateTimeFormat(locale, {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
      }),
      month: new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', year: 'numeric' }),
    };
    formatters.set(locale, entry);
  }
  return entry;
}

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** "Sep 2 – Oct 1, 2026" / "2 Eyl – 1 Eki 2026" (or a single day), in the interface locale. */
export function formatDayRange(from: string, to: string, locale = 'en-US'): string {
  const { day } = formattersFor(locale);
  return from === to ? day.format(asDate(from)) : day.formatRange(asDate(from), asDate(to));
}

/** Short x-axis label of a time series bucket. */
export function formatBucketLabel(
  period: string,
  bucket: DashboardBucket,
  locale = 'en-US',
): string {
  const { month, shortDay } = formattersFor(locale);
  return bucket === 'MONTH' ? month.format(asDate(period)) : shortDay.format(asDate(period));
}
