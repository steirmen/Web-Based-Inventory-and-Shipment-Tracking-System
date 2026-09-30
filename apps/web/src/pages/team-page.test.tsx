import type { Invitation, Member, MemberRole } from '@app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  json,
  mockApi,
  noContent,
  organizationDetail,
  organizationList,
  organizationSummary,
  pending,
  signedIn,
  testOrganization,
} from '@/test/mock-api';
import { renderApp } from '@/test/render-app';

const ORG = `/organizations/${testOrganization.id}`;
const created = '2026-09-01T08:00:00.000Z';

const people: Record<MemberRole, Member> = {
  OWNER: {
    id: '0198c0de-0000-7000-8000-0000000000a1',
    userId: 'u-owner',
    name: 'Olivia Owner',
    email: 'olivia@test.example',
    role: 'OWNER',
    createdAt: created,
  },
  ADMIN: {
    id: '0198c0de-0000-7000-8000-0000000000a2',
    userId: 'u-admin',
    name: 'Adam Admin',
    email: 'adam@test.example',
    role: 'ADMIN',
    createdAt: created,
  },
  STAFF: {
    id: '0198c0de-0000-7000-8000-0000000000a3',
    userId: 'u-staff',
    name: 'Sam Staff',
    email: 'sam@test.example',
    role: 'STAFF',
    createdAt: created,
  },
};

const pendingInvitation = (role: MemberRole, email: string): Invitation => ({
  id: `0198c0de-0000-7000-8000-00000000${role === 'ADMIN' ? '0b01' : '0b02'}`,
  email,
  role,
  status: 'PENDING',
  expiresAt: '2026-10-08T08:00:00.000Z',
  createdAt: created,
  acceptedAt: null,
  revokedAt: null,
  invitedBy: { name: 'Olivia Owner' },
});

/** Renders the team page as the member with `viewerRole`, with a mutable fake API. */
async function openTeam(viewerRole: MemberRole, extra: Parameters<typeof mockApi>[0] = {}) {
  const viewer = people[viewerRole];
  const state = {
    members: Object.values(people),
    invitations: [
      pendingInvitation('ADMIN', 'future.admin@test.example'),
      pendingInvitation('STAFF', 'future.staff@test.example'),
    ],
    role: viewerRole,
  };
  const fetchMock = mockApi({
    'GET /auth/me': signedIn({ id: viewer.userId, name: viewer.name, email: viewer.email }),
    'GET /organizations': organizationList([organizationSummary({ role: viewerRole })]),
    [`GET ${ORG}`]: () => organizationDetail(state.role)(),
    [`GET ${ORG}/members`]: () => Response.json({ members: state.members }),
    ...(viewerRole === 'STAFF'
      ? {}
      : { [`GET ${ORG}/invitations`]: () => Response.json({ invitations: state.invitations }) }),
    ...extra,
  });
  const app = renderApp(`/org/${testOrganization.id}/team`);
  const list = await screen.findByRole('list', { name: 'Team members' });
  return { ...app, fetchMock, state, list };
}

const rowOf = (list: HTMLElement, name: string) =>
  within(list).getByText(name).closest('li') as HTMLElement;

const requests = (fetchMock: ReturnType<typeof mockApi>, method: string) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === method);

