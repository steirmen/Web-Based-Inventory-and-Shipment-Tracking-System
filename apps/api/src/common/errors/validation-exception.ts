import type { ApiFieldError } from '@app/shared';
import { HttpStatus, type ValidationError } from '@nestjs/common';
import { AppException } from './app-exception.js';

/** `ValidationPipe` exception factory: one VALIDATION_ERROR with per-field messages (never values). */
export function createValidationException(errors: ValidationError[]): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    'VALIDATION_ERROR',
    'The request contains invalid fields.',
    flatten(errors),
  );
}

function flatten(errors: ValidationError[], parentPath = ''): ApiFieldError[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, messages: Object.values(error.constraints) }] : [];
    return [...own, ...flatten(error.children ?? [], field)];
  });
}
