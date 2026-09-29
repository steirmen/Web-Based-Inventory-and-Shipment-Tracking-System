import type { ApiErrorBody, ApiErrorCode, ApiFieldError } from '@app/shared';
import { HttpException, type HttpStatus } from '@nestjs/common';

/** An HTTP error with a stable machine-readable `code` (see `ApiErrorCode`). */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: ApiFieldError[],
  ) {
    super(message, status);
  }

  toBody(): ApiErrorBody {
    return {
      statusCode: this.getStatus(),
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}
