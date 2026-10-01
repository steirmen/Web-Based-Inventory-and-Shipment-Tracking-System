/**
 * CSV for report exports (RFC 4180): comma-separated, CRLF line endings,
 * UTF-8 with a byte-order mark (so spreadsheet apps detect UTF-8 and keep
 * characters such as "ç" or "ş").
 *
 * Safety:
 * - Cells containing a comma, a double quote, a line break, or leading or
 *   trailing spaces are wrapped in double quotes, with inner quotes doubled.
 * - Formula injection: text starting with `=`, `+`, `-`, `@`, a tab, or a
 *   carriage return could run as a formula in Excel, LibreOffice, or Google
 *   Sheets. Such cells get a leading apostrophe (`'=SUM(…)`), which shows the
 *   text as-is instead (OWASP recommendation). Genuine numbers (`-12.50`) are
 *   numeric cells and are left untouched.
 */

export type CsvValue = string | number | null | undefined;

export interface CsvColumn<Row> {
  header: string;
  value: (row: Row) => CsvValue;
}

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
const NEEDS_QUOTES = /[",\r\n]|^\s|\s$/;

/** One cell, escaped and neutralized. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'number' ? String(value) : value;
  if (typeof value === 'string' && FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) {
    text = `'${text}`;
  }
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const BOM = '﻿';
const EOL = '\r\n';

/** The whole document: header row, then one line per row, in the given order. */
export function toCsv<Row>(columns: readonly CsvColumn<Row>[], rows: readonly Row[]): string {
  const lines = [
    columns.map((column) => csvCell(column.header)).join(','),
    ...rows.map((row) => columns.map((column) => csvCell(column.value(row))).join(',')),
  ];
  return `${BOM}${lines.join(EOL)}${EOL}`;
}
