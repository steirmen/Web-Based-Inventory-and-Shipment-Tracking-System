import { AUTH_LIMITS, type LoginRequest, type RegisterRequest } from '@app/shared';
import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { normalizeEmail } from '../email.js';

const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toNormalizedEmail = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? normalizeEmail(value) : value;

// Passwords are deliberately NOT transformed: they are used exactly as entered.

export class RegisterDto implements RegisterRequest {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Name is required.' })
  @MaxLength(AUTH_LIMITS.nameMaxLength, {
    message: `Name must be at most ${AUTH_LIMITS.nameMaxLength} characters.`,
  })
  name: string;

  @Transform(toNormalizedEmail)
  @IsString()
  @IsNotEmpty({ message: 'Email is required.' })
  @MaxLength(AUTH_LIMITS.emailMaxLength, {
    message: `Email must be at most ${AUTH_LIMITS.emailMaxLength} characters.`,
  })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email: string;

  @IsString()
  @MinLength(AUTH_LIMITS.passwordMinLength, {
    message: `Password must be at least ${AUTH_LIMITS.passwordMinLength} characters.`,
  })
  @MaxLength(AUTH_LIMITS.passwordMaxLength, {
    message: `Password must be at most ${AUTH_LIMITS.passwordMaxLength} characters.`,
  })
  password: string;
}

/** Shape-only validation: never hints at whether an account exists. */
export class LoginDto implements LoginRequest {
  @Transform(toNormalizedEmail)
  @IsString()
  @IsNotEmpty({ message: 'Email is required.' })
  @MaxLength(AUTH_LIMITS.emailMaxLength, {
    message: `Email must be at most ${AUTH_LIMITS.emailMaxLength} characters.`,
  })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required.' })
  @MaxLength(AUTH_LIMITS.passwordMaxLength, {
    message: `Password must be at most ${AUTH_LIMITS.passwordMaxLength} characters.`,
  })
  password: string;
}