describe('TeamPage', () => {
  it('lists members with email, role, and the current user marked', async () => {
    const { list } = await openTeam('STAFF');

    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    const own = rowOf(list, 'Sam Staff');
    expect(within(own).getByText('You')).toBeInTheDocument();
    expect(within(own).getByText('sam@test.example')).toBeInTheDocument();
    expect(within(rowOf(list, 'Olivia Owner')).getByText('Owner')).toBeInTheDocument();
    expect(within(rowOf(list, 'Olivia Owner')).queryByText('You')).not.toBeInTheDocument();
  });

  it('STAFF sees a view-only team without management controls', async () => {
    const { list } = await openTeam('STAFF');

    expect(screen.getByText(/view-only access to the team/)).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Invite a member' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pending invitations' })).not.toBeInTheDocument();
    expect(within(list).queryAllByRole('button')).toHaveLength(0);
    expect(within(list).queryAllByRole('combobox')).toHaveLength(0);
  });

  it('ADMIN can invite staff only and remove staff only', async () => {
    const { list } = await openTeam('ADMIN');

    const roleSelect = screen.getByLabelText('Role');
    expect(
      within(roleSelect)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Staff']);
    expect(
      within(rowOf(list, 'Sam Staff')).getByRole('button', { name: 'Remove Sam Staff' }),
    ).toBeVisible();
    expect(within(rowOf(list, 'Olivia Owner')).queryAllByRole('button')).toHaveLength(0);
    expect(within(rowOf(list, 'Adam Admin')).queryAllByRole('button')).toHaveLength(0);
    expect(within(list).queryByRole('button', { name: /Make owner/ })).not.toBeInTheDocument();
    expect(within(list).queryAllByRole('combobox')).toHaveLength(0);
  });

  it('OWNER can change roles, remove, and transfer ownership for admins and staff', async () => {
    const { list } = await openTeam('OWNER');

    for (const name of ['Adam Admin', 'Sam Staff']) {
      const row = rowOf(list, name);
      expect(within(row).getByLabelText(`Role for ${name}`)).toBeEnabled();
      expect(within(row).getByRole('button', { name: `Remove ${name}` })).toBeVisible();
      expect(within(row).getByRole('button', { name: 'Make owner' })).toBeVisible();
    }
    expect(within(rowOf(list, 'Olivia Owner')).queryAllByRole('button')).toHaveLength(0);
    const roleSelect = screen.getByLabelText('Role');
    expect(
      within(roleSelect)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Admin', 'Staff']);
  });

  it('shows a loading state while a role change is saved', async () => {
    const { user, list, fetchMock } = await openTeam('OWNER', {
      [`PATCH ${ORG}/members/${people.STAFF.id}/role`]: pending(),
    });

    await user.selectOptions(
      within(rowOf(list, 'Sam Staff')).getByLabelText('Role for Sam Staff'),
      'ADMIN',
    );

    expect(within(rowOf(list, 'Sam Staff')).getByLabelText('Role for Sam Staff')).toBeDisabled();
    expect(within(rowOf(list, 'Sam Staff')).getByText('Updating role')).toBeInTheDocument();
    const [, init] = requests(fetchMock, 'PATCH')[0];
    expect(JSON.parse(String(init?.body))).toEqual({ role: 'ADMIN' });
  });

  it('asks for confirmation before removing a member', async () => {
    const { user, list, state, fetchMock } = await openTeam('OWNER', {
      [`DELETE ${ORG}/members/${people.STAFF.id}`]: () => {
        state.members = state.members.filter((m) => m.id !== people.STAFF.id);
        return noContent()();
      },
    });
    const row = rowOf(list, 'Sam Staff');

    await user.click(within(row).getByRole('button', { name: 'Remove Sam Staff' }));
    expect(within(row).getByText('Remove Sam Staff?')).toBeVisible();
    await user.click(within(row).getByRole('button', { name: 'Cancel' }));
    expect(within(row).queryByText('Remove Sam Staff?')).not.toBeInTheDocument();
    expect(requests(fetchMock, 'DELETE')).toHaveLength(0);

    await user.click(within(row).getByRole('button', { name: 'Remove Sam Staff' }));
    await user.click(within(row).getByRole('button', { name: 'Remove member' }));

    await waitFor(() => expect(within(list).queryByText('Sam Staff')).not.toBeInTheDocument());
    expect(requests(fetchMock, 'DELETE')).toHaveLength(1);
  });

  it('transfers ownership after confirmation and reflects the new role', async () => {
    const { user, list, state } = await openTeam('OWNER', {
      [`POST ${ORG}/ownership/transfer`]: () => {
        state.role = 'ADMIN';
        state.members = state.members.map((m) =>
          m.id === people.ADMIN.id
            ? { ...m, role: 'OWNER' }
            : m.id === people.OWNER.id
              ? { ...m, role: 'ADMIN' }
              : m,
        );
        return json(200, {})();
      },
    });

    await user.click(within(rowOf(list, 'Adam Admin')).getByRole('button', { name: 'Make owner' }));
    expect(screen.getByText('Make Adam Admin the owner?')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Transfer ownership' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Make owner' })).not.toBeInTheDocument(),
    );
    expect(within(rowOf(list, 'Adam Admin')).getByText('Owner')).toBeInTheDocument();
  });
});

