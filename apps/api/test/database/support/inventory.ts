import { expect } from 'vitest';
import { prisma } from './database.js';

/**
 * The core inventory invariant: for every inventory row, the movement history
 * of its (warehouse, product) sums to the current quantity, the movements
 * chain (each `quantityBefore` is the previous `quantityAfter`), and the last
 * `quantityAfter` equals the current quantity.
 */
export async function expectLedgerConsistent(organizationId: string): Promise<void> {
  const rows = await prisma.inventory.findMany({ where: { organizationId } });
  for (const row of rows) {
    const movements = await prisma.stockMovement.findMany({
      where: { organizationId, warehouseId: row.warehouseId, productId: row.productId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const total = movements.reduce((sum, movement) => sum + movement.quantityDelta, 0);
    expect(total, `sum of deltas for inventory ${row.id}`).toBe(row.quantity);

    let expectedBefore = 0;
    for (const movement of movements) {
      expect(movement.quantityBefore, `chain of movement ${movement.id}`).toBe(expectedBefore);
      expect(movement.quantityAfter).toBe(movement.quantityBefore + movement.quantityDelta);
      expectedBefore = movement.quantityAfter;
    }
    expect(expectedBefore, `last quantityAfter for inventory ${row.id}`).toBe(row.quantity);
  }
  await expectTransfersBalanced(organizationId);
}

/**
 * Every transfer is exactly one TRANSFER_OUT and one TRANSFER_IN of the same
 * product between two different warehouses, and the stock moved out equals
 * the stock moved in: sourceDelta + destinationDelta = 0.
 */
export async function expectTransfersBalanced(organizationId: string): Promise<void> {
  const legs = await prisma.stockMovement.findMany({
    where: { organizationId, transferGroupId: { not: null } },
  });
  const groups = new Map<string, typeof legs>();
  for (const leg of legs) {
    groups.set(leg.transferGroupId!, [...(groups.get(leg.transferGroupId!) ?? []), leg]);
  }
  for (const [groupId, group] of groups) {
    const out = group.filter((leg) => leg.movementType === 'TRANSFER_OUT');
    const into = group.filter((leg) => leg.movementType === 'TRANSFER_IN');
    expect(group, `legs of transfer ${groupId}`).toHaveLength(2);
    expect([out.length, into.length], `leg types of transfer ${groupId}`).toEqual([1, 1]);
    const [source, destination] = [out[0]!, into[0]!];
    expect(source.productId).toBe(destination.productId);
    expect(source.warehouseId).not.toBe(destination.warehouseId);
    expect(source.quantityBefore + source.quantityDelta).toBe(source.quantityAfter);
    expect(destination.quantityBefore + destination.quantityDelta).toBe(destination.quantityAfter);
    expect(source.quantityDelta + destination.quantityDelta, `balance of ${groupId}`).toBe(0);
    expect(source.quantityDelta).toBeLessThan(0);
  }
}

export async function quantityOf(warehouseId: string, productId: string): Promise<number | null> {
  const row = await prisma.inventory.findUnique({
    where: { warehouseId_productId: { warehouseId, productId } },
  });
  return row?.quantity ?? null;
}
