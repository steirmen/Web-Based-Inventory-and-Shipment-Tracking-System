import { randomBytes } from 'node:crypto';

/**
 * UUID version 7 (RFC 9562): 48-bit Unix milliseconds, then a 12-bit counter,
 * then random bits. Ids from one generator are strictly increasing, even
 * within the same millisecond, so ordering by id matches creation order.
 * Used where the order of rows matters (stock movements) and for raw SQL
 * inserts, where Prisma's own `uuid(7)` generator does not run.
 */
export function createUuidV7Generator(): (now?: number) => string {
  let lastMs = -1;
  let counter = 0;

  return (now: number = Date.now()): string => {
    if (now > lastMs) {
      lastMs = now;
      counter = 0;
    } else if (++counter > 0xfff) {
      // More than 4096 ids in one millisecond: borrow the next millisecond.
      lastMs += 1;
      counter = 0;
    }

    const bytes = randomBytes(16);
    bytes.writeUIntBE(lastMs, 0, 6);
    bytes[6] = 0x70 | (counter >> 8); // version 7 + counter (high 4 bits)
    bytes[7] = counter & 0xff; // counter (low 8 bits)
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 9562 variant
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
}

/** Process-wide monotonic UUIDv7 generator. */
export const uuidV7 = createUuidV7Generator();
