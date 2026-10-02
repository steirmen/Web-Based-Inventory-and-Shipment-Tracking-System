import { DEFAULT_LANGUAGE, type Language, LANGUAGE_LOCALES } from '@app/shared';
import { createContext, useContext } from 'react';
import type { MessageBundle, MessageTree, Translation } from './define';

export interface I18nContextValue {
  /** The interface language right now. */
  language: Language;
  /** Its BCP 47 locale for numbers, dates, and money (`en-US`, `tr-TR`). */
  locale: string;
  /**
   * Switches the language immediately (no reload; route, workspace, and form
   * state stay). Signed in, it is also saved for the user; it is always
   * remembered on this device.
   */
  setLanguage: (language: Language) => void;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

/** Outside a provider (isolated component tests): English, no persistence. */
const FALLBACK: I18nContextValue = {
  language: DEFAULT_LANGUAGE,
  locale: LANGUAGE_LOCALES[DEFAULT_LANGUAGE],
  setLanguage: () => {},
};

/** The current language and the switch (provided by I18nProvider). */
export function useLanguage(): I18nContextValue {
  return useContext(I18nContext) ?? FALLBACK;
}

/** The current language's messages of a bundle; components re-render when the language changes. */
export function useMessages<T extends MessageTree>(bundle: MessageBundle<T>): Translation<T> {
  return bundle[useLanguage().language];
}
