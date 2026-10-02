import type { Currency } from '@app/shared';
import { formatLocalDateTime } from '../../common/time/local-days.js';
import type { ExportColumn, ExportTable } from './export-table.js';
import { zip } from './zip.js';

/**
 * Excel export (Office Open XML SpreadsheetML, ECMA-376): one worksheet with a
 * bold, frozen, filterable header row and TYPED cells, so the file opens as a
 * clean table in every Excel locale (CSV is split by the regional list
 * separator — ";" in Turkish Excel — which is why a comma CSV lands in one
 * column there; see docs/export.md):
 *
 * - text: inline strings, exactly as stored. A workbook cell is never parsed
 *   as a formula, so text needs no apostrophe (unlike CSV);
 * - integers: numbers ("#,##0");
 * - money: numbers with the row's currency format ("₺#,##0.00"), plus a
 *   separate currency-code column in the reports;
 * - dates: Excel date-time serials of the local time in the report's time zone.
 *
 * Generated server-side with the tiny ZIP writer (no spreadsheet library).
 */

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/** Cell styles (indexes into cellXfs below). */
const STYLE = {
  text: 0,
  header: 1,
  integer: 2,
  datetime: 3,
  money: 4,
  TRY: 5,
  EUR: 6,
  USD: 7,
} as const satisfies Record<string, number> & Record<Currency, number>;

/** Number formats: built-in 3 = "#,##0"; custom ids start at 164. Separators follow Excel's locale. */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="5">
<numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd\\ hh:mm"/>
<numFmt numFmtId="165" formatCode="#,##0.00"/>
<numFmt numFmtId="166" formatCode="&quot;₺&quot;#,##0.00"/>
<numFmt numFmtId="167" formatCode="&quot;€&quot;#,##0.00"/>
<numFmt numFmtId="168" formatCode="&quot;$&quot;#,##0.00"/>
</numFmts>
<fonts count="2">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="168" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Characters XML 1.0 forbids (control characters other than tab, LF, CR) are dropped. */
// oxlint-disable-next-line no-control-regex -- removing exactly these characters is the point
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function xmlText(value: string): string {
  return value
    .replace(INVALID_XML, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/** Excel serial date (days since 1899-12-30) of a local wall-clock time "YYYY-MM-DD HH:mm". */
export function excelSerial(local: string): number {
  const millis = Date.parse(`${local.replace(' ', 'T')}:00Z`);
  return millis / 86_400_000 + 25_569;
}

/** Excel sheet names: ≤ 31 characters, none of []:*?/\ */
export function sheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet1';
}

const DECIMAL = /^-?\d+(\.\d+)?$/;

function textCell(ref: string, value: string, style: number = STYLE.text): string {
  const preserve = /^\s|\s$|\n/.test(value) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t${preserve}>${xmlText(value)}</t></is></c>`;
}

function cell<Row>(column: ExportColumn<Row>, row: Row, ref: string, timeZone: string): string {
  switch (column.kind) {
    case 'text': {
      const value = column.value(row);
      return value === null || value === undefined || value === '' ? '' : textCell(ref, value);
    }
    case 'integer':
      return `<c r="${ref}" s="${STYLE.integer}"><v>${column.value(row)}</v></c>`;
    case 'money': {
      const amount = column.value(row);
      if (!DECIMAL.test(amount)) return textCell(ref, amount);
      const currency = column.currency(row);
      // The exact decimal text; Excel reads it as a number.
      return `<c r="${ref}" s="${currency ? STYLE[currency] : STYLE.money}"><v>${amount}</v></c>`;
    }
    case 'datetime': {
      const serial = excelSerial(formatLocalDateTime(new Date(column.value(row)), timeZone));
      return `<c r="${ref}" s="${STYLE.datetime}"><v>${serial}</v></c>`;
    }
  }
}

/** Approximate column widths (characters) from the header and the values, 10…60. */
function widths<Row>(table: ExportTable<Row>): number[] {
  return table.columns.map((column) => {
    let longest = column.header.length;
    if (column.kind === 'datetime') longest = Math.max(longest, 16);
    for (const row of table.rows.slice(0, 500)) {
      const value = column.value(row);
      const length =
        typeof value === 'string'
          ? Math.max(...value.split('\n').map((l) => l.length))
          : String(value ?? '').length;
      longest = Math.max(longest, column.kind === 'money' ? length + 4 : length);
    }
    return Math.min(60, Math.max(10, longest + 2));
  });
}

function worksheet<Row>(table: ExportTable<Row>): string {
  const lastColumn = columnName(table.columns.length - 1);
  const lastRow = table.rows.length + 1;
  const header = table.columns
    .map((column, index) => textCell(`${columnName(index)}1`, column.header, STYLE.header))
    .join('');
  const rows = table.rows.map((row, rowIndex) => {
    const number = rowIndex + 2;
    const cells = table.columns
      .map((column, index) => cell(column, row, `${columnName(index)}${number}`, table.timeZone))
      .join('');
    return `<row r="${number}">${cells}</row>`;
  });
  const cols = widths(table)
    .map(
      (width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:${lastColumn}${lastRow}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData><row r="1">${header}</row>${rows.join('')}</sheetData>
<autoFilter ref="A1:${lastColumn}${lastRow}"/>
</worksheet>`;
}

function workbook<Row>(table: ExportTable<Row>, name: string): string {
  const lastColumn = columnName(table.columns.length - 1);
  const quoted = `'${name.replaceAll("'", "''")}'`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView/></bookViews>
<sheets><sheet name="${xmlText(name)}" sheetId="1" r:id="rId1"/></sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${xmlText(quoted)}!$A$1:$${lastColumn}$${table.rows.length + 1}</definedName></definedNames>
</workbook>`;
}

/** The .xlsx file (a ZIP package) of one export table. */
export function toXlsx<Row>(table: ExportTable<Row>): Buffer {
  const name = sheetName(table.sheetName);
  const part = (text: string) => Buffer.from(text, 'utf8');
  return zip([
    { name: '[Content_Types].xml', data: part(CONTENT_TYPES) },
    { name: '_rels/.rels', data: part(ROOT_RELS) },
    { name: 'xl/workbook.xml', data: part(workbook(table, name)) },
    { name: 'xl/_rels/workbook.xml.rels', data: part(WORKBOOK_RELS) },
    { name: 'xl/styles.xml', data: part(STYLES) },
    { name: 'xl/worksheets/sheet1.xml', data: part(worksheet(table)) },
  ]);
}
