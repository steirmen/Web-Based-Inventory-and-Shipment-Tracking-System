import type { Currency } from '@app/shared';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../../test/support/parse-csv.js';
import { readXlsx, xlsxValues } from '../../../test/support/read-xlsx.js';
import { EXPORT_LABELS } from './export-labels.js';
import { type ExportTable, renderExport } from './export-table.js';
import { columnName, excelSerial, sheetName, xmlText } from './xlsx.js';
import { zip } from './zip.js';

interface Row {
  name: string;
  note: string | null;
  units: number;
  amount: string;
  currency: Currency | null;
  at: string;
}

/** Every kind of value that broke spreadsheets before: separators, quotes, breaks, Turkish, formulas. */
const ROWS: Row[] = [
  {
    name: 'Comma, Inc.',
    note: 'say "hi"',
    units: 3,
    amount: '1250.50',
    currency: 'TRY',
    at: '2025-09-03T10:00:00Z',
  },
  {
    name: 'Şişli Çiçekçilik Ğ İ ı Ö Ü',
    note: 'Line\nbreak',
    units: -2,
    amount: '-12.50',
    currency: 'EUR',
    at: '2025-09-03T21:30:00Z',
  },
  {
    name: "O'Brien's Café; € Store",
    note: '=HYPERLINK("http://evil.example")',
    units: 0,
    amount: '0.10',
    currency: 'USD',
    at: '2025-12-31T23:59:00Z',
  },
  {
    name: 'Tab\tand ctrl\u0001',
    note: null,
    units: 1000000,
    amount: '999999999999.99',
    currency: null,
    at: '2025-01-01T00:00:00Z',
  },
];

const table = (timeZone = 'Europe/Istanbul'): ExportTable<Row> => ({
  filename: 'test-report',
  sheetName: 'Satışlar',
  timeZone,
  rows: ROWS,
  columns: [
    { kind: 'text', header: 'Müşteri', value: (row) => row.name },
    { kind: 'text', header: 'Not', value: (row) => row.note },
    { kind: 'integer', header: 'Adet', value: (row) => row.units },
    { kind: 'money', header: 'Ciro', value: (row) => row.amount, currency: (row) => row.currency },
    { kind: 'text', header: 'Para birimi', value: (row) => row.currency },
    { kind: 'datetime', header: `Tarih (${timeZone})`, value: (row) => row.at },
  ],
});

describe('CSV export (renderExport csv)', () => {
  it('parses back with every row as wide as the header', () => {
    const file = renderExport(table(), 'csv');
    expect(file.filename).toBe('test-report.csv');
    expect(file.contentType).toBe('text/csv; charset=utf-8');

    const rows = parseCsv(file.body as string);
    expect(rows).toHaveLength(ROWS.length + 1);
    expect(rows.every((row) => row.length === rows[0]!.length)).toBe(true);
    expect(rows[0]).toEqual([
      'Müşteri',
      'Not',
      'Adet',
      'Ciro',
      'Para birimi',
      'Tarih (Europe/Istanbul)',
    ]);
    expect(rows[1]).toEqual(['Comma, Inc.', 'say "hi"', '3', '1250.50', 'TRY', '2025-09-03 13:00']);
    // Local time in the table's zone; numbers stay numbers (also negative); text formulas are inert.
    expect(rows[2]).toEqual([
      'Şişli Çiçekçilik Ğ İ ı Ö Ü',
      'Line\nbreak',
      '-2',
      '-12.50',
      'EUR',
      '2025-09-04 00:30',
    ]);
    expect(rows[3]![1]).toBe('\'=HYPERLINK("http://evil.example")');
    expect(rows[3]![0]).toBe("O'Brien's Café; € Store");
  });
});

