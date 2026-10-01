import type { AuthUser, Organization } from '@app/shared';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { APPEARANCE_CACHE_KEY } from '@/lib/appearance/apply';
import {
  APPEARANCE_API,
  appearance,
  appearanceResponse,
  applied,
  appliedVar,
  effectLayers,
} from '@/test/appearance-fixtures';
import {
  json,
  mockApi,
  noContent,
  noOrganizations,
  organizationDetail,
  organizationList,
  organizationSummary,
  signedIn,
  signedOut,
  testOrganization,
  testUser,
} from '@/test/mock-api';
import { renderApp } from '@/test/render-app';
import { signOutFromMenu } from '@/test/shell';

const appearanceCalls = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.filter(([input]) => new URL(String(input)).pathname === APPEARANCE_API);

const cached = () =>
  JSON.parse(localStorage.getItem(APPEARANCE_CACHE_KEY) ?? 'null') as {
    vars: Record<string, string>;
    data: Record<string, string>;
  } | null;

describe('AppearanceProvider', () => {
  it('shows guests the default appearance and forgets a cached one', async () => {
    localStorage.setItem(
      APPEARANCE_CACHE_KEY,
      JSON.stringify({ vars: {}, data: { mode: 'dark' } }),
    );
    const fetchMock = mockApi({ 'GET /auth/me': signedOut });
    renderApp('/login');

    await screen.findByRole('heading', { name: /sign in/i });
    expect(applied()).toMatchObject({ mode: 'light', theme: 'default' });
    expect(localStorage.getItem(APPEARANCE_CACHE_KEY)).toBeNull();
    expect(effectLayers()).toHaveLength(0);
    expect(appearanceCalls(fetchMock)).toHaveLength(0);
  });

  it('applies and caches the signed-in user’s saved appearance', async () => {
    mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': noOrganizations,
      [`GET ${APPEARANCE_API}`]: json(
        200,
        appearanceResponse(
          appearance({ mode: 'dark', theme: 'lavender', backgroundEffect: 'rain' }),
        ),
      ),
    });
    renderApp('/');

    await waitFor(() => expect(applied()).toMatchObject({ mode: 'dark', theme: 'lavender' }));
    expect(effectLayers()).toHaveLength(1);
    const cache = cached();
    expect(cache?.data).toMatchObject({ mode: 'dark', theme: 'lavender' });
    expect(cache?.vars['--primary']).toBe(appliedVar('--primary'));
    // Presentation only: nothing about the user is cached.
    const raw = localStorage.getItem(APPEARANCE_CACHE_KEY)!;
    expect(raw).not.toContain(testUser.id);
    expect(raw).not.toContain(testUser.email);
  });

  it('keeps the same appearance across workspaces (user-level, loaded once)', async () => {
    const second: Organization = {
      ...testOrganization,
      id: '0198c0de-0000-7000-8000-00000000000b',
      name: 'Second Co.',
      slug: 'second-co',
    };
    const fetchMock = mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': organizationList([
        organizationSummary(),
        organizationSummary({ id: second.id, name: second.name, slug: second.slug }),
      ]),
      [`GET /organizations/${testOrganization.id}`]: organizationDetail('OWNER'),
      [`GET /organizations/${second.id}`]: organizationDetail('STAFF', second),
      [`GET ${APPEARANCE_API}`]: json(200, appearanceResponse(appearance({ theme: 'forest' }))),
    });
    const { router } = renderApp(`/org/${testOrganization.id}`);

    await waitFor(() => expect(applied().theme).toBe('forest'));
    await router.navigate(`/org/${second.id}`);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).endsWith(`/organizations/${second.id}`),
        ),
      ).toBe(true),
    );

    expect(applied().theme).toBe('forest');
    expect(appearanceCalls(fetchMock)).toHaveLength(1);
  });

  it('never shows one user’s appearance to the next user in the same browser', async () => {
    const other: AuthUser = {
      id: '0198c0de-0000-7000-8000-000000000002',
      name: 'Ben Other',
      email: 'ben@test.example',
    };
    let current: AuthUser | null = testUser;
    const fetchMock = mockApi({
      'GET /auth/me': () => (current ? signedIn(current)() : signedOut()),
      'GET /organizations': noOrganizations,
      'POST /auth/logout': () => {
        current = null;
        return noContent()();
      },
      'POST /auth/login': () => {
        current = other;
        return Response.json({ user: other });
      },
      [`GET ${APPEARANCE_API}`]: () =>
        Response.json(
          appearanceResponse(
            current?.id === testUser.id
              ? appearance({ mode: 'dark', theme: 'plum', backgroundEffect: 'snow' })
              : appearance({ theme: 'mint' }),
          ),
        ),
    });
    const { user } = renderApp('/');

    await waitFor(() => expect(applied()).toMatchObject({ mode: 'dark', theme: 'plum' }));
    await signOutFromMenu(user);

    await screen.findByRole('heading', { name: /sign in/i });
    expect(applied()).toMatchObject({ mode: 'light', theme: 'default' });
    expect(effectLayers()).toHaveLength(0);
    expect(localStorage.getItem(APPEARANCE_CACHE_KEY)).toBeNull();

    await user.type(screen.getByLabelText('Email'), other.email);
    await user.type(screen.getByLabelText('Password'), 'another-test-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(applied()).toMatchObject({ mode: 'light', theme: 'mint' }));
    expect(effectLayers()).toHaveLength(0);
    expect(appearanceCalls(fetchMock)).toHaveLength(2);
  });

  it('renders exactly one background effect layer on every page', async () => {
    mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': noOrganizations,
      [`GET ${APPEARANCE_API}`]: json(
        200,
        appearanceResponse(appearance({ backgroundEffect: 'starry-night' })),
      ),
      [`GET ${APPEARANCE_API}/profiles`]: json(200, { profiles: [] }),
    });
    const { router } = renderApp('/');

    await waitFor(() => expect(effectLayers()).toHaveLength(1));
    await router.navigate('/settings/appearance');
    await screen.findByRole('heading', { level: 1, name: 'Appearance' });
    expect(effectLayers()).toHaveLength(1);
    expect(effectLayers()[0]).toHaveAttribute('data-effect', 'starry-night');
  });
});

