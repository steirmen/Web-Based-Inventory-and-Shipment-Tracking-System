import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, orgPath, test } from '../support/fixtures.js';

/** Value of a dashboard KPI card. */
const kpi = (page: Page, label: string) =>
  page
    .getByRole('heading', { level: 3, name: label, exact: true })
    .locator('xpath=ancestor::div[contains(@class, "rounded-card")][1]')
    .locator('p')
    .first();

/** Value of a report total ("Revenue", "Orders", …). */
const total = (page: Page, label: string) =>
  page
    .locator('dt', { hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::dd[1]');

const day = (date: string) => `range=CUSTOM&from=${date}&to=${date}`;

/** An amount as the interface shows it (the seeded workspace sells in Turkish lira). */
const lira = (amount: string) => `₺${amount}`;

/** Downloads the current report's CSV through the Export menu, as a user would. */
async function exportCsv(page: Page, path: string) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'CSV (.csv)' }).click(),
  ]);
  await download.saveAs(path);
  return { name: download.suggestedFilename(), bytes: readFileSync(path) };
}

/*
 * Seeded orders (seed.setup.ts): SO-1001 09:59Z (3.00), SO-1002 23:30Z (4.50) on
 * 2026-03-01 UTC; SO-1003 00:15Z (49.90), SO-1004 08:00Z (confirmed: not
 * realized) on 2026-03-02 UTC. Which local day each falls on depends on the zone:
 */
const MATRIX = {
  UTC: { d1: [2, '7.50'], d2: [2, '49.90'], firstCreated: '2026-03-01 09:59' },
  'Europe/Istanbul': { d1: [1, '3.00'], d2: [3, '54.40'], firstCreated: '2026-03-01 12:59' },
  // SO-1004 is exactly 00:00 on March 2 here (start of the day: included in day 2).
  'America/Los_Angeles': { d1: [3, '57.40'], d2: [1, '0.00'], firstCreated: '2026-03-01 01:59' },
  // SO-1001 is 23:59 on March 1 here (end of the day: still day 1).
  'Pacific/Kiritimati': { d1: [1, '3.00'], d2: [3, '54.40'], firstCreated: '2026-03-01 23:59' },
} as const;

for (const [timeZone, expected] of Object.entries(MATRIX)) {
  test.describe(`time zone ${timeZone}`, () => {
    test.use({ timezoneId: timeZone });

    test('dashboard, orders list, sales report, orders report, and CSV agree on local days', async ({
      pageAs,
      data,
    }, testInfo) => {
      const page = await pageAs('owner');
      for (const [date, [orders, revenue]] of [
        ['2026-03-01', expected.d1],
        ['2026-03-02', expected.d2],
      ] as const) {
        await page.goto(orgPath(data.acme, `?${day(date)}`));
        await expect(page.getByText(`(${timeZone})`)).toBeVisible();
        await expect(kpi(page, 'Orders')).toHaveText(String(orders));
        await expect(kpi(page, 'Total sales')).toHaveText(lira(revenue));

        await page.goto(orgPath(data.acme, `/orders?from=${date}&to=${date}`));
        await expect(page.getByText(`Days in ${timeZone}.`)).toBeVisible();
        await expect(page.locator('main table tbody tr')).toHaveCount(orders);

        await page.goto(orgPath(data.acme, `/reports/sales?${day(date)}`));
        if (revenue === '0.00') {
          // No realized order that day: the report says so instead of showing zeros.
          await expect(page.getByText('No sales in this period.')).toBeVisible();
        } else {
          await expect(total(page, 'Revenue')).toHaveText(lira(revenue));
        }
        await page.goto(orgPath(data.acme, `/reports/orders?${day(date)}`));
        await expect(total(page, 'Orders')).toHaveText(String(orders));
      }

      // CSV timestamps are local times of the same zone, labelled in the header.
      await page.goto(
        orgPath(data.acme, `/reports/orders?range=CUSTOM&from=2026-03-01&to=2026-03-02`),
      );
      const csv = await exportCsv(page, testInfo.outputPath('orders.csv'));
      const text = csv.bytes.toString('utf8');
      expect(text).toContain(`Created (${timeZone})`);
      expect(text).toContain(`${data.orders.o1.number},Completed`);
      expect(text.split('\r\n').find((line) => line.startsWith(data.orders.o1.number))).toContain(
        expected.firstCreated,
      );
    });
  });
}

