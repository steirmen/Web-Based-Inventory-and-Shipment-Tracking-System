import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { REQUIRED_PERMISSIONS_KEY } from '../organizations/organization-context.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

const ORG = '0198c0de-0000-7000-8000-00000000000a';
const NOW = new Date('2026-10-01T10:30:00.000Z');

/** A PrismaService stand-in that records the raw queries and answers empty results. */
function recordingPrisma() {
  const queries: Prisma.Sql[] = [];
  const transactions: { count: number; options: unknown }[] = [];
  const fake = {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = Prisma.sql(strings, ...values);
      queries.push(sql);
      return sql;
    },
    $transaction: async (batch: Prisma.Sql[], options: unknown) => {
      transactions.push({ count: batch.length, options });
      return batch.map((_, index) =>
        index === 3
          ? [
              {
                activeCustomers: 0,
                archivedCustomers: 0,
                newCustomers: 0,
                newCustomersPrevious: 0,
                activeProducts: 0,
                archivedProducts: 0,
              },
            ]
          : [],
      );
    },
  };
  return { prisma: fake as unknown as PrismaService, queries, transactions };
}

describe('DashboardService query strategy', () => {
  it('answers with five grouped queries in one REPEATABLE READ snapshot', async () => {
    const { prisma, queries, transactions } = recordingPrisma();

    await new DashboardService(prisma).summary(ORG, { range: 'THIS_YEAR' }, NOW);

    expect(queries).toHaveLength(5);
    expect(transactions).toEqual([
      { count: 5, options: { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead } },
    ]);
  });

  it('scopes every query to the organization and passes client input only as parameters', async () => {
    const { prisma, queries } = recordingPrisma();
    const timeZone = 'America/Argentina/Buenos_Aires';

    await new DashboardService(prisma).summary(
      ORG,
      { range: 'CUSTOM', from: '2026-01-01', to: '2026-03-31', timeZone },
      NOW,
    );

    for (const query of queries) {
      expect(query.values).toContain(ORG);
      expect(query.text).toMatch(/organization_id = \$\d+::uuid/);
      expect(query.text).not.toContain(timeZone);
    }
    expect(queries.some((query) => query.values.includes(timeZone))).toBe(true);
  });

  it('returns zero-filled, well-formed results for an empty organization', async () => {
    const { prisma } = recordingPrisma();

    const summary = await new DashboardService(prisma).summary(ORG, {}, NOW);

    expect(summary.kpis.sales).toEqual({
      current: '0.00',
      previous: '0.00',
      absoluteChange: '0.00',
      percentageChange: null,
    });
    expect(summary.orderStatus.every((entry) => entry.count === 0)).toBe(true);
    expect(summary.timeSeries.points).toHaveLength(30);
    expect(summary.generatedAt).toBe(NOW.toISOString());
  });
});

describe('DashboardController', () => {
  it('requires DASHBOARD_READ', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, DashboardController.prototype.summary),
    ).toEqual(['DASHBOARD_READ']);
  });
});
