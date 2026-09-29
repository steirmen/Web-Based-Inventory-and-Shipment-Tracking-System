/**
 * Product-level constants. The product name is not final — change it here
 * (and in `index.html`) rather than hardcoding it in components.
 */
export const appConfig = {
  name: 'Nexora',
  tagline: 'Business operations platform',
} as const;

/** Formats a document title for a page, e.g. "System status · Nexora". */
export function pageTitle(title?: string): string {
  return title ? `${title} · ${appConfig.name}` : appConfig.name;
}
