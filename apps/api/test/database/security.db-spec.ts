import { hasPermission, type MemberRole, type Permission } from '@app/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../../src/auth/password/password-hashing.js';
import { generateSecureToken, hashToken } from '../../src/common/security/secure-token.js';
import { prisma } from './support/database.js';
import { createCategory, createProduct, createUser, createWarehouse } from './support/factories.js';
import { createHttpApp } from './support/http-app.js';
import { expectLedgerConsistent } from './support/inventory.js';
import { addMember, createSignedInUser } from './support/organizations.js';
import { salesFixture } from './support/sales.js';

/**
 * Phase 10A security checks against the real pipeline and the test database:
 * session cleanup, CSRF on real mutations, RBAC on every high-value mutation,
 * tenant isolation (objects AND search), mass assignment, append-only ledgers,
 * and error sanitization. See docs/security.md.
 */

const FRONTEND = 'http://localhost:5173';
const EVIL = 'http://localhost:6666';
const DAY = 86_400_000;

let app: INestApplication;
const api = () => request(app.getHttpServer());

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

describe('session cleanup (opportunistic, no background job)', () => {
  it('on sign-in removes sessions that ended over a day ago, never active or recently ended ones', async () => {
    const password = 'Correct-Horse-Battery-9';
    const user = await createUser({ passwordHash: await hashPassword(password) });
    const other = await createUser();
    const now = Date.now();
    const session = (
      userId: string,
      data: { createdAt: number; expiresAt: number; revokedAt?: number },
    ) =>
      prisma.session.create({
        data: {
          userId,
          tokenHash: hashToken(generateSecureToken()),
          createdAt: new Date(data.createdAt),
          expiresAt: new Date(data.expiresAt),
          revokedAt: data.revokedAt === undefined ? null : new Date(data.revokedAt),
        },
      });
    const active = await session(user.id, { createdAt: now - DAY, expiresAt: now + 6 * DAY });
    const expiredLongAgo = await session(user.id, {
      createdAt: now - 10 * DAY,
      expiresAt: now - 3 * DAY,
    });
    const revokedLongAgo = await session(user.id, {
      createdAt: now - 4 * DAY,
      expiresAt: now + 3 * DAY,
      revokedAt: now - 2 * DAY,
    });
    const revokedRecently = await session(user.id, {
      createdAt: now - DAY,
      expiresAt: now + 6 * DAY,
      revokedAt: now - 3_600_000,
    });
    const expiredRecently = await session(user.id, {
      createdAt: now - 7 * DAY,
      expiresAt: now - 3_600_000,
    });
    const othersStale = await session(other.id, {
      createdAt: now - 10 * DAY,
      expiresAt: now - 3 * DAY,
    });
    const othersActive = await session(other.id, { createdAt: now - DAY, expiresAt: now + DAY });

    await api()
      .post('/auth/login')
      .set('Origin', FRONTEND)
      .send({ email: user.email, password })
      .expect(200);

    const remaining = new Set(
      (await prisma.session.findMany({ select: { id: true } })).map((s) => s.id),
    );
    expect(remaining.has(active.id)).toBe(true);
    expect(remaining.has(revokedRecently.id)).toBe(true);
    expect(remaining.has(expiredRecently.id)).toBe(true);
    expect(remaining.has(othersActive.id)).toBe(true);
    expect(remaining.has(expiredLongAgo.id)).toBe(false);
    expect(remaining.has(revokedLongAgo.id)).toBe(false);
    // The first sign-in of an API process also sweeps every user's long-ended sessions.
    expect(remaining.has(othersStale.id)).toBe(false);
    // Plus the new session.
    expect(remaining.size).toBe(5);
  });

  it('still rejects revoked and expired sessions that are kept for the grace period', async () => {
    const user = await createSignedInUser();
    const token = user.cookie.split('=')[1]!;
    await prisma.session.updateMany({
      where: { tokenHash: hashToken(token) },
      data: { revokedAt: new Date() },
    });
    const revoked = await api().get('/auth/me').set('Cookie', user.cookie).expect(401);
    expect(revoked.body.code).toBe('AUTH_SESSION_REVOKED');
  });
});

