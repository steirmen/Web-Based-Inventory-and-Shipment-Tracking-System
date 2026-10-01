import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors/app-exception.js';

/** Client-facing customer errors. */

/** Unknown, malformed, and other organizations' customer ids all answer the same 404. */
export const customerNotFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'CUSTOMER_NOT_FOUND', 'Customer not found.');

export const customerStatusInvalid = () =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    'CUSTOMER_STATUS_INVALID',
    'Customer status cannot be changed here. Use archive or restore instead.',
  );
