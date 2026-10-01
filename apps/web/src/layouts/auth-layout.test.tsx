import { THEME_IDS } from '@app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_API,
  appearance,
  appearanceResponse,
  applied,
} from '@/test/appearance-fixtures';
import { GUEST_APPEARANCE_KEY } from '@/lib/appearance/guest';
import { json, mockApi, noOrganizations, signedIn, signedOut, testUser } from '@/test/mock-api';
import { renderApp } from '@/test/render-app';

const trigger = () => screen.getByRole('button', { name: 'Appearance' });
const panel = () => screen.getByRole('dialog', { name: 'Appearance' });
const guestChoice = () =>
  JSON.parse(localStorage.getItem(GUEST_APPEARANCE_KEY) ?? 'null') as unknown;
const apiPaths = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.map(([input, init]) => {
    const url = new URL(String(input));
    return `${init?.method ?? 'GET'} ${url.pathname}`;
  });

async function renderSignedOut(path = '/login') {
  const fetchMock = mockApi({ 'GET /auth/me': signedOut });
  const app = renderApp(path);
  await screen.findByRole('heading', {
    name: path === '/login' ? /sign in to/i : 'Create your account',
  });
  return { ...app, fetchMock };
}

describe('AuthLayout appearance', () => {
  it('opens the sign-in page in dark mode with the Appearance control, without the API', async () => {
    const { fetchMock } = await renderSignedOut('/login');

    expect(applied()).toMatchObject({ mode: 'dark', theme: 'default' });
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog');
    // Only the session check: nothing authenticated is needed to render or style the page.
    expect(apiPaths(fetchMock)).toEqual(['GET /auth/me']);
  });

  it('gives the registration page the same shell and control', async () => {
    await renderSignedOut('/register');

    expect(applied()).toMatchObject({ mode: 'dark', theme: 'default' });
    expect(trigger()).toBeVisible();
  });

  it('switches between dark and light immediately and remembers only mode and theme', async () => {
    const { user, fetchMock } = await renderSignedOut();

    await user.click(trigger());
    const mode = within(panel()).getByRole('radiogroup', { name: 'Mode' });
    expect(within(mode).getByRole('radio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await user.click(within(mode).getByRole('radio', { name: 'Light' }));
    expect(applied()).toMatchObject({ mode: 'light', theme: 'default' });
    expect(guestChoice()).toEqual({ mode: 'light', theme: 'default' });

    await user.click(within(mode).getByRole('radio', { name: 'Dark' }));
    expect(applied()).toMatchObject({ mode: 'dark' });
    expect(guestChoice()).toEqual({ mode: 'dark', theme: 'default' });
    expect(apiPaths(fetchMock)).toEqual(['GET /auth/me']);
  });

  it('selects a theme preset (the custom theme stays on the Appearance page)', async () => {
    const { user } = await renderSignedOut();

    await user.click(trigger());
    const themes = within(panel()).getByRole('radiogroup', { name: 'Theme' });
    expect(within(themes).getAllByRole('radio')).toHaveLength(THEME_IDS.length - 1);
    expect(within(themes).queryByRole('radio', { name: 'Custom theme' })).toBeNull();

    await user.click(within(themes).getByRole('radio', { name: 'Ocean theme' }));
    expect(applied()).toMatchObject({ mode: 'dark', theme: 'ocean' });
    expect(within(themes).getByRole('radio', { name: 'Ocean theme' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(guestChoice()).toEqual({ mode: 'dark', theme: 'ocean' });
  });

  it('keeps the guest choice on this device for the next visit', async () => {
    localStorage.setItem(GUEST_APPEARANCE_KEY, JSON.stringify({ mode: 'light', theme: 'forest' }));
    await renderSignedOut();

    expect(applied()).toMatchObject({ mode: 'light', theme: 'forest' });
  });

  it('ignores an invalid stored guest choice', async () => {
    localStorage.setItem(
      GUEST_APPEARANCE_KEY,
      JSON.stringify({ mode: 'neon', theme: 'custom', customAccent: '#ff0000' }),
    );
    await renderSignedOut();

    expect(applied()).toMatchObject({ mode: 'dark', theme: 'default' });
  });

  it('works from the keyboard: Tab, Enter/Space, Escape, focus back on the button', async () => {
    const { user } = await renderSignedOut();

    await user.tab();
    expect(trigger()).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(trigger()).toHaveAttribute('aria-controls', panel().id);
    // Focus moves into the popover, onto the selected mode.
    expect(within(panel()).getByRole('radio', { name: 'Dark' })).toHaveFocus();

    // Arrow keys choose within the group (radio group pattern).
    await user.keyboard('{ArrowLeft}');
    expect(applied()).toMatchObject({ mode: 'light' });

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Appearance' })).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');

    await user.keyboard(' ');
    expect(panel()).toBeVisible();
    await user.keyboard('{Escape}');
    expect(trigger()).toHaveFocus();
  });

  it('closes on a click outside', async () => {
    const { user } = await renderSignedOut();

    await user.click(trigger());
    expect(panel()).toBeVisible();
    await user.click(screen.getByRole('heading', { name: /sign in to/i }));
    expect(screen.queryByRole('dialog', { name: 'Appearance' })).toBeNull();
  });

  it('applies the saved appearance after sign-in without saving the guest choice', async () => {
    localStorage.setItem(GUEST_APPEARANCE_KEY, JSON.stringify({ mode: 'light', theme: 'forest' }));
    let signedInNow = false;
    const fetchMock = mockApi({
      'GET /auth/me': () => (signedInNow ? signedIn()() : signedOut()),
      'POST /auth/login': () => {
        signedInNow = true;
        return Response.json({ user: testUser });
      },
      'GET /organizations': noOrganizations,
      [`GET ${APPEARANCE_API}`]: json(
        200,
        appearanceResponse(appearance({ mode: 'dark', theme: 'plum' })),
      ),
    });
    const { user } = renderApp('/login');
    await screen.findByRole('heading', { name: /sign in to/i });
    expect(applied()).toMatchObject({ mode: 'light', theme: 'forest' });

    await user.type(screen.getByLabelText('Email'), testUser.email);
    await user.type(screen.getByLabelText('Password'), 'a-test-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(applied()).toMatchObject({ mode: 'dark', theme: 'plum' }));
    // The server's appearance wins; nothing was written to it, and the control is gone.
    expect(apiPaths(fetchMock).filter((call) => !call.startsWith('GET'))).toEqual([
      'POST /auth/login',
    ]);
    expect(screen.queryByRole('button', { name: 'Appearance' })).toBeNull();
    expect(guestChoice()).toEqual({ mode: 'light', theme: 'forest' });
  });
});