describe('CSRF on real mutations', () => {
  it('refuses a cookie-carrying mutation from a foreign origin and changes nothing', async () => {
    const f = await salesFixture(app);
    const before = await prisma.warehouse.count({ where: { organizationId: f.org } });

    const attack = await api()
      .post(`${f.base}/warehouses`)
      .set('Cookie', f.team.owner.cookie)
      .set('Origin', EVIL)
      .send({ name: 'Hijacked', code: 'EVIL' })
      .expect(403);
    expect(attack.body.code).toBe('CSRF_ORIGIN_REJECTED');
    expect(await prisma.warehouse.count({ where: { organizationId: f.org } })).toBe(before);

    // The same request from the web app works; reads are never blocked.
    await api()
      .post(`${f.base}/warehouses`)
      .set('Cookie', f.team.owner.cookie)
      .set('Origin', FRONTEND)
      .send({ name: 'Legit', code: 'LEGIT' })
      .expect(201);
    await api()
      .get(`${f.base}/warehouses`)
      .set('Cookie', f.team.owner.cookie)
      .set('Origin', EVIL)
      .expect(200);
  });

  it('a form post (urlencoded) from a foreign origin cannot change data either', async () => {
    const f = await salesFixture(app);
    await api()
      .post(`${f.base}/customers/${f.customer.id}/archive`)
      .set('Cookie', f.team.owner.cookie)
      .set('Origin', EVIL)
      .type('form')
      .send('x=1')
      .expect(403);
    expect(
      (await prisma.customer.findUniqueOrThrow({ where: { id: f.customer.id } })).isActive,
    ).toBe(true);
  });
});

/** Everything a forbidden request could have changed, for a before/after comparison. */
async function snapshot(organizationId: string) {
  const [
    orders,
    inventory,
    warehouses,
    customers,
    products,
    members,
    invitations,
    movements,
    logs,
  ] = await Promise.all([
    prisma.order.findMany({
      where: { organizationId },
      select: { id: true, status: true },
      orderBy: { id: 'asc' },
    }),
    prisma.inventory.findMany({
      where: { organizationId },
      select: { id: true, quantity: true },
      orderBy: { id: 'asc' },
    }),
    prisma.warehouse.findMany({
      where: { organizationId },
      select: { id: true, name: true, isActive: true },
      orderBy: { id: 'asc' },
    }),
    prisma.customer.findMany({
      where: { organizationId },
      select: { id: true, isActive: true },
      orderBy: { id: 'asc' },
    }),
    prisma.product.findMany({
      where: { organizationId },
      select: { id: true, status: true },
      orderBy: { id: 'asc' },
    }),
    prisma.organizationMember.findMany({
      where: { organizationId },
      select: { id: true, role: true },
      orderBy: { id: 'asc' },
    }),
    prisma.organizationInvitation.count({ where: { organizationId } }),
    prisma.stockMovement.count({ where: { organizationId } }),
    prisma.activityLog.count({ where: { organizationId } }),
  ]);
  return {
    orders,
    inventory,
    warehouses,
    customers,
    products,
    members,
    invitations,
    movements,
    logs,
  };
}

type Fixture = Awaited<ReturnType<typeof salesFixture>>;
interface Mutation {
  name: string;
  permission: Permission;
  /** Prepares a fresh target and returns the request to send as `cookie`. */
  prepare: (f: Fixture) => Promise<(cookie: string) => request.Test>;
}

const send =
  (method: 'post' | 'patch' | 'delete', path: string, body?: object) => (cookie: string) => {
    const pending = api()[method](path).set('Cookie', cookie).set('Origin', FRONTEND);
    return body ? pending.send(body) : pending;
  };

const processed = async (f: Fixture) => {
  await f.stock(f.main.id, f.pen.id, 10);
  const order = await f.confirmedOrder([{ productId: f.pen.id, quantity: 1 }]);
  await f.action(order.id, 'process').expect(200);
  return order;
};

