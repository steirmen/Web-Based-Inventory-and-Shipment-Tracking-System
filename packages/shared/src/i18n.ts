/**
 * Interface languages (Phase 10.1). The API stays language-independent: it
 * returns stable codes (error codes, enum values) that the web app translates.
 * Only report exports take a `lang` parameter, for their UI-generated labels.
 * See docs/localization.md.
 */

/** Stored in `users.language` (CHECK constraint): a new id needs a migration. */
export const LANGUAGES = ['en', 'tr'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Used when neither the user nor this device has chosen a language. */
export const DEFAULT_LANGUAGE: Language = 'en';

/** The BCP 47 locale used for numbers, dates, and money in each language. */
export const LANGUAGE_LOCALES: Record<Language, string> = {
  en: 'en-US',
  tr: 'tr-TR',
};

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

/** `PATCH /me/preferences` body: only the signed-in user's own interface language. */
export interface UpdatePreferencesRequest {
  language: Language;
}

export interface PreferencesResponse {
  /** null until the user chooses one (the device language is used meanwhile). */
  language: Language | null;
}
