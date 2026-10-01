import { type AppearanceConfig, DEFAULT_APPEARANCE } from '@app/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_API,
  PROFILES_API,
  appearance,
  appearanceProfile,
  appearanceResponse,
  applied,
  appliedVar,
  effectLayers,
  renderAppearancePage,
} from '@/test/appearance-fixtures';
import { sentBodies } from '@/test/catalog-fixtures';
import {
  apiError,
  json,
  mockApi,
  noContent,
  noOrganizations,
  pending,
  signedIn,
} from '@/test/mock-api';
import { renderApp } from '@/test/render-app';

const radio = (group: string, name: string) =>
  within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name });

/** `PUT /me/appearance` that answers with the saved body, like the API. */
const echoSave = () => (init: RequestInit | undefined) =>
  Response.json(appearanceResponse(JSON.parse(String(init?.body)) as AppearanceConfig));

describe('AppearancePage', () => {
  it('shows a loading state, then a safe error with retry, then the settings', async () => {
    let fail = true;
    let release = () => {};
    const firstAnswer = new Promise<void>((resolve) => (release = resolve));
    mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': noOrganizations,
      [`GET ${PROFILES_API}`]: json(200, { profiles: [] }),
      [`GET ${APPEARANCE_API}`]: async () => {
        await firstAnswer;
        return fail
          ? Response.json(
              { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Boom' },
              { status: 500 },
            )
          : Response.json(appearanceResponse());
      },
    });
    const { user } = renderApp('/settings/appearance');

    expect(await screen.findByText('Loading your appearance')).toBeInTheDocument();
    release();
    expect(await screen.findByText("We couldn't load your appearance")).toBeVisible();
    expect(screen.queryByText('Boom')).not.toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('radiogroup', { name: 'Theme' })).toBeVisible();
  });

  it('shows a sample of the interface next to the settings, hidden from assistive technology', async () => {
    await renderAppearancePage();

    const preview = await screen.findByRole('complementary', { name: 'Preview' });
    const sample = within(preview).getByText('Orders').closest('[aria-hidden="true"]');
    expect(sample).not.toBeNull();
    expect(sample).toHaveAttribute('inert');
    // Nothing in the sample can be reached with the keyboard.
    expect(within(preview).queryAllByRole('button')).toHaveLength(0);
  });

  it('shows the saved appearance as the selected options', async () => {
    await renderAppearancePage({
      saved: appearance({
        mode: 'dark',
        theme: 'forest',
        backgroundEffect: 'rain',
        animationIntensity: 'high',
        density: 'compact',
        radius: 'round',
        fontScale: 'large',
      }),
    });

    expect(radio('Mode', 'Dark')).toBeChecked();
    expect(radio('Theme', 'Forest theme')).toBeChecked();
    expect(radio('Background effect', 'Rain background')).toBeChecked();
    expect(radio('Animation', 'High')).toBeChecked();
    expect(radio('Density', 'Compact')).toBeChecked();
    expect(radio('Corners', 'Round')).toBeChecked();
    expect(radio('Text size', 'Large')).toBeChecked();
    expect(applied()).toMatchObject({
      mode: 'dark',
      theme: 'forest',
      density: 'compact',
      radius: 'round',
      fontScale: 'large',
    });
    expect(screen.getByText('All changes saved.')).toBeInTheDocument();
  });

  it('previews every change immediately without saving it', async () => {
    const { user, fetchMock } = await renderAppearancePage();
    const defaultPrimary = appliedVar('--primary');

    await user.click(radio('Mode', 'Dark'));
    await user.click(radio('Theme', 'Ocean theme'));
    await user.click(radio('Density', 'Spacious'));
    await user.click(radio('Corners', 'Sharp'));
    await user.click(radio('Text size', 'Small'));

    expect(applied()).toMatchObject({
      mode: 'dark',
      theme: 'ocean',
      density: 'spacious',
      radius: 'sharp',
      fontScale: 'small',
    });
    expect(appliedVar('--primary')).not.toBe(defaultPrimary);
    expect(radio('Theme', 'Ocean theme')).toBeChecked();
    expect(screen.getByText('Unsaved changes — you are seeing a preview.')).toBeInTheDocument();
    expect(sentBodies(fetchMock, 'PUT', APPEARANCE_API)).toEqual([]);
  });

  it('keeps every change made before the next render', async () => {
    await renderAppearancePage();

    act(() => {
      radio('Mode', 'Dark').click();
      radio('Theme', 'Forest theme').click();
      radio('Density', 'Compact').click();
    });

    expect(applied()).toMatchObject({ mode: 'dark', theme: 'forest', density: 'compact' });
  });

  it('switches between light and dark mode', async () => {
    const { user } = await renderAppearancePage();
    const lightBackground = appliedVar('--background');

    await user.click(radio('Mode', 'Dark'));
    expect(applied().mode).toBe('dark');
    const darkBackground = appliedVar('--background');
    expect(darkBackground).not.toBe(lightBackground);

    await user.click(radio('Mode', 'Light'));
    expect(applied().mode).toBe('light');
    expect(appliedVar('--background')).toBe(lightBackground);
  });

  it('saves the previewed appearance', async () => {
    const { user, fetchMock } = await renderAppearancePage(
      {},
      { [`PUT ${APPEARANCE_API}`]: echoSave() },
    );

    await user.click(radio('Theme', 'Sunset theme'));
    await user.click(radio('Background effect', 'Snow background'));
    await user.click(radio('Animation', 'Low'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Appearance saved.')).toBeVisible();
    expect(sentBodies(fetchMock, 'PUT', APPEARANCE_API)).toEqual([
      appearance({ theme: 'sunset', backgroundEffect: 'snow', animationIntensity: 'low' }),
    ]);
    expect(screen.getByText('All changes saved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(applied().theme).toBe('sunset');
  });

  it('never sends ownership fields or computed CSS to the API', async () => {
    const { user, fetchMock } = await renderAppearancePage(
      {},
      { [`PUT ${APPEARANCE_API}`]: echoSave() },
    );

    await user.click(radio('Mode', 'Dark'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Appearance saved.');

    const [body] = sentBodies(fetchMock, 'PUT', APPEARANCE_API) as Record<string, unknown>[];
    expect(Object.keys(body!).sort()).toEqual(Object.keys(DEFAULT_APPEARANCE).sort());
  });

  it('shows a safe message when saving fails and keeps the preview', async () => {
    const { user } = await renderAppearancePage(
      {},
      { [`PUT ${APPEARANCE_API}`]: apiError(400, 'VALIDATION_ERROR', 'Invalid request.') },
    );

    await user.click(radio('Mode', 'Dark'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(applied().mode).toBe('dark');
    expect(screen.getByText('Unsaved changes — you are seeing a preview.')).toBeInTheDocument();
  });

  it('cancel discards the preview and restores the saved appearance', async () => {
    const saved = appearance({ theme: 'plum' });
    const { user, fetchMock } = await renderAppearancePage({ saved });
    const savedPrimary = appliedVar('--primary');

    await user.click(radio('Theme', 'Mint theme'));
    await user.click(radio('Mode', 'Dark'));
    expect(applied().theme).toBe('mint');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(applied()).toMatchObject({ theme: 'plum', mode: 'light' });
    expect(appliedVar('--primary')).toBe(savedPrimary);
    expect(radio('Theme', 'Plum theme')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(sentBodies(fetchMock, 'PUT', APPEARANCE_API)).toEqual([]);
  });

  it('leaving the page ends an unsaved preview', async () => {
    const { user, router } = await renderAppearancePage();

    await user.click(radio('Mode', 'Dark'));
    expect(applied().mode).toBe('dark');

    await router.navigate('/organizations/new');
    await waitFor(() => expect(applied().mode).toBe('light'));
  });

  it('builds a custom theme from an accent color and tone', async () => {
    const { user, fetchMock } = await renderAppearancePage(
      {},
      { [`PUT ${APPEARANCE_API}`]: echoSave() },
    );

    await user.click(radio('Theme', 'Custom theme'));
    const hex = screen.getByRole('textbox', { name: 'Hex value' });
    await user.clear(hex);
    await user.type(hex, '#12ab');
    expect(screen.getByText('Use a 6-digit hex color, e.g. #4f46e5.')).toBeVisible();

    await user.type(hex, '34');
    expect(screen.queryByText('Use a 6-digit hex color, e.g. #4f46e5.')).not.toBeInTheDocument();
    await user.click(radio('Background tone', 'Warm'));
    expect(applied().theme).toBe('custom');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Appearance saved.');
    expect(sentBodies(fetchMock, 'PUT', APPEARANCE_API)).toEqual([
      appearance({ theme: 'custom', customAccent: '#12ab34', customTone: 'warm' }),
    ]);
  });

  it('explains when a custom color is adjusted for readability', async () => {
    const { user } = await renderAppearancePage();

    await user.click(radio('Mode', 'Dark'));
    await user.click(radio('Theme', 'Custom theme'));
    const hex = screen.getByRole('textbox', { name: 'Hex value' });
    // Bright yellow works on a dark canvas and stays exactly as chosen…
    await user.clear(hex);
    await user.type(hex, '#ffff00');
    expect(screen.queryByText(/a close shade of your color/)).not.toBeInTheDocument();
    // …but on a white canvas it would be invisible, so it is darkened.
    await user.click(radio('Mode', 'Light'));
    expect(screen.getByText(/a close shade of your color/)).toBeVisible();
  });

  it('switches the background effect and keeps exactly one effect layer', async () => {
    const { user } = await renderAppearancePage();
    expect(effectLayers()).toHaveLength(0);

    await user.click(radio('Background effect', 'Rain background'));
    expect(effectLayers()).toHaveLength(1);
    expect(effectLayers()[0]).toHaveAttribute('data-effect', 'rain');
    expect(effectLayers()[0]).toHaveAttribute('aria-hidden', 'true');
    expect(effectLayers()[0]).toHaveClass('pointer-events-none', 'fixed', '-z-10');

    await user.click(radio('Background effect', 'Aurora background'));
    expect(effectLayers()).toHaveLength(1);
    expect(effectLayers()[0]).toHaveAttribute('data-effect', 'aurora');

    await user.click(radio('Background effect', 'Off background'));
    expect(effectLayers()).toHaveLength(0);
  });

  it('changes animation intensity as part of the appearance', async () => {
    const { user } = await renderAppearancePage({
      saved: appearance({ backgroundEffect: 'fireflies' }),
    });

    await user.click(radio('Animation', 'High'));
    expect(radio('Animation', 'High')).toBeChecked();
    expect(radio('Animation', 'Medium')).not.toBeChecked();
    expect(screen.getByText('Unsaved changes — you are seeing a preview.')).toBeInTheDocument();
  });

  it('supports arrow keys inside option groups', async () => {
    const { user } = await renderAppearancePage();

    radio('Density', 'Comfortable').focus();
    await user.keyboard('{ArrowRight}');
    expect(radio('Density', 'Spacious')).toBeChecked();
    expect(radio('Density', 'Spacious')).toHaveFocus();
    expect(applied().density).toBe('spacious');
  });

  it('resets a saved appearance to the default', async () => {
    const { user, fetchMock } = await renderAppearancePage(
      { saved: appearance({ mode: 'dark', theme: 'rose' }) },
      { [`POST ${APPEARANCE_API}/reset`]: json(200, appearanceResponse(DEFAULT_APPEARANCE, null)) },
    );

    await user.click(screen.getByRole('button', { name: 'Reset to default' }));

    expect(await screen.findByText('Appearance reset to the default.')).toBeVisible();
    expect(applied()).toMatchObject({ mode: 'light', theme: 'default' });
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/reset'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeDisabled();
  });

  it('asks before a reset discards unsaved changes', async () => {
    const { user } = await renderAppearancePage(
      {},
      { [`POST ${APPEARANCE_API}/reset`]: json(200, appearanceResponse(DEFAULT_APPEARANCE, null)) },
    );

    await user.click(radio('Theme', 'Graphite theme'));
    await user.click(screen.getByRole('button', { name: 'Reset to default' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reset to default?' });
    await user.click(within(dialog).getByRole('button', { name: 'Reset' }));

    expect(await screen.findByText('Appearance reset to the default.')).toBeVisible();
    expect(applied().theme).toBe('default');
  });

  it('explains that effects are still when the device asks for reduced motion', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      await renderAppearancePage();
      expect(screen.getByText(/asks for reduced motion/)).toBeVisible();
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('Appearance profiles', () => {
  it('shows an empty state without profiles', async () => {
    await renderAppearancePage();
    expect(await screen.findByText('No saved profiles yet')).toBeVisible();
  });

  it('shows loading and error states for profiles', async () => {
    await renderAppearancePage({}, { [`GET ${PROFILES_API}`]: pending() });
    expect(screen.getByText('Loading profiles')).toBeInTheDocument();
  });

  it('shows a safe error when profiles cannot load', async () => {
    await renderAppearancePage(
      {},
      {
        [`GET ${PROFILES_API}`]: () =>
          Response.json(
            { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Boom' },
            { status: 500 },
          ),
      },
    );
    expect(await screen.findByText("We couldn't load your profiles")).toBeVisible();
    expect(screen.queryByText('Boom')).not.toBeInTheDocument();
  });

  it('saves the current (previewed) look as a profile', async () => {
    const created = appearanceProfile({
      name: 'Presentation',
      appearance: appearance({ theme: 'paper' }),
    });
    const { user, fetchMock } = await renderAppearancePage(
      {},
      { [`POST ${PROFILES_API}`]: json(201, { profile: created }) },
    );

    await user.click(radio('Theme', 'Paper theme'));
    await user.click(screen.getByRole('button', { name: 'Save current look' }));
    expect(screen.getByText('Enter a name.')).toBeVisible();

    await user.type(screen.getByRole('textbox', { name: 'Profile name' }), '  Presentation ');
    await user.click(screen.getByRole('button', { name: 'Save current look' }));

    expect(await screen.findByText('Saved “Presentation”.')).toBeVisible();
    expect(sentBodies(fetchMock, 'POST', PROFILES_API)).toEqual([
      { name: 'Presentation', appearance: appearance({ theme: 'paper' }) },
    ]);
    const list = screen.getByRole('list', { name: 'Saved profiles' });
    expect(within(list).getByText('Presentation')).toBeVisible();
  });

  it('shows the API message when a profile name is taken', async () => {
    const { user } = await renderAppearancePage(
      {},
      {
        [`POST ${PROFILES_API}`]: apiError(
          409,
          'APPEARANCE_PROFILE_NAME_TAKEN',
          'You already have a profile with this name.',
        ),
      },
    );

    await user.type(screen.getByRole('textbox', { name: 'Profile name' }), 'Night work');
    await user.click(screen.getByRole('button', { name: 'Save current look' }));

    expect(await screen.findByText('You already have a profile with this name.')).toBeVisible();
  });

  it('disables saving when the profile limit is reached', async () => {
    const profiles = Array.from({ length: 12 }, (_, index) =>
      appearanceProfile({
        id: `0198c0de-0000-7000-8000-0000000001${10 + index}`,
        name: `P${index}`,
      }),
    );
    await renderAppearancePage({ profiles });

    expect(await screen.findByText(/You have 12 profiles, the maximum/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save current look' })).toBeDisabled();
  });

  it('applies a profile, which becomes the saved appearance', async () => {
    const profile = appearanceProfile();
    const { user } = await renderAppearancePage(
      { profiles: [profile] },
      {
        [`POST ${PROFILES_API}/${profile.id}/apply`]: json(
          200,
          appearanceResponse(profile.appearance),
        ),
      },
    );

    await user.click(await screen.findByRole('button', { name: 'Apply Night work' }));

    expect(await screen.findByText('Applied “Night work”.')).toBeVisible();
    expect(applied()).toMatchObject({ mode: 'dark', theme: 'ocean' });
    expect(effectLayers()[0]).toHaveAttribute('data-effect', 'snow');
    expect(screen.getByText('In use')).toBeVisible();
    expect(screen.getByText('All changes saved.')).toBeInTheDocument();
  });

  it('marks the profile that matches the saved appearance as in use', async () => {
    const profile = appearanceProfile();
    await renderAppearancePage({ saved: profile.appearance, profiles: [profile] });

    expect(await screen.findByText('In use')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Apply Night work' })).not.toBeInTheDocument();
  });

  it('renames a profile', async () => {
    let profile = appearanceProfile();
    const { user, fetchMock } = await renderAppearancePage(
      {},
      {
        [`GET ${PROFILES_API}`]: () => Response.json({ profiles: [profile] }),
        [`PATCH ${PROFILES_API}/${profile.id}`]: () => {
          profile = { ...profile, name: 'Late shift' };
          return Response.json({ profile });
        },
      },
    );

    await user.click(await screen.findByRole('button', { name: 'Rename Night work' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename profile' });
    const input = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.clear(input);
    await user.type(input, 'Late shift');
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }));

    expect(await screen.findByText('Renamed to “Late shift”.')).toBeVisible();
    expect(sentBodies(fetchMock, 'PATCH', `${PROFILES_API}/${profile.id}`)).toEqual([
      { name: 'Late shift' },
    ]);
    expect(
      within(screen.getByRole('list', { name: 'Saved profiles' })).getByText('Late shift'),
    ).toBeVisible();
  });

  it('deletes a profile after confirmation without changing the appearance', async () => {
    const profile = appearanceProfile();
    let profiles = [profile];
    const { user, fetchMock } = await renderAppearancePage(
      {},
      {
        [`GET ${PROFILES_API}`]: () => Response.json({ profiles }),
        [`DELETE ${PROFILES_API}/${profile.id}`]: () => {
          profiles = [];
          return noContent()();
        },
      },
    );

    await user.click(await screen.findByRole('button', { name: 'Delete Night work' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete profile?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Deleted “Night work”.')).toBeVisible();
    expect(await screen.findByText('No saved profiles yet')).toBeVisible();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1);
    expect(applied().theme).toBe('default');
  });
});