const MUTATIONS: Mutation[] = [
  {
    name: 'create a warehouse',
    permission: 'WAREHOUSES_CREATE',
    prepare: async (f) => send('post', `${f.base}/warehouses`, { name: 'North', code: 'NORTH' }),
  },
  {
    name: 'update a warehouse',
    permission: 'WAREHOUSES_UPDATE',
    prepare: async (f) => send('patch', `${f.base}/warehouses/${f.east.id}`, { name: 'Renamed' }),
  },
  {
    name: 'archive a warehouse',
    permission: 'WAREHOUSES_ARCHIVE',
    prepare: async (f) => send('post', `${f.base}/warehouses/${f.east.id}/archive`),
  },
  {
    name: 'adjust inventory',
    permission: 'INVENTORY_ADJUST',
    prepare: async (f) =>
      send('post', `${f.base}/inventory/adjust`, {
        warehouseId: f.main.id,
        productId: f.pen.id,
        newQuantity: 5,
        reason: 'Count',
      }),
  },
  {
    name: 'transfer inventory',
    permission: 'INVENTORY_TRANSFER',
    prepare: async (f) => {
      await f.stock(f.main.id, f.pen.id, 10);
      return send('post', `${f.base}/inventory/transfer`, {
        sourceWarehouseId: f.main.id,
        destinationWarehouseId: f.east.id,
        productId: f.pen.id,
        quantity: 2,
      });
    },
  },
  {
    name: 'archive a customer',
    permission: 'CUSTOMERS_ARCHIVE',
    prepare: async (f) => send('post', `${f.base}/customers/${f.customer.id}/archive`),
  },
  {
    name: 'archive a product',
    permission: 'PRODUCTS_ARCHIVE',
    prepare: async (f) => send('post', `${f.base}/products/${f.mouse.id}/archive`),
  },
  {
    name: 'process an order',
    permission: 'ORDERS_PROCESS',
    prepare: async (f) => {
      await f.stock(f.main.id, f.pen.id, 10);
      const order = await f.confirmedOrder([{ productId: f.pen.id, quantity: 1 }]);
      return send('post', `${f.base}/orders/${order.id}/process`);
    },
  },
  {
    name: 'ship an order',
    permission: 'ORDERS_SHIP',
    prepare: async (f) => send('post', `${f.base}/orders/${(await processed(f)).id}/ship`),
  },
  {
    name: 'complete an order',
    permission: 'ORDERS_COMPLETE',
    prepare: async (f) => {
      const order = await processed(f);
      await f.action(order.id, 'ship').expect(200);
      return send('post', `${f.base}/orders/${order.id}/complete`);
    },
  },
  {
    name: 'cancel an order',
    permission: 'ORDERS_CANCEL',
    prepare: async (f) =>
      send(
        'post',
        `${f.base}/orders/${(await f.confirmedOrder([{ productId: f.pen.id, quantity: 1 }])).id}/cancel`,
      ),
  },
  {
    name: 'invite a member',
    permission: 'MEMBERS_INVITE',
    prepare: async (f) =>
      send('post', `${f.base}/invitations`, { email: 'new.member@test.example', role: 'STAFF' }),
  },
  {
    name: 'remove a member',
    permission: 'MEMBERS_REMOVE',
    prepare: async (f) => {
      const extra = await addMember(f.org, await createSignedInUser(), 'STAFF');
      return send('delete', `${f.base}/members/${extra.memberId}`);
    },
  },
  {
    name: 'change a member role',
    permission: 'MEMBERS_UPDATE_ROLE',
    prepare: async (f) => {
      const extra = await addMember(f.org, await createSignedInUser(), 'ADMIN');
      return send('patch', `${f.base}/members/${extra.memberId}/role`, { role: 'STAFF' });
    },
  },
  {
    name: 'transfer ownership',
    permission: 'OWNERSHIP_TRANSFER',
    prepare: async (f) =>
      send('post', `${f.base}/ownership/transfer`, { targetMemberId: f.team.admin.memberId }),
  },
  {
    name: 'rename the workspace',
    permission: 'ORGANIZATION_UPDATE',
    prepare: async (f) => send('patch', f.base, { name: 'Renamed Co' }),
  },
];

