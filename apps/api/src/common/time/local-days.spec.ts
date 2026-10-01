import { describe, expect, it } from 'vitest';
import { AppException } from '../errors/app-exception.js';
import { formatLocalDateTime, instantRange, localDay, formatDay } from './local-days.js';

describe('instantRange', () => {
  it('turns local days into [start of the first day, start of the day after the last) in UTC', () => {
    expect(instantRange('2026-03-02', '2026-03-02', 'Europe/Istanbul')).toEqual({
      gte: new Date('2026-03-01T21:00:00.000Z'),
      lt: new Date('2026-03-02T21:00:00.000Z'),
    });
    expect(instantRange('2026-03-02', '2026-03-02', 'America/New_York')).toEqual({
      gte: new Date('2026-03-02T05:00:00.000Z'),
      lt: new Date('2026-03-03T05:00:00.000Z'),
    });
  });

  it('defaults to UTC days', () => {
    expect(instantRange('2026-03-01', '2026-03-31')).toEqual({
      gte: new Date('2026-03-01T00:00:00.000Z'),
      lt: new Date('2026-04-01T00:00:00.000Z'),
    });
  });

  it('puts 23:30 UTC on the next local day east of UTC (the midnight boundary)', () => {
    const instant = new Date('2026-03-01T23:30:00.000Z');
    expect(formatDay(localDay(instant, 'UTC'))).toBe('2026-03-01');
    expect(formatDay(localDay(instant, 'Europe/Istanbul'))).toBe('2026-03-02');
    expect(formatLocalDateTime(instant, 'Europe/Istanbul')).toBe('2026-03-02 02:30');

    const march1 = instantRange('2026-03-01', '2026-03-01', 'UTC');
    const march2Istanbul = instantRange('2026-03-02', '2026-03-02', 'Europe/Istanbul');
    const inside = (range: { gte?: Date; lt?: Date }) =>
      instant >= range.gte! && instant < range.lt!;
    expect(inside(march1)).toBe(true);
    expect(inside(march2Istanbul)).toBe(true);
  });

  it('follows DST: a spring-forward day is 23 hours long', () => {
    const { gte, lt } = instantRange('2026-03-08', '2026-03-08', 'America/New_York');
    expect(lt!.getTime() - gte!.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it('keeps date-time bounds as exact, inclusive instants', () => {
    expect(
      instantRange('2026-03-01T10:00:00+03:00', '2026-03-01T12:00:00Z', 'Europe/Istanbul'),
    ).toEqual({
      gte: new Date('2026-03-01T07:00:00.000Z'),
      lte: new Date('2026-03-01T12:00:00.000Z'),
    });
  });

  it('accepts open ranges', () => {
    expect(instantRange(undefined, undefined)).toEqual({});
    expect(instantRange('2026-03-01', undefined, 'UTC')).toEqual({
      gte: new Date('2026-03-01T00:00:00.000Z'),
    });
  });

  it('rejects an end before the start, and unknown or numeric time zones (400)', () => {
    const status = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        return error instanceof AppException ? error.getStatus() : 'other';
      }
      return 'none';
    };
    expect(status(() => instantRange('2026-03-02', '2026-03-01'))).toBe(400);
    expect(status(() => instantRange(undefined, undefined, 'Mars/Olympus'))).toBe(400);
    expect(status(() => instantRange('2026-03-01', '2026-03-01', '+03:00'))).toBe(400);
  });
});
