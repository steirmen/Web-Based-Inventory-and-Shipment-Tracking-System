import type { Prisma } from '../generated/prisma/client.js';

/** An organization's first order is SO-1001. */
const FIRST_NUMBER = 1001;
const PREFIX = 'SO-';

/**
 * Takes the next order number inside the caller's transaction with ONE atomic
 * upsert on `order_number_sequences`. The upsert locks the organization's
 * counter row until commit, so concurrent creates are serialized and never
 * get the same number (no "count + 1" race); a rolled-back create also rolls
 * the counter back. A number that is somehow already taken (e.g. an order
 * inserted by hand) is skipped.
 */
export async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<string> {
  for (;;) {
    const [row] = await tx.$queryRaw<{ last_number: number }[]>`
      INSERT INTO order_number_sequences (organization_id, last_number, updated_at)
      VALUES (${organizationId}::uuid, ${FIRST_NUMBER}, now())
      ON CONFLICT (organization_id)
      DO UPDATE SET last_number = order_number_sequences.last_number + 1, updated_at = now()
      RETURNING last_number`;
    const orderNumber = `${PREFIX}${row!.last_number}`;
    const taken = await tx.order.findUnique({
      where: { organizationId_orderNumber: { organizationId, orderNumber } },
      select: { id: true },
    });
    if (!taken) return orderNumber;
  }
}
