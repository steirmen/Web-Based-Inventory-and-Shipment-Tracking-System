import { describe, expect, it } from 'vitest';
import { AppException } from '../common/errors/app-exception.js';
import {
  dashboardBuckets,
  type DashboardPeriodInput,
  resolveDashboardPeriods,
  startOfLocalDay,
  dayOf,
  isKnownTimeZone,
} from './dashboard-period.js';

/** 2026-10-01 10:30 UTC — 13:30 in Istanbul (UTC+3), 06:30 in New York (UTC−4). */
const NOW = new Date('2026-10-01T10:30:00.000Z');

const resolve = (input: DashboardPeriodInput, now = NOW) => resolveDashboardPeriods(input, now);

/** The single field error that resolving `input` throws (400 VALIDATION_ERROR). */
function fieldError(input: DashboardPeriodInput): { field: string; message: string } {
  let caught: unknown;
  try {
    resolve(input);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AppException);
  const body = (caught as AppException).toBody();
  expect(body).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
  expect(body.details).toHaveLength(1);
  const [detail] = body.details!;
  return { field: detail!.field, message: detail!.messages[0]! };
}

describe('resolveDashboardPeriods: presets', () => {
  it.each([
    ['TODAY', '2026-10-01', '2026-10-01', 1],
    ['LAST_7_DAYS', '2026-09-25', '2026-10-01', 7],
    ['LAST_30_DAYS', '2026-09-02', '2026-10-01', 30],
    ['THIS_MONTH', '2026-10-01', '2026-10-01', 1],
    ['PREVIOUS_MONTH', '2026-09-01', '2026-09-30', 30],
    ['THIS_YEAR', '2026-01-01', '2026-10-01', 274],
  ] as const)('%s covers %s … %s (%i days, today included)', (range, from, to, days) => {
    const { current } = resolve({ range });
    expect(current).toMatchObject({ range, from, to, days, timeZone: 'UTC' });
    expect(current.start).toBe(`${from}T00:00:00.000Z`);
  });

  it('defaults to the last 30 days in UTC', () => {
    expect(resolve({}).current).toMatchObject({
      range: 'LAST_30_DAYS',
      timeZone: 'UTC',
      from: '2026-09-02',
      to: '2026-10-01',
      start: '2026-09-02T00:00:00.000Z',
      end: '2026-10-02T00:00:00.000Z',
    });
  });

  it('ends at the start of the day after `to` (exclusive), so the last day is complete', () => {
    expect(resolve({ range: 'TODAY' }).current).toMatchObject({
      start: '2026-10-01T00:00:00.000Z',
      end: '2026-10-02T00:00:00.000Z',
    });
  });

  it('counts days in the requested time zone', () => {
    // 22:30 UTC on Sep 30 is already Oct 1 in Istanbul.
    const lateEvening = new Date('2026-09-30T22:30:00.000Z');
    expect(resolve({ range: 'TODAY' }, lateEvening).current.from).toBe('2026-09-30');
    expect(
      resolve({ range: 'TODAY', timeZone: 'Europe/Istanbul' }, lateEvening).current,
    ).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-01',
      start: '2026-09-30T21:00:00.000Z',
      end: '2026-10-01T21:00:00.000Z',
      timeZone: 'Europe/Istanbul',
    });
  });

  it('handles months, years, and leap days at their edges', () => {
    const newYear = new Date('2027-01-01T00:00:00.000Z');
    expect(resolve({ range: 'PREVIOUS_MONTH' }, newYear).current).toMatchObject({
      from: '2026-12-01',
      to: '2026-12-31',
    });
    expect(resolve({ range: 'THIS_YEAR' }, newYear).current).toMatchObject({
      from: '2027-01-01',
      to: '2027-01-01',
      days: 1,
    });
    const march = new Date('2028-03-10T12:00:00.000Z');
    expect(resolve({ range: 'PREVIOUS_MONTH' }, march).current).toMatchObject({
      from: '2028-02-01',
      to: '2028-02-29',
      days: 29,
    });
  });

  it('keeps local midnights across a daylight-saving change', () => {
    // New York: EDT (UTC−4) until Nov 1 2026 02:00, then EST (UTC−5).
    const { current } = resolve(
      { range: 'CUSTOM', from: '2026-10-31', to: '2026-11-01', timeZone: 'America/New_York' },
      NOW,
    );
    expect(current).toMatchObject({
      start: '2026-10-31T04:00:00.000Z',
      end: '2026-11-02T05:00:00.000Z',
      days: 2,
    });
  });
});

describe('resolveDashboardPeriods: comparison period', () => {
  it('is the same number of days immediately before', () => {
    const { previous } = resolve({ range: 'CUSTOM', from: '2026-09-01', to: '2026-09-30' });
    expect(previous).toMatchObject({
      from: '2026-08-02',
      to: '2026-08-31',
      days: 30,
      start: '2026-08-02T00:00:00.000Z',
      end: '2026-09-01T00:00:00.000Z',
    });
  });

  it('touches the current period without a gap or overlap', () => {
    for (const range of [
      'TODAY',
      'LAST_7_DAYS',
      'THIS_MONTH',
      'PREVIOUS_MONTH',
      'THIS_YEAR',
    ] as const) {
      const { current, previous } = resolve({ range, timeZone: 'Europe/Istanbul' });
      expect(previous.end).toBe(current.start);
      expect(previous.days).toBe(current.days);
    }
  });
});

