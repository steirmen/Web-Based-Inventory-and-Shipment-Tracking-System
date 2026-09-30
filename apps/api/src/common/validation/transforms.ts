import type { TransformFnParams } from 'class-transformer';

/** Trims and collapses internal whitespace ("  Office   Supplies " → "Office Supplies"). */
export const toNormalizedName = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

/** Trims; a blank string becomes null (optional free text). */
export const toOptionalText = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export const toTrimmed = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Trims and upper-cases (codes such as "main " → "MAIN"). */
export const toUpperCode = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
