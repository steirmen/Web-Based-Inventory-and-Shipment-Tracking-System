import type { Language } from '@app/shared';

/**
 * Typed translations (docs/localization.md). A bundle holds the English
 * messages and their Turkish translation with EXACTLY the same shape: a
 * missing key, an extra key, or a different parameter list is a type error.
 *
 * - A message is a string, or a function of named parameters for text with
 *   values in it: `({ count }: { count: number }) => \`${count} items\``.
 * - Keys are stable and grouped by feature (`products.title`, `common.cancel`);
 *   components read them as `m.products.title`, never with `if (language === …)`.
 * - Bundles live next to their feature (`i18n/messages/*.ts`), so a lazy page
 *   carries its own texts and the entry bundle only the shared ones.
 */

type Message = string | ((params: never) => string);

export type Translation<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends (params: infer P) => string
      ? (params: P) => string
      : T[K] extends (...args: never[]) => string
        ? T[K]
        : T[K] extends object
          ? Translation<T[K]>
          : never;
};

export type MessageTree = { readonly [key: string]: Message | MessageTree };

export type MessageBundle<T extends MessageTree> = Record<Language, Translation<T>>;

/** A bundle: the English messages (the source of the keys) and their Turkish translation. */
export function defineMessages<T extends MessageTree>(en: T, tr: Translation<T>): MessageBundle<T> {
  return { en: en as unknown as Translation<T>, tr };
}
