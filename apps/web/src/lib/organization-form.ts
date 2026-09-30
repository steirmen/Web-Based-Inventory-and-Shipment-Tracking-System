import { ORGANIZATION_LIMITS, ORGANIZATION_SLUG_PATTERN, type MemberRole } from '@app/shared';
import type { FieldErrors } from './auth-form';

/** Characters that Unicode decomposition does not reduce to ASCII. */
const SPECIAL_LETTERS: Record<string, string> = {
  ı: 'i',
  ß: 'ss',
  ø: 'o',
  æ: 'ae',
  đ: 'd',
  ł: 'l',
};

/** Suggests a slug from a name ("Şirin Café & Co." → "sirin-cafe-co"). The server validates it. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[ıßøæđł]/g, (letter) => SPECIAL_LETTERS[letter] ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ORGANIZATION_LIMITS.slugMaxLength)
    .replace(/-+$/, '');
}

export function validateOrganizationName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return 'Enter a workspace name.';
  if (name.length > ORGANIZATION_LIMITS.nameMaxLength) {
    return `Use at most ${ORGANIZATION_LIMITS.nameMaxLength} characters.`;
  }
  return undefined;
}

export function validateSlug(slug: string): string | undefined {
  if (!slug) return 'Enter a workspace slug.';
  if (slug.length < ORGANIZATION_LIMITS.slugMinLength) {
    return `Use at least ${ORGANIZATION_LIMITS.slugMinLength} characters.`;
  }
  if (slug.length > ORGANIZATION_LIMITS.slugMaxLength) {
    return `Use at most ${ORGANIZATION_LIMITS.slugMaxLength} characters.`;
  }
  if (!ORGANIZATION_SLUG_PATTERN.test(slug)) {
    return 'Use lowercase letters, numbers, and single hyphens.';
  }
  return undefined;
}

export interface OrganizationValues {
  name: string;
  slug: string;
}

export function validateOrganization(
  values: OrganizationValues,
): FieldErrors<keyof OrganizationValues> {
  return { name: validateOrganizationName(values.name), slug: validateSlug(values.slug) };
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  STAFF: 'Staff',
};

export const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  OWNER: 'Full control of the workspace, including its team and ownership.',
  ADMIN: 'Manages workspace settings, invites staff, and manages staff members.',
  STAFF: 'Can view the workspace and its team.',
};
