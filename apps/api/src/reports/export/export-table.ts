import type { Currency, ExportFormat } from '@app/shared';
import { formatLocalDateTime } from '../../common/time/local-days.js';
import { type CsvColumn, toCsv } from '../csv.js';
import { toXlsx } from './xlsx.js';

/**
 * One export, independent of the file format: the same columns, rows, and
 * order become a CSV file or an Excel workbook, so both always match.
 * Headers are already translated (export-labels.ts); values are the report's
 * own data (user-entered text is never translated).
 */

export type ExportCell = string | number | null | undefined;

interface ColumnBase {
  header: string;
}

export type ExportColumn<Row> = ColumnBase &
  (
    | { kind: 'text'; value: (row: Row) => string | null | undefined }
    | { kind: 'integer'; value: (row: Row) => number }
    /** Decimal string ("1250.50"), shown in `currency` (Excel: a number with that currency's format). */
    | { kind: 'money'; value: (row: Row) => string; currency: (row: Row) => Currency | null }
    /** An instant (ISO 8601), written as the local date and time in the table's time zone. */
    | { kind: 'datetime'; value: (row: Row) => string }
  );

export interface ExportTable<Row> {
  /** File name without the extension (ASCII). */
  filename: string;
  /** Worksheet name (Excel: at most 31 characters, no `[]:*?/\`). */
  sheetName: string;
  /** IANA time zone of `datetime` columns. */
  timeZone: string;
  columns: ExportColumn<Row>[];
  rows: Row[];
}

export interface ExportFile {
  filename: string;
  contentType: string;
  body: string | Buffer;
}

/** CSV text of one cell value (dates as local "YYYY-MM-DD HH:mm", money as the decimal string). */
function csvValue<Row>(column: ExportColumn<Row>, row: Row, timeZone: string): ExportCell {
  if (column.kind === 'datetime') return formatLocalDateTime(new Date(column.value(row)), timeZone);
  return column.value(row);
}

export function renderExport<Row>(table: ExportTable<Row>, format: ExportFormat): ExportFile {
  if (format === 'xlsx') {
    return {
      filename: `${table.filename}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: toXlsx(table),
    };
  }
  const columns: CsvColumn<Row>[] = table.columns.map((column) => ({
    header: column.header,
    value: (row) => csvValue(column, row, table.timeZone),
  }));
  return {
    filename: `${table.filename}.csv`,
    contentType: 'text/csv; charset=utf-8',
    body: toCsv(columns, table.rows),
  };
}
