import { describe, expect, it } from 'vitest';
import { isUuid } from '../validation/uuid.js';
import { createUuidV7Generator } from './uuid-v7.js';

describe('UUIDv7 generator', () => {
  it('produces valid version-7 UUIDs with the RFC 9562 variant', () => {
    const id = createUuidV7Generator()();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('encodes the millisecond timestamp first', () => {
    const time = Date.parse('2026-09-30T10:00:00.000Z');
    const id = createUuidV7Generator()(time);
    expect(id.replace(/-/g, '').slice(0, 12)).toBe(time.toString(16).padStart(12, '0'));
  });

  it('is strictly increasing, also within one millisecond and if the clock goes back', () => {
    const next = createUuidV7Generator();
    const time = Date.parse('2026-09-30T10:00:00.000Z');
    const ids = [
      next(time),
      ...Array.from({ length: 5000 }, () => next(time)), // overflows the 12-bit counter
      next(time - 10),
      next(time + 1),
    ];
    for (let index = 1; index < ids.length; index += 1) {
      expect(ids[index - 1] < ids[index]).toBe(true);
    }
  });

  it('is unique', () => {
    const next = createUuidV7Generator();
    expect(new Set(Array.from({ length: 1000 }, () => next())).size).toBe(1000);
  });
});
