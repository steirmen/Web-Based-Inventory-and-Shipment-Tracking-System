import { ORGANIZATION_LIMITS, ORGANIZATION_SLUG_PATTERN } from '@app/shared';
import type { Translation } from '@/i18n/define';
import type { workspace } from '@/i18n/messages/workspace';
import type { FieldErrors } from './auth-form';

type ValidationMessages = Translation<(typeof workspace)['en']>['validation'];

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

export function validateOrganizationName(value: string, m: ValidationMessages): string | undefined {
  const name = value.trim();
  if (!name) return m.nameRequired;
  if (name.length > ORGANIZATION_LIMITS.nameMaxLength) return m.nameTooLong;
  return undefined;
}

export function validateSlug(slug: string, m: ValidationMessages): string | undefined {
  if (!slug) return m.slugRequired;
  if (slug.length < ORGANIZATION_LIMITS.slugMinLength) return m.slugTooShort;
  if (slug.length > ORGANIZATION_LIMITS.slugMaxLength) return m.slugTooLong;
  if (!ORGANIZATION_SLUG_PATTERN.test(slug)) return m.slugPattern;
  return undefined;
}

export interface OrganizationValues {
  name: string;
  slug: string;
}

export function validateOrganization(
  values: OrganizationValues,
  m: ValidationMessages,
): FieldErrors<keyof OrganizationValues> {
  return { name: validateOrganizationName(values.name, m), slug: validateSlug(values.slug, m) };
}
