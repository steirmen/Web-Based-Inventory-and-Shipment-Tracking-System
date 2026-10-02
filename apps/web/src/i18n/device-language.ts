import { isLanguage, type Language } from '@app/shared';

/**
 * The language last used on this device (localStorage), for the sign-in pages
 * and the first paint. Presentation only: the language code and nothing else
 * — no user, session, or token data. A signed-in user's saved language
 * (`user.language`) takes precedence; see docs/localization.md.
 */
export const LANGUAGE_STORAGE_KEY = 'app:language';

export function readDeviceLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeDeviceLanguage(language: Language): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Optional: the choice then lasts until the page is reloaded.
  }
}