/** The intended role model (Phase 10A brief); must equal the central matrix. */
const EXPECTED_ALLOWED: Record<string, MemberRole[]> = {
  'create a warehouse': ['OWNER', 'ADMIN'],
  'update a warehouse': ['OWNER', 'ADMIN'],
  'archive a warehouse': ['OWNER', 'ADMIN'],
  'adjust inventory': ['OWNER', 'ADMIN'],
  'transfer inventory': ['OWNER', 'ADMIN'],
  'archive a customer': ['OWNER', 'ADMIN'],
  'archive a product': ['OWNER', 'ADMIN'],
  'process an order': ['OWNER', 'ADMIN'],
  'ship an order': ['OWNER', 'ADMIN'],
  'complete an order': ['OWNER', 'ADMIN'],
  'cancel an order': ['OWNER', 'ADMIN'],
  'invite a member': ['OWNER', 'ADMIN'],
  'remove a member': ['OWNER', 'ADMIN'],
  'change a member role': ['OWNER'], // ADMIN may not change another ADMIN (business rule)
  'transfer ownership': ['OWNER'],
  'rename the workspace': ['OWNER', 'ADMIN'],
};

describe('RBAC: every high-value mutation, called directly as OWNER, ADMIN, and STAFF', () => {
  it('the intended role model equals the central permission matrix', () => {
    // "change a member role" combines a permission with a business rule, so it is left out.
    const byMatrix = MUTATIONS.filter((mutation) => mutation.name !== 'change a member role').map(
      (mutation) => [
        mutation.name,
        (['OWNER', 'ADMIN', 'STAFF'] as const).filter((role) =>
          hasPermission(role, mutation.permission),
        ),
      ],
    );
    expect(byMatrix).toEqual(byMatrix.map(([name]) => [name, EXPECTED_ALLOWED[name as string]]));
  });

  const cases = MUTATIONS.flatMap((mutation) =>
    (['OWNER', 'ADMIN', 'STAFF'] as const).map((role) => ({
      mutation,
      role,
      allowed: EXPECTED_ALLOWED[mutation.name]!.includes(role),
    })),
  );

  /** Runs the mutation as `role` on a fresh workspace; reports the answer and whether data changed. */
  async function attempt(mutation: Mutation, role: MemberRole) {
    const f = await salesFixture(app);
    const actor = { OWNER: f.team.owner, ADMIN: f.team.admin, STAFF: f.team.staff }[role];
    const call = await mutation.prepare(f);
    const before = JSON.stringify(await snapshot(f.org));
    const response = await call(actor.cookie);
    const unchanged = JSON.stringify(await snapshot(f.org)) === before;
    return { status: response.status, code: response.body.code as string | undefined, unchanged };
  }

  it.each(
    cases.filter((c) => c.allowed).map((c) => [c.role, c.mutation.name, c.mutation] as const),
  )('%s may %s', async (role, _name, mutation) => {
    const result = await attempt(mutation, role);
    expect(result.status).toBeLessThan(300);
    expect(result.unchanged).toBe(false);
  });

  it.each(
    cases.filter((c) => !c.allowed).map((c) => [c.role, c.mutation.name, c.mutation] as const),
  )('%s may not %s (403, nothing changes)', async (role, _name, mutation) => {
    const result = await attempt(mutation, role);
    expect(result.status).toBe(403);
    expect(['ORGANIZATION_FORBIDDEN', 'MEMBER_ROLE_CHANGE_FORBIDDEN']).toContain(result.code);
    expect(result.unchanged).toBe(true);
  });
});

