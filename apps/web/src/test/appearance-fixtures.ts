import {
  type AppearanceConfig,
  type AppearanceProfile,
  type AppearanceResponse,
  DEFAULT_APPEARANCE,
} from '@app/shared';
import { screen } from '@testing-library/react';
import { json, mockApi, noOrganizations, signedIn } from './mock-api';
import { renderApp } from './render-app';

export const APPEARANCE_API = '/me/appearance';
export const PROFILES_API = `${APPEARANCE_API}/profiles`;

export const appearance = (overrides: Partial<AppearanceConfig> = {}): AppearanceConfig => ({
  ...DEFAULT_APPEARANCE,
  ...overrides,
});

export const appearanceResponse = (
  config: AppearanceConfig = DEFAULT_APPEARANCE,
  updatedAt: string | null = '2026-10-01T08:00:00.000Z',
): AppearanceResponse => ({ appearance: config, updatedAt });

export function appearanceProfile(overrides: Partial<AppearanceProfile> = {}): AppearanceProfile {
  return {
    id: '0198c0de-0000-7000-8000-0000000000a1',
    name: 'Night work',
    appearance: appearance({ mode: 'dark', theme: 'ocean', backgroundEffect: 'snow' }),
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
    ...overrides,
  };
}

/** The document's applied appearance (what AppearanceProvider wrote to <html>). */
export const applied = () => ({ ...document.documentElement.dataset });
export const appliedVar = (name: string) => document.documentElement.style.getPropertyValue(name);
export const effectLayers = () => document.querySelectorAll('canvas[data-effect]');

/**
 * Renders the Appearance page for a signed-in user whose saved appearance is
 * `saved` (and who has `profiles`). `handlers` add or override API routes.
 */
export async function renderAppearancePage(
  {
    saved = DEFAULT_APPEARANCE,
    profiles = [],
  }: { saved?: AppearanceConfig; profiles?: AppearanceProfile[] } = {},
  handlers: Parameters<typeof mockApi>[0] = {},
) {
  const fetchMock = mockApi({
    'GET /auth/me': signedIn(),
    'GET /organizations': noOrganizations,
    [`GET ${APPEARANCE_API}`]: json(200, appearanceResponse(saved)),
    [`GET ${PROFILES_API}`]: json(200, { profiles }),
    ...handlers,
  });
  const app = renderApp('/settings/appearance');
  await screen.findByRole('heading', { level: 1, name: 'Appearance' });
  return { ...app, fetchMock };
}