describe('resolveDashboardPeriods: validation', () => {
  it('accepts a custom range of single days and of the maximum length', () => {
    expect(resolve({ range: 'CUSTOM', from: '2026-03-05', to: '2026-03-05' }).current.days).toBe(1);
    expect(resolve({ range: 'CUSTOM', from: '2025-01-01', to: '2026-01-01' }).current.days).toBe(
      366,
    );
  });

  it.each<[string, DashboardPeriodInput, string, RegExp]>([
    ['missing from', { range: 'CUSTOM', to: '2026-09-30' }, 'from', /required/],
    ['missing to', { range: 'CUSTOM', from: '2026-09-01' }, 'to', /required/],
    [
      'impossible from',
      { range: 'CUSTOM', from: '2026-02-30', to: '2026-03-01' },
      'from',
      /YYYY-MM-DD/,
    ],
    ['invalid to', { range: 'CUSTOM', from: '2026-01-01', to: '2026-13-01' }, 'to', /YYYY-MM-DD/],
    [
      'date-time instead of date',
      { range: 'CUSTOM', from: '2026-09-01T00:00:00Z', to: '2026-09-02' },
      'from',
      /YYYY-MM-DD/,
    ],
    [
      'from after to',
      { range: 'CUSTOM', from: '2026-09-02', to: '2026-09-01' },
      'to',
      /before from/,
    ],
    [
      'longer than 366 days',
      { range: 'CUSTOM', from: '2025-01-01', to: '2026-01-02' },
      'to',
      /366/,
    ],
    ['from with a preset', { range: 'LAST_7_DAYS', from: '2026-09-01' }, 'from', /CUSTOM/],
    ['to with the default range', { to: '2026-09-01' }, 'to', /CUSTOM/],
    ['unknown time zone', { timeZone: 'Mars/Olympus' }, 'timeZone', /IANA/],
    ['numeric offset', { timeZone: '+03:00' }, 'timeZone', /IANA/],
  ])('rejects %s', (_label, input, field, message) => {
    const error = fieldError(input);
    expect(error.field).toBe(field);
    expect(error.message).toMatch(message);
  });
});

describe('time zones', () => {
  it('accepts IANA names as given and refuses offsets and junk', () => {
    for (const zone of [
      'UTC',
      'utc',
      'Europe/Istanbul',
      'Asia/Kolkata',
      'Etc/GMT+3',
      'America/Argentina/Buenos_Aires',
    ]) {
      expect(isKnownTimeZone(zone)).toBe(true);
    }
    for (const zone of [
      '+03:00',
      'Mars/Olympus',
      "UTC'; DROP TABLE orders; --",
      '',
      'a'.repeat(65),
    ]) {
      expect(isKnownTimeZone(zone)).toBe(false);
    }
    // The name is kept as given (ICU would report the legacy Asia/Calcutta).
    expect(resolve({ timeZone: 'Asia/Kolkata' }).current.timeZone).toBe('Asia/Kolkata');
  });

  it('finds local midnight as a UTC instant', () => {
    expect(startOfLocalDay(dayOf('2026-10-01'), 'Europe/Istanbul').toISOString()).toBe(
      '2026-09-30T21:00:00.000Z',
    );
    expect(startOfLocalDay(dayOf('2026-07-01'), 'America/New_York').toISOString()).toBe(
      '2026-07-01T04:00:00.000Z',
    );
    expect(startOfLocalDay(dayOf('2026-01-01'), 'Asia/Kolkata').toISOString()).toBe(
      '2025-12-31T18:30:00.000Z',
    );
  });
});

describe('dashboardBuckets', () => {
  it('uses one bucket per day', () => {
    expect(dashboardBuckets('2026-09-29', '2026-10-01', 'DAY')).toEqual([
      { key: '2026-09-29', period: '2026-09-29', periodEnd: '2026-09-29' },
      { key: '2026-09-30', period: '2026-09-30', periodEnd: '2026-09-30' },
      { key: '2026-10-01', period: '2026-10-01', periodEnd: '2026-10-01' },
    ]);
  });

  it('uses Monday-based weeks, clipped to the period', () => {
    // 2026-09-02 is a Wednesday; 2026-10-01 a Thursday.
    const weeks = dashboardBuckets('2026-09-02', '2026-10-01', 'WEEK');
    expect(weeks[0]).toEqual({ key: '2026-08-31', period: '2026-09-02', periodEnd: '2026-09-06' });
    expect(weeks[1]).toEqual({ key: '2026-09-07', period: '2026-09-07', periodEnd: '2026-09-13' });
    expect(weeks.at(-1)).toEqual({
      key: '2026-09-28',
      period: '2026-09-28',
      periodEnd: '2026-10-01',
    });
    expect(weeks).toHaveLength(5);
  });

  it('uses calendar months, clipped to the period', () => {
    expect(dashboardBuckets('2026-01-15', '2026-03-10', 'MONTH')).toEqual([
      { key: '2026-01-01', period: '2026-01-15', periodEnd: '2026-01-31' },
      { key: '2026-02-01', period: '2026-02-01', periodEnd: '2026-02-28' },
      { key: '2026-03-01', period: '2026-03-01', periodEnd: '2026-03-10' },
    ]);
  });

  it('picks the bucket size from the range length', () => {
    expect(resolve({ range: 'LAST_30_DAYS' }).bucket).toBe('DAY');
    expect(resolve({ range: 'CUSTOM', from: '2026-09-01', to: '2026-10-01' }).bucket).toBe('DAY');
    expect(resolve({ range: 'CUSTOM', from: '2026-08-31', to: '2026-10-01' }).bucket).toBe('WEEK');
    expect(resolve({ range: 'CUSTOM', from: '2026-07-01', to: '2026-09-30' }).bucket).toBe('WEEK');
    expect(resolve({ range: 'THIS_YEAR' }).bucket).toBe('MONTH');
  });
});
