import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
// The same readers the API database tests use: they parse the files themselves.
import { parseCsv } from '../../apps/api/test/support/parse-csv.js';
import { readXlsx, xlsxValues } from '../../apps/api/test/support/read-xlsx.js';
import { USERS } from '../support/config.js';
import { sql } from '../support/db.js';
import { expect, orgPath, test } from '../support/fixtures.js';

/*
 * Phase 10.1: report exports downloaded through the real Export menu and read
 * back — Excel (.xlsx) and CSV, English and Turkish labels. Seeded March sales
 * (seed.setup.ts): SO-1005 =formula 3.00, SO-1003 Riverside 49.90, SO-1002
 * Northwind 4.50, SO-1001 Riverside 3.00 (newest first), all in TRY.
 */

const MARCH = 'range=CUSTOM&from=2026-03-01&to=2026-03-31';

async function download(page: Page, menu: string, item: string, path: string) {
  await page.getByRole('button', { name: menu, exact: true }).click();
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: item }).click(),
  ]);
  await file.saveAs(path);
  return { name: file.suggestedFilename(), bytes: readFileSync(path) };
}

/** Excel's date serial of a UTC instant (days since 1899-12-30). */
const serial = (iso: string) => (Date.parse(iso) - Date.UTC(1899, 11, 30)) / 86_400_000;

test.describe('report exports', () => {
  // Switching to Turkish is saved for the owner: restore the default for other specs.
  test.afterEach(async () => {
    await sql('UPDATE users SET language = NULL WHERE email = $1', [USERS.owner.email]);
  });

  test('Excel: typed cells, currency formats, exact amounts, same rows as CSV', async ({
    pageAs,
    data,
  }, testInfo) => {
    const page = await pageAs('owner');
    await page.goto(orgPath(data.acme, `/reports/sales?${MARCH}`));
    await expect(page.getByRole('table', { name: 'Realized sales' })).toBeVisible();

    const xlsx = await download(page, 'Export', 'Excel (.xlsx)', testInfo.outputPath('s.xlsx'));
    expect(xlsx.name).toBe('sales-report_2026-03-01_2026-03-31_TRY.xlsx');
    expect([...xlsx.bytes.subarray(0, 2)]).toEqual([0x50, 0x4b]); // a ZIP container
    const book = readXlsx(xlsx.bytes);
    expect(book.sheetName).toBe('Sales');
    expect(book.frozenRows).toBe(1);
    expect(book.autoFilter).toMatch(/^A1:J5$/);

    const header = xlsxValues(book)[0];
    expect(header).toEqual([
      'Date (UTC)',
      'Order number',
      'Status',
      'Customer',
      'Company',
      'Warehouse code',
      'Warehouse',
      'Units',
      'Revenue',
      'Currency',
    ]);
    const rows = book.rows.slice(1);
    expect(rows).toHaveLength(4);
    const first = rows[3]!; // SO-1001, the oldest
    expect(first[1]).toMatchObject({ type: 'string', value: data.orders.o1!.number });
    expect(first[0]!.type).toBe('number');
    expect(Number(first[0]!.value)).toBeCloseTo(serial('2026-03-01T09:59:00Z'), 5);
    expect(first[7]).toMatchObject({ type: 'number', value: '2' });
    expect(first[8]).toMatchObject({ type: 'number', value: '3.00' });
    expect(first[8]!.format).toContain('₺');
    expect(first[9]).toMatchObject({ type: 'string', value: 'TRY' });
    // User data stays text exactly as entered (never a formula).
    expect(rows.some((row) => row[3]?.value === "=cmd|' /C calc'!A0")).toBe(true);
    expect(rows.every((row) => row[3]?.type !== 'number')).toBe(true);

    // The CSV has the same rows in the same order.
    const csv = await download(page, 'Export', 'CSV (.csv)', testInfo.outputPath('s.csv'));
    const table = parseCsv(csv.bytes.toString('utf8'));
    expect(table[0]).toEqual(header);
    expect(table.slice(1).map((row) => row[1])).toEqual(rows.map((row) => row[1]!.value));
    expect(table.slice(1).map((row) => row[8])).toEqual(['3.00', '49.90', '4.50', '3.00']);
  });

  test('Turkish: headers, sheet, statuses, and filename translated; user data unchanged', async ({
    pageAs,
    data,
  }, testInfo) => {
    const page = await pageAs('owner');
    await page.goto(orgPath(data.acme, `/reports/orders?${MARCH}`));
    await page
      .getByRole('radiogroup', { name: 'Language' })
      .getByRole('radio', { name: 'Türkçe' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sipariş raporu' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();

    const xlsx = await download(page, 'Dışa aktar', 'Excel (.xlsx)', testInfo.outputPath('o.xlsx'));
    expect(xlsx.name).toBe('siparis-raporu_2026-03-01_2026-03-31.xlsx');
    const book = readXlsx(xlsx.bytes);
    expect(book.sheetName).toBe('Siparişler');
    const values = xlsxValues(book);
    expect(values[0]).toEqual(
      expect.arrayContaining(['Sipariş No', 'Müşteri', 'Depo', 'Durum', 'Toplam', 'Para birimi']),
    );
    const statuses = values.slice(1).map((row) => row[values[0]!.indexOf('Durum')]);
    expect(statuses).toEqual(expect.arrayContaining(['Tamamlandı', 'Onaylandı', 'Kargolandı']));
    // Names are data, not labels: never translated.
    const customers = values.slice(1).map((row) => row[values[0]!.indexOf('Müşteri')]);
    expect(customers).toEqual(expect.arrayContaining(['Riverside Dental', 'Northwind Cafe']));

    const csv = await download(page, 'Dışa aktar', 'CSV (.csv)', testInfo.outputPath('o.csv'));
    expect(csv.name).toBe('siparis-raporu_2026-03-01_2026-03-31.csv');
    const table = parseCsv(csv.bytes.toString('utf8'));
    expect(table[0]).toEqual(values[0]);
    expect(table).toHaveLength(values.length);
  });
});
