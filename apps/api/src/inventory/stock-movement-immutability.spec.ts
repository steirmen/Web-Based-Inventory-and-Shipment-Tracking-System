import 'reflect-metadata';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { InventoryController } from './inventory.controller.js';
import { StockMovementsController } from './stock-movements.controller.js';

/**
 * Stock movements are an append-only ledger. These checks keep it that way
 * at the source level: no code path updates or deletes a movement, and no
 * route could be used to do so. (The HTTP-level check is in
 * test/database/stock-operations.db-spec.ts.)
 */

const SRC = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

const FORBIDDEN = [
  /stockMovement\s*\.\s*(update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\b/,
  /UPDATE\s+"?stock_movements"?/i,
  /DELETE\s+FROM\s+"?stock_movements"?/i,
  /TRUNCATE[^;]*stock_movements/i,
];

function routes(controller: new (...args: never[]) => unknown) {
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => {
      const handler = prototype[name] as object;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string;
      return `${RequestMethod[method]} ${path}`;
    });
}

describe('stock movement immutability', () => {
  it('no application code updates or deletes stock movements', () => {
    const files = sourceFiles(SRC);
    expect(files.map((file) => relative(SRC, file).replaceAll('\\', '/'))).toContain(
      'inventory/stock-operations.service.ts',
    );

    const offenders = files.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return FORBIDDEN.filter((pattern) => pattern.test(text)).map(
        (pattern) => `${relative(SRC, file)}: ${pattern}`,
      );
    });

    expect(offenders).toEqual([]);
  });

  it('the ledger routes are read-only', () => {
    expect(routes(StockMovementsController)).toEqual(['GET /']);
  });

  it('inventory routes only read, or run a stock operation (which appends movements)', () => {
    expect(routes(InventoryController).sort()).toEqual([
      'GET /',
      'GET :inventoryId',
      'GET :inventoryId/movements',
      'POST adjust',
      'POST damage',
      'POST issue',
      'POST receive',
      'POST transfer',
    ]);
  });
});
