import { inflateRawSync } from 'node:zlib';

/**
 * Test helper: reads an .xlsx produced by the export back into cells, so tests
 * check the workbook itself (ZIP structure, XML, cell types, number formats),
 * not the code that wrote it. Supports what the exporter writes: one sheet,
 * inline strings, numbers, and the styles' number formats.
 */

export interface XlsxCell {
  /** The text of a string cell, or the raw number text of a numeric cell. */
  value: string;
  type: 'string' | 'number';
  /** The cell's number format code ('General' for none). */
  format: string;
}

export interface XlsxWorkbook {
  sheetName: string;
  /** Rows of cells (empty cells as null), in order. */
  rows: (XlsxCell | null)[][];
  /** The ZIP entry names. */
  entries: string[];
  /** Frozen header row and autofilter range, if any. */
  frozenRows: number;
  autoFilter: string | null;
}

function unzip(file: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  const end = file.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('Not a ZIP file: no end of central directory.');
  const count = file.readUInt16LE(end + 10);
  let offset = file.readUInt32LE(end + 16);
  for (let index = 0; index < count; index += 1) {
    if (file.readUInt32LE(offset) !== 0x02014b50) throw new Error('Bad central directory entry.');
    const method = file.readUInt16LE(offset + 10);
    const compressedSize = file.readUInt32LE(offset + 20);
    const nameLength = file.readUInt16LE(offset + 28);
    const extraLength = file.readUInt16LE(offset + 30);
    const commentLength = file.readUInt16LE(offset + 32);
    const localOffset = file.readUInt32LE(offset + 42);
    const name = file.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const localNameLength = file.readUInt16LE(localOffset + 26);
    const localExtraLength = file.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = file.subarray(start, start + compressedSize);
    entries.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const unescape = (text: string) =>
  text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');

const BUILT_IN_FORMATS: Record<string, string> = { '0': 'General', '1': '0', '3': '#,##0' };

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)![0];
  return [...letters].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

export function readXlsx(file: Buffer): XlsxWorkbook {
  const parts = unzip(file);
  const text = (name: string) => {
    const part = parts.get(name);
    if (!part) throw new Error(`Missing part ${name}`);
    return part.toString('utf8');
  };
  const workbook = text('xl/workbook.xml');
  const styles = text('xl/styles.xml');
  const sheet = text('xl/worksheets/sheet1.xml');

  const formats = new Map(
    [...styles.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"\/>/g)].map((m) => [
      m[1]!,
      unescape(m[2]!),
    ]),
  );
  const cellXfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)![1]!;
  const styleFormats = [...cellXfs.matchAll(/<xf numFmtId="(\d+)"/g)].map(
    (m) => formats.get(m[1]!) ?? BUILT_IN_FORMATS[m[1]!] ?? `builtin:${m[1]}`,
  );

  const rows: (XlsxCell | null)[][] = [];
  for (const row of sheet.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: (XlsxCell | null)[] = [];
    for (const cell of row[2]!.matchAll(
      /<c r="([A-Z]+\d+)" s="(\d+)"( t="inlineStr")?>([\s\S]*?)<\/c>/g,
    )) {
      const index = columnIndex(cell[1]!);
      while (cells.length < index) cells.push(null);
      const format = styleFormats[Number(cell[2])] ?? 'General';
      if (cell[3]) {
        const value = /<t(?: xml:space="preserve")?>([\s\S]*?)<\/t>/.exec(cell[4]!)![1]!;
        cells.push({ value: unescape(value), type: 'string', format });
      } else {
        cells.push({ value: /<v>([^<]*)<\/v>/.exec(cell[4]!)![1]!, type: 'number', format });
      }
    }
    rows[Number(row[1]) - 1] = cells;
  }

  const pane = /<pane ySplit="(\d+)"[^>]*state="frozen"/.exec(sheet);
  return {
    sheetName: unescape(/<sheet name="([^"]*)"/.exec(workbook)![1]!),
    rows,
    entries: [...parts.keys()],
    frozenRows: pane ? Number(pane[1]) : 0,
    autoFilter: /<autoFilter ref="([^"]+)"/.exec(sheet)?.[1] ?? null,
  };
}

/** The values of a workbook as text rows ('' for empty cells), for compact assertions. */
export function xlsxValues(workbook: XlsxWorkbook): string[][] {
  const width = Math.max(...workbook.rows.map((row) => row.length));
  return workbook.rows.map((row) =>
    Array.from({ length: width }, (_, index) => row[index]?.value ?? ''),
  );
}
