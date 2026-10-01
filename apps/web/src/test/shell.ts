import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** Signs out through the account menu in the app header. */
export async function signOutFromMenu(user: UserEvent): Promise<void> {
  const header = (await screen.findAllByRole('banner'))[0]!;
  await user.click(await within(header).findByRole('button', { name: /^Account: / }));
  await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
}
