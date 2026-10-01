import { HttpStatus } from '@nestjs/common';
import { AppException } from '../errors/app-exception.js';

/**
 * Local calendar days in an IANA time zone, and their UTC boundaries: the
 * single definition of "a day" for the dashboard, the reports, and the date
 * filters of the order and stock movement lists (docs/timezone.md).
 *
 * Instants are always real UTC instants (the database runs in UTC). A local
 * day `YYYY-MM-DD` in a zone is the half-open interval [00:00 local, next
 * day 00:00 local), DST-aware. Pure functions (no clock, no I/O).
 */

/** Longest accepted time zone name. */
export const TIME_ZONE_MAX_LENGTH = 64;

/** A calendar day as days since 1970-01-01 (time-zone free arithmetic). */
export type Day = number;

const DAY_MS = 86_400_000;
export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const dayOf = (date: string): Day => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
export const formatDay = (day: Day): string => new Date(day * DAY_MS).toISOString().slice(0, 10);

export function ymd(day: Day): { year: number; month: number; date: number } {
  const value = new Date(day * DAY_MS);
  return { year: value.getUTCFullYear(), month: value.getUTCMonth(), date: value.getUTCDate() };
}
export const dayFromParts = (year: number, month: number, date: number): Day =>
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
  if (timeZone.length > TIME_ZONE_MAX_LENGTH || !ZONE_NAME.test(timeZone)) {
    return false;
  }
  try {
    // Throws a RangeError for unknown zones.
    return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
}

export function invalidField(field: string, message: string): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    'VALIDATION_ERROR',
    'The request contains invalid fields.',
    [{ field, messages: [message] }],
  );
}
/** A valid `YYYY-MM-DD` calendar date (rejects e.g. 2026-02-30, which Date.parse rolls over). */
export function isCalendarDate(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const day = dayOf(value);
  return !Number.isNaN(day) && formatDay(day) === value;
}

export interface InstantRange {
  gte?: Date;
  /** Exclusive end (a date-only `to` ends at the next local midnight). */
  lt?: Date;
  /** Inclusive end (a date-time `to` is an exact instant). */
  lte?: Date;
}

/**
 * The instants of a list filter's `from`/`to`: a date-only value is a local
 * day in `timeZone` (from = its 00:00, to = the next day's 00:00, exclusive);
 * a date-time value (with its own offset) is that exact instant. Throws 400
 * when `to` ends before `from` starts or the time zone is unknown.
 */
export function instantRange(
  from: string | undefined,
  to: string | undefined,
  timeZone = 'UTC',
): InstantRange {
  if (!isKnownTimeZone(timeZone)) {
    throw invalidField('timeZone', 'timeZone must be an IANA time zone, e.g. Europe/Istanbul.');
  }
  const range: InstantRange = {};
  if (from) {
    range.gte = DATE_ONLY.test(from) ? startOfLocalDay(dayOf(from), timeZone) : new Date(from);
  }
  if (to) {
    if (DATE_ONLY.test(to)) range.lt = startOfLocalDay(dayOf(to) + 1, timeZone);
    else range.lte = new Date(to);
  }
  const end = range.lt ?? range.lte;
  if (range.gte && end && (range.lt ? end <= range.gte : end < range.gte)) {
    throw invalidField('to', 'to must not be before from.');
  }
  return range;
}
