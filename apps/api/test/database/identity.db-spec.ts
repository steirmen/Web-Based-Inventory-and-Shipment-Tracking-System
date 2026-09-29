import { describe, expect, it } from 'vitest';
import { MemberRole } from '../../src/generated/prisma/client.js';
import { prisma } from './support/database.js';
import { expectCheckViolation, expectUniqueViolation } from './support/db-errors.js';
import { createOrganization, createUser } from './support/factories.js';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('User', () => {
  it('creates a user with a UUIDv7 id, timestamps, and no password hash', async () => {
    const user = await prisma.user.create({
      data: { name: 'Test Person', email: 'person@test.example' },
    });

    expect(user.id).toMatch(UUID_V7);
    expect(user.passwordHash).toBeNull();
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it('rejects a duplicate email', async () => {
    await createUser({ email: 'dup@test.example' });

    await expectUniqueViolation(createUser({ email: 'dup@test.example' }), 'users_email_key');
  });

  it.each([
    ['uppercase', 'Person@Test.example'],
    ['surrounding whitespace', ' person@test.example'],
    ['missing @', 'not-an-email'],
  ])('rejects a non-normalized email (%s)', async (_case, email) => {
    await expectCheckViolation(createUser({ email }), 'users_email_normalized_check');
  });
});

describe('Organization', () => {
  it('creates an organization', async () => {
    const organization = await prisma.organization.create({
      data: { name: 'Acme Test Ltd', slug: 'acme-test' },
    });

    expect(organization).toMatchObject({ name: 'Acme Test Ltd', slug: 'acme-test' });
  });

  it('rejects a duplicate slug', async () => {
    await createOrganization({ slug: 'taken' });

    await expectUniqueViolation(createOrganization({ slug: 'taken' }), 'organizations_slug_key');
  });

  it.each(['Upper-Case', 'double--hyphen', '-leading', 'with space', ''])(
    'rejects the invalid slug %j',
    async (slug) => {
      await expectCheckViolation(createOrganization({ slug }), 'organizations_slug_format_check');
    },
  );
});

describe('OrganizationMember', () => {
  it('links a user to an organization with a role (default STAFF)', async () => {
    const organization = await createOrganization();
    const owner = await createUser();
    const staff = await createUser();

    await prisma.organizationMember.create({
      data: { organizationId: organization.id, userId: owner.id, role: MemberRole.OWNER },
    });
    const staffMembership = await prisma.organizationMember.create({
      data: { organizationId: organization.id, userId: staff.id },
    });
    expect(staffMembership.role).toBe(MemberRole.STAFF);

    const members = await prisma.organizationMember.findMany({
      where: { organizationId: organization.id },
      include: { user: true },
      orderBy: { role: 'asc' },
    });
    expect(members.map((member) => [member.user.email, member.role])).toEqual([
      [owner.email, MemberRole.OWNER],
      [staff.email, MemberRole.STAFF],
    ]);
  });

  it('rejects a duplicate membership in the same organization', async () => {
    const organization = await createOrganization();
    const user = await createUser();
    await prisma.organizationMember.create({
      data: { organizationId: organization.id, userId: user.id, role: MemberRole.ADMIN },
    });

    await expectUniqueViolation(
      prisma.organizationMember.create({
        data: { organizationId: organization.id, userId: user.id, role: MemberRole.STAFF },
      }),
      'organization_members_organization_id_user_id_key',
    );
  });

  it('allows one user to belong to several organizations', async () => {
    const user = await createUser();
    const [first, second] = [await createOrganization(), await createOrganization()];

    await prisma.organizationMember.createMany({
      data: [
        { organizationId: first.id, userId: user.id, role: MemberRole.OWNER },
        { organizationId: second.id, userId: user.id, role: MemberRole.STAFF },
      ],
    });

    const memberships = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { memberships: { select: { organizationId: true } } },
    });
    expect(memberships.memberships).toHaveLength(2);
  });
});