describe('index.html startup script', () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)![1]!;
  // The inline script is plain, trusted page code; run it like the browser does.
  // oxlint-disable-next-line no-new-func
  const run = () => new Function(script)() as void;

  it('re-applies the cached appearance before the app starts', () => {
    localStorage.setItem(
      APPEARANCE_CACHE_KEY,
      JSON.stringify({
        vars: {
          '--primary': 'oklch(60% 0.1 200)',
          '--shadow-card': '0 1px 2px 0 oklch(0% 0 0 / 0.05)',
        },
        data: { mode: 'dark', theme: 'ocean' },
      }),
    );
    run();
    expect(appliedVar('--primary')).toBe('oklch(60% 0.1 200)');
    expect(appliedVar('--shadow-card')).toBe('0 1px 2px 0 oklch(0% 0 0 / 0.05)');
    expect(applied()).toMatchObject({ mode: 'dark', theme: 'ocean' });
  });

  it('ignores anything that is not a plain token value', () => {
    localStorage.setItem(
      APPEARANCE_CACHE_KEY,
      JSON.stringify({
        vars: {
          '--background': 'url(https://example.test/x.png)',
          '--surface': 'red; color: blue',
          '--primary': 'image(red)',
          color: 'red',
        },
        data: { mode: '"><img>', theme: 'ocean', unknown: 'x' },
      }),
    );
    run();
    expect(document.documentElement.getAttribute('style')).toBeNull();
    expect(applied()).toEqual({ theme: 'ocean' });
  });

  it('survives a corrupt cache', () => {
    localStorage.setItem(APPEARANCE_CACHE_KEY, '{not json');
    expect(run).not.toThrow();
    expect(applied()).toEqual({});
  });
});
