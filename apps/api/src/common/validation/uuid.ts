import type { PipeTransform } from '@nestjs/common';
import type { AppException } from '../errors/app-exception.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a syntactically valid UUID. Check before querying a `uuid` column. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Route-parameter pipe for resource ids. A malformed id is treated exactly like
 * an unknown one (the given 404), so it never reaches the database and never
 * produces a different response.
 */
export class ResourceIdPipe implements PipeTransform<string, string> {
  constructor(private readonly notFound: () => AppException) {}

  transform(value: string): string {
    if (!isUuid(value)) {
      throw this.notFound();
    }
    return value.toLowerCase();
  }
}
