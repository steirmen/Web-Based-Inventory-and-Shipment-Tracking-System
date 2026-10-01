import { APPEARANCE_LIMITS } from '@app/shared';
import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors/app-exception.js';

/** Unknown, malformed, and other users' profile ids all answer the same 404. */
export const appearanceProfileNotFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'APPEARANCE_PROFILE_NOT_FOUND',
    'Appearance profile not found.',
  );

export const appearanceProfileNameTaken = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'APPEARANCE_PROFILE_NAME_TAKEN',
    'You already have a profile with this name.',
  );

export const appearanceProfileLimit = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'APPEARANCE_PROFILE_LIMIT',
    `You can save up to ${APPEARANCE_LIMITS.profilesMax} profiles. Delete one to save another.`,
  );