test.describe('reports', () => {
  test('filters (search, status, warehouse, customer, product, category) and pagination', async ({
    pageAs,
    data,
  }) => {
    const page = await pageAs('owner');
    const march = 'range=CUSTOM&from=2026-03-01&to=2026-03-31';

    await page.goto(orgPath(data.acme, `/reports/sales?${march}`));
    await expect(total(page, 'Revenue')).toHaveText(lira('60.40')); // 3.00 + 4.50 + 49.90 + 3.00
    await page.getByRole('searchbox', { name: 'Search' }).fill('Riverside');
    await expect(total(page, 'Revenue')).toHaveText(lira('52.90'));
    await expect(page).toHaveURL(/search=Riverside/);

    await page.goto(orgPath(data.acme, `/reports/sales?${march}&productId=${data.products.lamp}`));
    await expect(total(page, 'Revenue')).toHaveText(lira('49.90'));
    await page.goto(orgPath(data.acme, `/reports/sales?${march}`));
    await page.getByLabel('Category').selectOption({ label: 'Packaging' });
    await expect(total(page, 'Revenue')).toHaveText(lira('3.00')); // the =HYPERLINK… product

    // Customer filter: the shared customer search.
    await page.goto(orgPath(data.acme, `/reports/sales?${march}`));
    await page.getByRole('searchbox', { name: 'Customer' }).fill('Northwind');
    await page
      .getByRole('list', { name: 'Matching customers' })
      .getByRole('button', { name: /Northwind Cafe/ })
      .click();
    await expect(total(page, 'Revenue')).toHaveText(lira('4.50'));

    await page.goto(orgPath(data.acme, `/reports/orders?${march}`));
    await expect(total(page, 'Orders')).toHaveText('5');
    await page.getByLabel('Status').selectOption({ label: 'Confirmed' });
    await expect(total(page, 'Orders')).toHaveText('1');
    await page.getByLabel('Status').selectOption({ index: 0 });
    await page.getByLabel('Warehouse').selectOption({ label: 'East Depot' });
    await expect(page.getByText(/nothing matches|No orders match/i).first()).toBeVisible();

    // Pagination (more than 25 stock items).
    await page.goto(orgPath(data.acme, '/reports/inventory'));
    const pagination = page.getByRole('navigation', { name: 'Pagination' });
    await expect(pagination).toContainText('Page 1 of 2');
    await pagination.getByRole('button', { name: 'Next' }).click();
    await expect(pagination).toContainText('Page 2 of 2');
    await expect(page).toHaveURL(/page=2/);
  });

  test('the dashboard and the reports show the same numbers', async ({ pageAs, data }) => {
    const page = await pageAs('owner');
    await page.goto(orgPath(data.acme, '?range=THIS_YEAR'));
    const sales = await kpi(page, 'Total sales').innerText();
    const orders = await kpi(page, 'Orders').innerText();
    const units = (await kpi(page, 'Inventory units').innerText()).replace(/\s*units$/, '');
    const low = await kpi(page, 'Low stock').innerText();

    await page.goto(orgPath(data.acme, '/reports/sales?range=THIS_YEAR'));
    await expect(total(page, 'Revenue')).toHaveText(sales);
    await page.goto(orgPath(data.acme, '/reports/orders?range=THIS_YEAR'));
    await expect(total(page, 'Orders')).toHaveText(orders);
    await page.goto(orgPath(data.acme, '/reports/inventory'));
    await expect(total(page, 'Units')).toHaveText(units);
    await expect(total(page, 'Low stock')).toHaveText(low);
  });

  test('CSV export: real download, filters applied, exact decimals, no ids, formulas neutralized', async ({
    pageAs,
    data,
  }, testInfo) => {
    const page = await pageAs('owner');
    await page.goto(
      orgPath(data.acme, '/reports/sales?range=CUSTOM&from=2026-03-01&to=2026-03-31'),
    );
    const csv = await exportCsv(page, testInfo.outputPath('sales.csv'));

    expect(csv.name).toBe('sales-report_2026-03-01_2026-03-31_TRY.csv');
    expect([...csv.bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    const text = csv.bytes.toString('utf8').replace(/^﻿/, '');
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toContain('\n'); // CRLF only
    const lines = text.split('\r\n').filter(Boolean);
    expect(lines[0]).toBe(
      'Date (UTC),Order number,Status,Customer,Company,Warehouse code,Warehouse,Units,Revenue,Currency',
    );
    expect(lines).toHaveLength(5); // header + 4 realized orders
    expect(text).toContain(',49.90');
    expect(text).toContain(',3.00');
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    // Spreadsheet formulas from user data are neutralized with a leading apostrophe.
    expect(text).toContain(`'=cmd|' /C calc'!A0`);
    expect(text).toContain(`'@SUM(1+1)`);
    expect(text).not.toMatch(/(^|,)=cmd/m);

    // The export follows the active filters.
    await page.getByRole('searchbox', { name: 'Search' }).fill('Riverside');
    await expect(total(page, 'Revenue')).toHaveText(lira('52.90'));
    const filtered = await exportCsv(page, testInfo.outputPath('sales-filtered.csv'));
    const rows = filtered.bytes.toString('utf8').split('\r\n').filter(Boolean).slice(1);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.includes('Riverside Dental'))).toBe(true);
  });
});
