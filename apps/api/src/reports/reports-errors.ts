import { REPORT_LIMITS } from '@app/shared';
import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors/app-exception.js';

/** A filter names a record that is unknown in this organization (or belongs to another one). */
export const reportFilterNotFound = (field: string) =>
  new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'REPORT_FILTER_NOT_FOUND',
    'A filter refers to something that does not exist in this workspace.',
    [{ field, messages: [`${field} does not exist in this workspace.`] }],
  );

export const reportExportTooLarge = (rows: number) =>
  new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'REPORT_EXPORT_TOO_LARGE',
    `This export would contain ${rows.toLocaleString('en-US')} rows; the maximum is ${REPORT_LIMITS.exportMaxRows.toLocaleString('en-US')}. Narrow the filters (for example a shorter date range) and export again.`,
  );
