import {
  AUTH_LIMITS,
  type CreateInvitationRequest,
  type CreateOrganizationRequest,
  MEMBER_ROLES,
  type MemberRole,
  ORGANIZATION_LIMITS,
  ORGANIZATION_SLUG_PATTERN,
  type TransferOwnershipRequest,
  type UpdateMemberRoleRequest,
  type UpdateOrganizationRequest,
} from '@app/shared';
import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeEmail } from '../../auth/email.js';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toNormalizedEmail = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? normalizeEmail(value) : value;

const NAME_RULES = [
  Transform(trim),
  IsString(),
  IsNotEmpty({ message: 'Name is required.' }),
  MaxLength(ORGANIZATION_LIMITS.nameMaxLength, {
    message: `Name must be at most ${ORGANIZATION_LIMITS.nameMaxLength} characters.`,
  }),
];

function applyAll(decorators: PropertyDecorator[]): PropertyDecorator {
  return (target, key) => decorators.forEach((decorator) => decorator(target, key));
}

export class CreateOrganizationDto implements CreateOrganizationRequest {
  @applyAll(NAME_RULES)
  name: string;

  /** Validated as sent (only trimmed) — never silently lowercased. Immutable after creation. */
  @Transform(trim)
  @IsString()
  @MinLength(ORGANIZATION_LIMITS.slugMinLength, {
    message: `Slug must be at least ${ORGANIZATION_LIMITS.slugMinLength} characters.`,
  })
  @MaxLength(ORGANIZATION_LIMITS.slugMaxLength, {
    message: `Slug must be at most ${ORGANIZATION_LIMITS.slugMaxLength} characters.`,
  })
  @Matches(ORGANIZATION_SLUG_PATTERN, {
    message: 'Use lowercase letters, numbers, and single hyphens.',
  })
  slug: string;
}

/** Only `name` is updatable; any other field (e.g. `slug`) is rejected by the ValidationPipe. */
export class UpdateOrganizationDto implements UpdateOrganizationRequest {
  @applyAll(NAME_RULES)
  name: string;
}

export class UpdateMemberRoleDto implements UpdateMemberRoleRequest {
  @IsIn(MEMBER_ROLES, { message: 'Role must be OWNER, ADMIN, or STAFF.' })
  role: MemberRole;
}

export class TransferOwnershipDto implements TransferOwnershipRequest {
  @IsUUID('all', { message: 'targetMemberId must be a member id.' })
  targetMemberId: string;
}

export class CreateInvitationDto implements CreateInvitationRequest {
  @Transform(toNormalizedEmail)
  @IsString()
  @IsNotEmpty({ message: 'Email is required.' })
  @MaxLength(AUTH_LIMITS.emailMaxLength, {
    message: `Email must be at most ${AUTH_LIMITS.emailMaxLength} characters.`,
  })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email: string;

  @IsIn(MEMBER_ROLES, { message: 'Role must be OWNER, ADMIN, or STAFF.' })
  role: MemberRole;
}
