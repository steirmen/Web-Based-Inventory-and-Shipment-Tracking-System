# Report exports (CSV and Excel)

Phase 10.1. The three reports (Sales, Orders, Inventory) download as **Excel (.xlsx)** or **CSV**. Both come from the same server-side query as the report on screen. See [dashboard-reporting.md](dashboard-reporting.md#reports) for the report definitions themselves.

## Why there is an Excel export (root cause)

The CSV export has always been valid RFC 4180: comma-separated, quoted where needed, UTF-8 with a BOM, and CRLF line endings. Opening it by double-click in Excel still put every row into column A on the development machine.

The machine runs Windows with the **Turkish regional format**, where the list separator is `;` and the decimal separator is `,`. Excel splits a `.csv` file by the regional list separator and ignores the file's own commas, so the rows land in one column and the quotes are consumed. This was confirmed with real Excel through COM automation, including with `Local=false`.

No single CSV opens correctly by double-click in every locale:

- a `;` separator breaks English-locale Excel;
- a `sep=` hint line breaks other tools and the BOM.

So the CSV stays standard, and an `.xlsx` workbook was added. A workbook carries typed cells and has no separators, so it opens identically in every Excel locale.

## API

`GET /organizations/:id/reports/{sales|orders|inventory}/export`

- Permission: `REPORTS_EXPORT` (all roles). The route has the same guard and tenant isolation as the report itself.
- It takes the report's query: the same filters, `sortBy`/`sortOrder`, period, `timeZone`, and (sales, orders) `currency`. There is no paging.
- `format=xlsx|csv`. The default is `csv`, for backwards compatibility.
- `lang=en|tr` (default `en`) selects the language of the **generated words only**: the sheet name, column headers, status labels, Active/Archived, and the filename. Names, SKUs, company names, and other user data are exported exactly as entered, never translated.
- The export is capped at `REPORT_LIMITS.exportMaxRows` (10,000). Larger exports get `422 REPORT_EXPORT_TOO_LARGE`. Invalid `format`/`lang` values get `400 VALIDATION_ERROR`.
- Responses:
  - `Content-Type` is `text/csv; charset=utf-8` or `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
  - `Content-Disposition: attachment` with an **ASCII** filename, for example `sales-report_2025-09-01_2025-09-30_TRY.xlsx`, or in Turkish `satis-raporu_…`, `siparis-raporu_…`, `envanter-raporu_…`;
  - `X-Content-Type-Options: nosniff`.
- Binary bodies are sent with Nest's `StreamableFile`. A plain `Buffer` would be serialized as JSON.

## One table, two writers

Each report builds one `ExportTable` (`src/reports/export/export-table.ts`): typed columns plus rows. `renderExport(table, format)` writes it with one of two writers. Columns have a kind:

| Kind       | XLSX cell                                                            | CSV cell                                                           |
| ---------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `text`     | inline string                                                        | quoted when needed; formula-like values neutralized                |
| `integer`  | number, `#,##0`                                                      | digits                                                             |
| `money`    | number with the row's currency format: `"₺"#,##0.00`, `"€"…`, `"$"…` | the decimal string (`1250.50`) plus a separate **Currency** column |
| `datetime` | Excel date serial in the report's time zone, `yyyy-mm-dd hh:mm`      | `YYYY-MM-DD HH:mm` in that time zone (the header names the zone)   |

Money never passes through a float on its way to the file. In XLSX the decimal string is written as the cell value, so Excel parses the exact text. Amounts in different currencies are never summed.

### XLSX writer (`xlsx.ts`, `zip.ts`)

It is written without a dependency, server-side only, and nothing is added to the browser bundle:

- a minimal ZIP writer using `node:zlib` `deflateRawSync`, CRC-32, and a fixed timestamp, so the same data gives the same bytes;
- SpreadsheetML parts: workbook, one worksheet named Sales/Orders/Inventory (or Satışlar/Siparişler/Envanter), styles, content types, and relationships;
- a frozen bold header row, autofilter (`_xlnm._FilterDatabase`), and column widths from the content;
- text as inline strings, XML-escaped, with characters that are illegal in XML 1.0 removed. Excel never evaluates inline strings, so `=HYPERLINK(...)` stays text.

### CSV writer (`src/reports/csv.ts`, unchanged rules)

RFC 4180 quoting, UTF-8 BOM, and CRLF. **Formula-injection protection** is kept: a cell starting with `=`, `+`, `-`, `@`, tab, or CR, even after leading spaces, is prefixed with `'`. Money and numbers are written as plain numbers. A negative amount is a number, not a formula, so it is not prefixed.

## Web

`ExportButton` (`components/reports/report-parts.tsx`) is a menu offering **Excel (.xlsx)** and **CSV (.csv)**. The page calls `exporter.mutate({ query, format, lang })`, where `lang` is the current interface language. The download goes through `apiDownload()` and `saveFile()`; the server's filename is used. The sales report exports the currency it is showing, so the file holds exactly the rows on screen.

## Tests

- `src/reports/export/export.spec.ts` (unit):
  - a ZIP/XML round trip;
  - typed cells and currency formats;
  - commas, quotes, line breaks, Turkish characters (`İıŞşĞğÜüÖöÇç`), apostrophes, negatives, decimals, and currency symbols;
  - XML-illegal characters;
  - formula-like text.
- `test/database/reports-api.db-spec.ts` (real PostgreSQL):
  - every report in both formats and both languages;
  - the CSV parsed back (`test/support/parse-csv.ts`) and the XLSX read back (`test/support/read-xlsx.ts`), which must agree with the JSON report;
  - permissions, tenant isolation, the row cap, invalid `format`/`lang`, and a mixed-currency workspace.
- Web: `pages/reports/reports-pages.test.tsx` checks the menu, the formats, `lang`, and the filename.
- E2E: `e2e/tests/exports.spec.ts` downloads both formats in a real browser and parses them.
