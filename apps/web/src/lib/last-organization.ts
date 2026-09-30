/**
 * Remembers the last opened workspace so "/" can reopen it. UX only: the value
 * is never sent as proof of access, and it is ignored unless the server-provided
 * organization list still contains it.
 */
const STORAGE_KEY = 'app:lastOrganizationId';

export function readLastOrganizationId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function rememberLastOrganizationId(organizationId: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, organizationId);
  } catch {
    // Storage unavailable (private mode, blocked): nothing to remember.
  }
}
