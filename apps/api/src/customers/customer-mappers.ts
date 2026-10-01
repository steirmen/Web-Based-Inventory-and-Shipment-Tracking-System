import type { Customer } from '@app/shared';
import type { Prisma } from '../generated/prisma/client.js';

/** Customer columns plus the order count, computed in the same query (no N+1). */
export const CUSTOMER_SELECT = {
  id: true,
  name: true,
  companyName: true,
  email: true,
  phone: true,
  address: true,
  notes: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { orders: true } },
} satisfies Prisma.CustomerSelect;

type CustomerRow = Prisma.CustomerGetPayload<{ select: typeof CUSTOMER_SELECT }>;

export function toCustomer(row: CustomerRow): Customer {
  const { _count, createdAt, updatedAt, ...fields } = row;
  return {
    ...fields,
    orderCount: _count.orders,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}