describe('tenant isolation: objects and search', () => {
  /** Workspace B, with records whose names exist ONLY there ("Zeta …"). */
  async function workspaces() {
    const a = await salesFixture(app);
    const b = await salesFixture(app);
    const secret = {
      category: await createCategory(b.org, { name: 'Zeta Category' }),
      product: await createProduct(b.org, { name: 'Zeta Secret Product', sku: 'ZETA-1' }),
      warehouse: await createWarehouse(b.org, { name: 'Zeta Depot', code: 'ZETA' }),
      customer: await prisma.customer.create({
        data: { organizationId: b.org, name: 'Zeta Customer', companyName: 'Zeta Corp' },
      }),
    };
    await b.stock(b.main.id, secret.product.id, 7);
    const order = await b
      .order([{ productId: b.pen.id, quantity: 1 }], { customerId: secret.customer.id })
      .expect(201);
    const inventory = await prisma.inventory.findFirstOrThrow({ where: { organizationId: b.org } });
    const invitation = await b
      .api()
      .post(`${b.base}/invitations`)
      .set('Cookie', b.team.owner.cookie)
      .send({ email: 'zeta.invite@test.example', role: 'STAFF' })
      .expect(201);
    return {
      a,
      b,
      secret,
      orderId: order.body.order.id as string,
      inventoryId: inventory.id,
      invitationId: invitation.body.invitation.id as string,
    };
  }

  it("never returns another workspace's object, with the same 404 as an unknown id", async () => {
    const { a, b, secret, orderId, inventoryId, invitationId } = await workspaces();
    const asA = (path: string) => api().get(`${a.base}${path}`).set('Cookie', a.team.owner.cookie);
    const objectPaths: [string, string][] = [
      [`/products/${secret.product.id}`, 'PRODUCT_NOT_FOUND'],
      [`/warehouses/${secret.warehouse.id}`, 'WAREHOUSE_NOT_FOUND'],
      [`/customers/${secret.customer.id}`, 'CUSTOMER_NOT_FOUND'],
      [`/orders/${orderId}`, 'ORDER_NOT_FOUND'],
      [`/inventory/${inventoryId}`, 'INVENTORY_NOT_FOUND'],
    ];
    const hidden: [string, number, string][] = [];
    for (const [path] of objectPaths) {
      const response = await asA(path);
      hidden.push([path, response.status, response.body.code]);
    }
    expect(hidden).toEqual(objectPaths.map(([path, code]) => [path, 404, code]));

    // Mutations through A's routes on B's ids.
    const mutate = (method: 'post' | 'patch' | 'delete', path: string, body?: object) => {
      const pending = api()
        [method](`${a.base}${path}`)
        .set('Cookie', a.team.owner.cookie)
        .set('Origin', FRONTEND);
      return body ? pending.send(body) : pending;
    };
    expect(
      (await mutate('patch', `/categories/${secret.category.id}`, { name: 'Taken' })).status,
    ).toBe(404);
    expect((await mutate('post', `/products/${secret.product.id}/archive`)).status).toBe(404);
    expect((await mutate('post', `/orders/${orderId}/cancel`)).status).toBe(404);
    expect((await mutate('delete', `/invitations/${invitationId}`)).body.code).toBe(
      'INVITATION_NOT_FOUND',
    );
    expect(
      (await mutate('patch', `/members/${b.team.staff.memberId}/role`, { role: 'ADMIN' })).body
        .code,
    ).toBe('MEMBERSHIP_NOT_FOUND');

    // B's workspace routes, for A's user: indistinguishable from a workspace that doesn't exist.
    const foreign: [string, number, string][] = [];
    for (const path of [
      '',
      '/members',
      '/invitations',
      '/products',
      '/categories',
      '/warehouses',
      '/inventory',
      '/stock-movements',
      '/customers',
      '/orders',
      '/dashboard/summary',
      '/reports/sales',
      '/reports/orders',
      '/reports/inventory',
    ]) {
      const response = await api().get(`${b.base}${path}`).set('Cookie', a.team.owner.cookie);
      foreign.push([path, response.status, response.body.code]);
    }
    expect(
      foreign.filter(([, status, code]) => status !== 404 || code !== 'ORGANIZATION_NOT_FOUND'),
    ).toEqual([]);

    // Nothing in B changed.
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('DRAFT');
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: secret.product.id } })).status,
    ).toBe('ACTIVE');
  });

  it("never finds another workspace's rows through search or filters", async () => {
    const { a, b, secret } = await workspaces();
    const asA = (path: string) => api().get(`${a.base}${path}`).set('Cookie', a.team.owner.cookie);
    const leaks = (body: unknown) => {
      const text = JSON.stringify(body);
      return ['Zeta', b.org, secret.product.id, secret.customer.id, secret.warehouse.id].filter(
        (value) => text.includes(value),
      );
    };
    const searched: [string, number, string[]][] = [];
    for (const path of [
      '/products?search=Zeta',
      '/categories',
      '/warehouses',
      '/inventory?search=Zeta',
      '/stock-movements',
      '/customers?search=Zeta',
      '/customers?status=ARCHIVED&search=Zeta',
      '/orders?search=Zeta',
      '/reports/sales?range=THIS_YEAR&search=Zeta',
      '/reports/orders?range=THIS_YEAR&search=Zeta',
      '/reports/inventory?search=Zeta',
      '/dashboard/summary?range=THIS_YEAR',
    ]) {
      const response = await asA(path);
      searched.push([path, response.status, leaks(response.body)]);
    }
    expect(searched.filter(([, status, leaked]) => status !== 200 || leaked.length > 0)).toEqual(
      [],
    );

    // B's ids used as A's filters are refused (422), not silently matched.
    const filtered: [string, number, string[]][] = [];
    for (const path of [
      `/products?categoryId=${secret.category.id}`,
      `/inventory?warehouseId=${secret.warehouse.id}`,
      `/stock-movements?productId=${secret.product.id}`,
      `/orders?customerId=${secret.customer.id}`,
      `/reports/sales?range=THIS_YEAR&productId=${secret.product.id}`,
      `/reports/orders?range=THIS_YEAR&customerId=${secret.customer.id}`,
      `/reports/inventory?warehouseId=${secret.warehouse.id}`,
    ]) {
      const response = await asA(path);
      filtered.push([path, response.status, leaks(response.body)]);
    }
    expect(filtered.filter(([, status, leaked]) => status !== 422 || leaked.length > 0)).toEqual(
      [],
    );
  });
});