describe('TeamPage invitations', () => {
  it('validates the invitation form', async () => {
    const { user, fetchMock } = await openTeam('OWNER');

    await user.click(screen.getByRole('button', { name: 'Create invite link' }));

    expect(screen.getByText('Enter your email address.')).toBeVisible();
    expect(requests(fetchMock, 'POST')).toHaveLength(0);
  });

  it('creates an invitation, shows the link once, and copies it', async () => {
    const inviteUrl = `http://localhost:5173/invite/${'t'.repeat(43)}`;
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue();
    const { user, fetchMock } = await openTeam('OWNER', {
      [`POST ${ORG}/invitations`]: json(201, {
        invitation: {
          id: 'new',
          email: 'new.hire@test.example',
          role: 'ADMIN',
          expiresAt: '2026-10-08T08:00:00.000Z',
          inviteUrl,
        },
      }),
    });
    // user-event installs its own clipboard stub on setup; replace it after rendering.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await user.type(screen.getByLabelText('Email'), 'New.Hire@test.example');
    await user.selectOptions(screen.getByLabelText('Role'), 'ADMIN');
    await user.click(screen.getByRole('button', { name: 'Create invite link' }));

    expect(await screen.findByText('Invite link created for new.hire@test.example')).toBeVisible();
    expect(screen.getByLabelText('Invite link')).toHaveValue(inviteUrl);
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(inviteUrl);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeVisible();
    const [, init] = requests(fetchMock, 'POST')[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'New.Hire@test.example',
      role: 'ADMIN',
    });
  });

  it('shows an invitation error on the email field', async () => {
    const { user } = await openTeam('OWNER', {
      [`POST ${ORG}/invitations`]: json(409, {
        statusCode: 409,
        code: 'MEMBERSHIP_ALREADY_EXISTS',
        message: 'This person is already a member of the workspace.',
      }),
    });

    await user.type(screen.getByLabelText('Email'), 'sam@test.example');
    await user.click(screen.getByRole('button', { name: 'Create invite link' }));

    expect(
      await screen.findByText('This person is already a member of the workspace.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('lists pending invitations and revokes only those the viewer may manage', async () => {
    const { user, state, fetchMock } = await openTeam('ADMIN', {
      [`DELETE ${ORG}/invitations/${pendingInvitation('STAFF', '').id}`]: () => {
        state.invitations = state.invitations.filter((i) => i.role !== 'STAFF');
        return noContent()();
      },
    });

    const pendingSection = (await screen.findByText('future.staff@test.example')).closest(
      'ul',
    ) as HTMLElement;
    expect(within(pendingSection).getByText('future.admin@test.example')).toBeVisible();
    expect(
      within(pendingSection).queryByRole('button', {
        name: 'Revoke invitation for future.admin@test.example',
      }),
    ).not.toBeInTheDocument();

    await user.click(
      within(pendingSection).getByRole('button', {
        name: 'Revoke invitation for future.staff@test.example',
      }),
    );

    await waitFor(() =>
      expect(screen.queryByText('future.staff@test.example')).not.toBeInTheDocument(),
    );
    expect(requests(fetchMock, 'DELETE')).toHaveLength(1);
  });
});
