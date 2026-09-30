import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors/app-exception.js';

/**
 * Client-facing organization, membership, and invitation errors. Messages are
 * deliberately generic where detail could leak whether something exists.
 */

/** Used for unknown organizations AND organizations the user is not a member of. */
export const organizationNotFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'ORGANIZATION_NOT_FOUND',
    "Workspace not found or you don't have access to it.",
  );

export const organizationForbidden = () =>
  new AppException(
    HttpStatus.FORBIDDEN,
    'ORGANIZATION_FORBIDDEN',
    "You don't have permission to perform this action.",
  );

export const organizationSlugTaken = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'ORGANIZATION_SLUG_TAKEN',
    'This workspace URL is already taken. Choose another slug.',
  );

export const membershipNotFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'MEMBERSHIP_NOT_FOUND', 'Member not found.');

export const membershipAlreadyExists = (
  message = 'This person is already a member of the workspace.',
) => new AppException(HttpStatus.CONFLICT, 'MEMBERSHIP_ALREADY_EXISTS', message);

export const memberRoleChangeForbidden = (message = "You can't assign this role to this member.") =>
  new AppException(HttpStatus.FORBIDDEN, 'MEMBER_ROLE_CHANGE_FORBIDDEN', message);

export const memberRemovalForbidden = () =>
  new AppException(
    HttpStatus.FORBIDDEN,
    'MEMBER_REMOVAL_FORBIDDEN',
    "You can't remove this member.",
  );

export const ownerTransferRequired = () =>
  new AppException(
    HttpStatus.FORBIDDEN,
    'OWNER_TRANSFER_REQUIRED',
    "The owner can't be removed or change role. Transfer ownership first.",
  );

export const concurrentModification = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'CONFLICT',
    'This member was changed by someone else. Reload and try again.',
  );

export const invitationNotFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    'INVITATION_NOT_FOUND',
    'This invitation link is invalid.',
  );

export const invitationExpired = () =>
  new AppException(
    HttpStatus.GONE,
    'INVITATION_EXPIRED',
    'This invitation has expired. Ask for a new one.',
  );

export const invitationRevoked = () =>
  new AppException(HttpStatus.GONE, 'INVITATION_REVOKED', 'This invitation is no longer valid.');

export const invitationAlreadyAccepted = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'INVITATION_ALREADY_ACCEPTED',
    'This invitation has already been used.',
  );

export const invitationAlreadyPending = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'INVITATION_ALREADY_PENDING',
    'An invitation for this email address is already pending. Revoke it to send a new one.',
  );

export const invitationEmailMismatch = () =>
  new AppException(
    HttpStatus.FORBIDDEN,
    'INVITATION_EMAIL_MISMATCH',
    'This invitation was sent to another email address.',
  );

export const invitationRoleForbidden = (message = "You can't invite members with this role.") =>
  new AppException(HttpStatus.FORBIDDEN, 'INVITATION_ROLE_FORBIDDEN', message);

export const alreadyOwner = () =>
  new AppException(HttpStatus.CONFLICT, 'CONFLICT', 'This member is already the owner.');