describe('mass assignment: protected fields can never be set by a client', () => {
  it('rejects ownership, identity, status, and bookkeeping fields with 400 and changes nothing', async () => {
    const f = await salesFixture(app);
    const other = await salesFixture(app);
    const owner = f.team.owner.cookie;
    const before = await snapshot(f.org);
    const attempts: [string, () => request.Test][] = [
      [
        'product → other workspace',
        () =>
          api()
            .patch(`${f.base}/products/${f.pen.id}`)
            .set('Cookie', owner)
            .send({ organizationId: other.org }),
      ],
      [
        'product createdAt',
        () =>
          api()
            .patch(`${f.base}/products/${f.pen.id}`)
            .set('Cookie', owner)
            .send({ createdAt: '2020-01-01T00:00:00Z' }),
      ],
      [
        'product status',
        () =>
          api()
            .patch(`${f.base}/products/${f.pen.id}`)
            .set('Cookie', owner)
            .send({ status: 'ARCHIVED' }),
      ],
      [
        'customer isActive',
        () =>
          api()
            .patch(`${f.base}/customers/${f.customer.id}`)
            .set('Cookie', owner)
            .send({ isActive: false }),
      ],
      [
        'warehouse code/isActive',
        () =>
          api()
            .patch(`${f.base}/warehouses/${f.main.id}`)
            .set('Cookie', owner)
            .send({ isActive: false }),
      ],
      [
        'warehouse organizationId',
        () =>
          api()
            .post(`${f.base}/warehouses`)
            .set('Cookie', owner)
            .send({ name: 'X', code: 'X1', organizationId: other.org }),
      ],
      [
        'order status',
        () =>
          api()
            .post(`${f.base}/orders`)
            .set('Cookie', owner)
            .send({ customerId: f.customer.id, warehouseId: f.main.id, status: 'COMPLETED' }),
      ],
      [
        'order number/total',
        () =>
          api().post(`${f.base}/orders`).set('Cookie', owner).send({
            customerId: f.customer.id,
            warehouseId: f.main.id,
            orderNumber: 'SO-9999',
            total: '0.01',
          }),
      ],
      [
        'stock actor/before',
        () =>
          api().post(`${f.base}/inventory/receive`).set('Cookie', owner).send({
            warehouseId: f.main.id,
            productId: f.pen.id,
            quantity: 1,
            actorUserId: other.team.owner.user.id,
            quantityBefore: 0,
          }),
      ],
      [
        'workspace slug/owner',
        () =>
          api()
            .patch(f.base)
            .set('Cookie', owner)
            .send({ name: 'Ok', slug: 'stolen', ownerId: other.team.owner.user.id }),
      ],
      [
        'invitation organization',
        () =>
          api()
            .post(`${f.base}/invitations`)
            .set('Cookie', owner)
            .send({ email: 'x@test.example', role: 'STAFF', organizationId: other.org }),
      ],
      [
        'member role userId',
        () =>
          api()
            .patch(`${f.base}/members/${f.team.staff.memberId}/role`)
            .set('Cookie', owner)
            .send({ role: 'ADMIN', userId: other.team.owner.user.id }),
      ],
      [
        'appearance userId',
        () =>
          api()
            .put('/me/appearance')
            .set('Cookie', owner)
            .send({ userId: other.team.owner.user.id }),
      ],
    ];
    const results: [string, number][] = [];
    for (const [label, run] of attempts) {
      results.push([label, (await run()).status]);
    }
    expect(results.filter(([, status]) => status !== 400)).toEqual([]);
    // Escalating an invitation to OWNER is a business-rule refusal (403), not a shape error.
    const escalation = await api()
      .post(`${f.base}/invitations`)
      .set('Cookie', owner)
      .send({ email: 'x@test.example', role: 'OWNER' });
    expect([escalation.status, escalation.body.code]).toEqual([403, 'INVITATION_ROLE_FORBIDDEN']);
    expect(await snapshot(f.org)).toEqual(before);
    expect(await prisma.userAppearance.count()).toBe(0);
  });
});