describe('Excel export (renderExport xlsx)', () => {
  it('is a valid package with one sheet, a frozen and filterable header, and typed cells', () => {
    const file = renderExport(table(), 'xlsx');
    expect(file.filename).toBe('test-report.xlsx');
    expect(file.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const workbook = readXlsx(file.body as Buffer);

    expect(workbook.entries.sort()).toEqual(
      [
        '[Content_Types].xml',
        '_rels/.rels',
        'xl/_rels/workbook.xml.rels',
        'xl/styles.xml',
        'xl/workbook.xml',
        'xl/worksheets/sheet1.xml',
      ].sort(),
    );
    expect(workbook.sheetName).toBe('Satışlar');
    expect(workbook.frozenRows).toBe(1);
    expect(workbook.autoFilter).toBe('A1:F5');

    const values = xlsxValues(workbook);
    expect(values).toHaveLength(ROWS.length + 1);
    expect(values.every((row) => row.length === 6)).toBe(true);
    expect(values[0]).toEqual([
      'Müşteri',
      'Not',
      'Adet',
      'Ciro',
      'Para birimi',
      'Tarih (Europe/Istanbul)',
    ]);
    expect(workbook.rows[0]!.every((cell) => cell?.type === 'string')).toBe(true);
  });

  it('keeps text exact (no formula, Turkish characters, quotes, breaks) and drops XML-illegal characters', () => {
    const rows = readXlsx(renderExport(table(), 'xlsx').body as Buffer).rows;
    expect(rows[1]![0]).toMatchObject({ value: 'Comma, Inc.', type: 'string' });
    expect(rows[1]![1]?.value).toBe('say "hi"');
    expect(rows[2]![0]?.value).toBe('Şişli Çiçekçilik Ğ İ ı Ö Ü');
    expect(rows[2]![1]?.value).toBe('Line\nbreak');
    // A string cell is never evaluated, so it is written exactly as stored.
    expect(rows[3]![1]).toMatchObject({
      value: '=HYPERLINK("http://evil.example")',
      type: 'string',
    });
    expect(rows[3]![0]?.value).toBe("O'Brien's Café; € Store");
    expect(rows[4]![0]?.value).toBe('Tab\tand ctrl');
    // An empty value is an empty cell.
    expect(rows[4]![1]).toBeNull();
  });

  it('writes numbers, money in its currency format, and local date-times as numbers', () => {
    const rows = readXlsx(renderExport(table(), 'xlsx').body as Buffer).rows;
    expect(rows[1]![2]).toEqual({ value: '3', type: 'number', format: '#,##0' });
    expect(rows[2]![2]).toEqual({ value: '-2', type: 'number', format: '#,##0' });
    expect(rows[1]![3]).toEqual({ value: '1250.50', type: 'number', format: '"₺"#,##0.00' });
    expect(rows[2]![3]).toEqual({ value: '-12.50', type: 'number', format: '"€"#,##0.00' });
    expect(rows[3]![3]).toEqual({ value: '0.10', type: 'number', format: '"$"#,##0.00' });
    expect(rows[4]![3]).toEqual({ value: '999999999999.99', type: 'number', format: '#,##0.00' });
    // 2025-09-03 13:00 in Istanbul (10:00 UTC).
    expect(rows[1]![5]).toMatchObject({ type: 'number', format: 'yyyy\\-mm\\-dd\\ hh:mm' });
    expect(Number(rows[1]![5]!.value)).toBeCloseTo(excelSerial('2025-09-03 13:00'), 8);
  });
});

describe('xlsx helpers', () => {
  it('names columns like Excel', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });

  it('converts local date-times to Excel serials', () => {
    expect(excelSerial('1900-03-01 00:00')).toBe(61);
    expect(excelSerial('2025-09-03 12:00')).toBe(45903.5);
  });

  it('escapes XML and makes valid sheet names', () => {
    expect(xmlText('<a & "b">')).toBe('&lt;a &amp; &quot;b&quot;&gt;');
    expect(sheetName('a/b:c*d?[e]\\f')).toBe('a b c d  e  f');
    expect(sheetName('x'.repeat(40))).toHaveLength(31);
  });

  it('zips deterministically (same input → same bytes)', () => {
    const entries = [{ name: 'a.txt', data: Buffer.from('hello hello hello hello') }];
    expect(zip(entries).equals(zip(entries))).toBe(true);
  });
});

describe('export labels', () => {
  it('translates every generated label and has the same keys in both languages', () => {
    const keys = (value: object): string[] =>
      Object.entries(value).flatMap(([key, entry]) =>
        typeof entry === 'object' ? keys(entry as object).map((k) => `${key}.${k}`) : [key],
      );
    expect(keys(EXPORT_LABELS.tr)).toEqual(keys(EXPORT_LABELS.en));
    expect(EXPORT_LABELS.tr.column.orderNumber).toBe('Sipariş No');
    expect(EXPORT_LABELS.tr.column.customer).toBe('Müşteri');
    expect(EXPORT_LABELS.tr.column.warehouse).toBe('Depo');
    expect(EXPORT_LABELS.tr.column.revenue).toBe('Ciro');
    expect(EXPORT_LABELS.en.column.revenue).toBe('Revenue');
    // File names stay ASCII (Content-Disposition).
    for (const language of [EXPORT_LABELS.en, EXPORT_LABELS.tr]) {
      expect(Object.values(language.file).every((name) => /^[a-z-]+$/.test(name))).toBe(true);
    }
  });
});
