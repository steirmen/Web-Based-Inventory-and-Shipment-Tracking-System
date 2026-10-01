import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv.js';

/** A minimal RFC 4180 parser, to prove the output round-trips. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const body = text.replace(/^﻿/, '');
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]!;
    if (quoted) {
      if (char === '"' && body[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\r' && body[index + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      index += 1;
    } else {
      cell += char;
    }
  }
  return rows;
}

describe('csvCell', () => {
  it.each([
    ['plain', 'plain'],
    ['a,b', '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['line\nbreak', '"line\nbreak"'],
    ['crlf\r\nbreak', '"crlf\r\nbreak"'],
    [' padded ', '" padded "'],
    ['', ''],
  ])('escapes %j', (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });

  it.each([
    ['=SUM(A1:A9)', "'=SUM(A1:A9)"],
    ['+1+1', "'+1+1"],
    ['-2+3', "'-2+3"],
    ['@cmd', "'@cmd"],
    ['\tTab', "'\tTab"],
    ['=HYPERLINK("http://x","y")', '"\'=HYPERLINK(""http://x"",""y"")"'],
    ['=1,2', '"\'=1,2"'],
  ])('neutralizes the formula %j', (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });

  it('neutralizes formulas hidden behind leading spaces, but not plain text', () => {
    expect(csvCell('  =HYPERLINK("http://evil.test")')).toBe(
      '"\'  =HYPERLINK(""http://evil.test"")"',
    );
    expect(csvCell(' @SUM(A1)')).toBe("' @SUM(A1)");
    expect(csvCell(' plain text')).toBe('" plain text"');
  });

  it('keeps numbers and decimal strings numeric', () => {
    expect(csvCell(42)).toBe('42');
    expect(csvCell('-12.50')).toBe('-12.50');
    expect(csvCell('1234.00')).toBe('1234.00');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});

describe('toCsv', () => {
  const columns = [
    { header: 'Name', value: (row: { name: string; amount: string }) => row.name },
    { header: 'Amount', value: (row: { name: string; amount: string }) => row.amount },
  ];

  it('writes a BOM, a header row, CRLF line endings, and rows in order', () => {
    const csv = toCsv(columns, [
      { name: 'Çiçek Ltd', amount: '10.00' },
      { name: 'B', amount: '0.50' },
    ]);
    expect(csv).toBe('﻿Name,Amount\r\nÇiçek Ltd,10.00\r\nB,0.50\r\n');
  });

  it('round-trips hostile values through a standard parser', () => {
    const hostile = [
      'a,b',
      'quote " inside',
      'multi\nline',
      '=cmd|" /C calc"!A0',
      '+SUM(1)',
      '-1+2',
      '@SUM(1)',
      '  spaced  ',
    ];
    const csv = toCsv(
      columns,
      hostile.map((name) => ({ name, amount: '1.00' })),
    );

    const parsed = parseCsv(csv);
    expect(parsed[0]).toEqual(['Name', 'Amount']);
    expect(parsed.slice(1).map((row) => row[0])).toEqual([
      'a,b',
      'quote " inside',
      'multi\nline',
      '\'=cmd|" /C calc"!A0',
      "'+SUM(1)",
      "'-1+2",
      "'@SUM(1)",
      '  spaced  ',
    ]);
    expect(parsed.every((row) => row.length === 2)).toBe(true);
    // No cell that a spreadsheet would evaluate.
    expect(parsed.flat().some((cell) => /^[=+\-@]/.test(cell) && !/^-?\d/.test(cell))).toBe(false);
  });

  it('writes only the header for no rows', () => {
    expect(toCsv(columns, [])).toBe('﻿Name,Amount\r\n');
  });
});