describe('append-only ledgers (database triggers)', () => {
  it('refuse to update or delete stock movements and activity logs', async () => {
    const f = await salesFixture(app);
    await f.stock(f.main.id, f.pen.id, 5);
    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { organizationId: f.org },
    });
    const log = await prisma.activityLog.findFirstOrThrow({ where: { organizationId: f.org } });

    await expect(
      prisma.$executeRaw`UPDATE stock_movements SET quantity_delta = 999 WHERE id = ${movement.id}::uuid`,
    ).rejects.toThrow(/append-only/);
    await expect(prisma.stockMovement.delete({ where: { id: movement.id } })).rejects.toThrow(
      /append-only/,
    );
    await expect(
      prisma.activityLog.update({ where: { id: log.id }, data: { action: 'FORGED' } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$executeRaw`DELETE FROM activity_logs WHERE id = ${log.id}::uuid`,
    ).rejects.toThrow(/append-only/);
    expect(await prisma.stockMovement.findUniqueOrThrow({ where: { id: movement.id } })).toEqual(
      movement,
    );
    await expectLedgerConsistent(f.org);
  });

  it('still allow deleting a user: their history stays, with the actor cleared', async () => {
    const f = await salesFixture(app);
    const staff = f.team.staff;
    await api()
      .post(`${f.base}/inventory/receive`)
      .set('Cookie', staff.cookie)
      .send({ warehouseId: f.main.id, productId: f.pen.id, quantity: 3 })
      .expect(200);
    await prisma.organizationMember.delete({ where: { id: staff.memberId } });
    await prisma.user.delete({ where: { id: staff.user.id } });

    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { organizationId: f.org },
    });
    expect(movement.actorUserId).toBeNull();
    expect(movement.quantityDelta).toBe(3);
    expect(
      await prisma.activityLog.count({ where: { organizationId: f.org, actorUserId: null } }),
    ).toBeGreaterThan(0);
  });
});

describe('error responses stay sanitized', () => {
  it('a malformed JSON body is a generic 400 that never echoes the input', async () => {
    const response = await api()
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.c", "password": "SECRET-PASSWORD-123"')
      .expect(400);
    expect(response.body).toEqual({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: 'The request could not be processed.',
    });
    expect(JSON.stringify(response.body)).not.toContain('SECRET');
  });

  it('validation errors name the field but never echo a submitted password', async () => {
    const response = await api()
      .post('/auth/register')
      .send({ name: 'A', email: 'not-an-email', password: 'short' })
      .expect(400);
    expect(JSON.stringify(response.body)).not.toContain('short"');
    expect(response.body.details.map((detail: { field: string }) => detail.field).sort()).toEqual([
      'email',
      'password',
    ]);
  });
});
