import type { ApiErrorBody, ApiErrorCode } from '@app/shared';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppException } from './app-exception.js';

/**
 * Generic responses for errors that are not `AppException`s (framework errors,
 * body-parser errors, `new NotFoundException()`, ...). Their original messages
 * are never forwarded: some (e.g. JSON parse errors) quote the request body.
 * Throw `AppException` to send a specific client-facing message.
 */
const GENERIC_BY_STATUS: Partial<Record<number, [ApiErrorCode, string]>> = {
  [HttpStatus.BAD_REQUEST]: ['BAD_REQUEST', 'The request could not be processed.'],
  [HttpStatus.UNAUTHORIZED]: ['AUTH_UNAUTHENTICATED', 'Authentication required.'],
  [HttpStatus.FORBIDDEN]: ['FORBIDDEN', 'You do not have access to this resource.'],
  [HttpStatus.NOT_FOUND]: ['NOT_FOUND', 'The requested resource was not found.'],
  [HttpStatus.CONFLICT]: ['CONFLICT', 'The request conflicts with the current state.'],
  [HttpStatus.TOO_MANY_REQUESTS]: [
    'RATE_LIMITED',
    'Too many requests. Please wait a moment and try again.',
  ],
};

function genericBody(statusCode: number): ApiErrorBody {
  const [code, message] =
    GENERIC_BY_STATUS[statusCode] ?? GENERIC_BY_STATUS[HttpStatus.BAD_REQUEST]!;
  return { statusCode, code, message };
}

const INTERNAL_ERROR: ApiErrorBody = {
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  code: 'INTERNAL_ERROR',
  message: 'An unexpected error occurred.',
};

/**
 * Converts every error into the `ApiErrorBody` shape. Unexpected errors are
 * logged server-side and returned as a generic 500: no stack traces, database
 * errors, or internal messages reach the client.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const body = this.toBody(exception);

    if (body.statusCode >= 500) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
      );
    }

    host.switchToHttp().getResponse<Response>().status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof AppException) {
      return exception.toBody();
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : // Errors raised outside Nest's own exception types (e.g. by middleware).
          (exception as { status?: unknown } | null)?.status;

    if (typeof status === 'number' && status >= 400 && status < 500) {
      return genericBody(status);
    }

    return INTERNAL_ERROR;
  }
}
