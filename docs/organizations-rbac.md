# Organizations, workspaces, and RBAC

How users, organizations ("workspaces" in the UI), memberships, roles, and invitations work, and how access is enforced.

> **Frontend role visibility is not a security boundary.**
>
> **Organization membership and permissions are always checked by the API.**

| Area                                | Location                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Role and permission matrix (shared) | [`packages/shared/src/rbac.ts`](../packages/shared/src/rbac.ts)                                                                                  |
| API module                          | [`apps/api/src/organizations/`](../apps/api/src/organizations/)                                                                                  |
| Access guard                        | `organization-access.guard.ts`, `organization-context.ts`                                                                                        |
| Invitation model and migration      | `OrganizationInvitation` in [`schema.prisma`](../apps/api/prisma/schema.prisma), migration `…_add_organization_invitations`                      |
| Web                                 | `layouts/organization-layout.tsx`, `pages/{onboarding,organizations,organization-*,team,invitation}-page.tsx`, `components/{organization,team}/` |

The three concerns are kept separate:

| Question                                    | Answered by                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| "Who are you?"                              | Authentication: `AuthModule`, session cookie, global `SessionAuthGuard` ([authentication.md](authentication.md)) |
| "Which organizations can you access?"       | Membership: `OrganizationAccessGuard`                                                                            |
| "What can you do inside this organization?" | RBAC: `@RequirePermissions()` plus role-hierarchy checks in the services                                         |

## Multi-tenancy

- A **user** is global. An **organization** is a tenant. An **organization member** row links them with one role (`OWNER`, `ADMIN`, or `STAFF`).
- A user can belong to **any number of organizations**, with a different role in each. `UNIQUE (organization_id, user_id)` prevents duplicate memberships.
- Registration never creates an organization. After signing in, a user without workspaces is sent to onboarding.
- Creating an organization (`POST /organizations`) inserts the organization, the creator's **OWNER** membership, and an `ORGANIZATION_CREATED` activity entry **in one transaction**. The slug is globally unique, so a retried request fails with `409 ORGANIZATION_SLUG_TAKEN` instead of creating duplicates.
- **Slugs** are lowercase letters, digits, and single hyphens, 3–50 characters. They are validated by the API and enforced by a database CHECK constraint. Slugs are **immutable**; only the name can be changed. The web app suggests a slug from the name, but the API is authoritative and never silently changes the value it receives.

## Organization context

Every organization-scoped endpoint lives under `/organizations/:organizationId/...` and is protected by `OrganizationAccessGuard`, which runs after the global authentication guard:

```text
authenticated user (session cookie)
      ↓
:organizationId from the ROUTE (never the body or query)
      ↓
membership lookup: one indexed query on (organization_id, user_id)
      ↓
no membership / unknown id / malformed id → 404 ORGANIZATION_NOT_FOUND
      ↓
role → required permissions (@RequirePermissions) → missing → 403 ORGANIZATION_FORBIDDEN
      ↓
request.organizationContext = { user, organization, membership }
```

- **Non-members get exactly the same response as a non-existent organization** (`404 ORGANIZATION_NOT_FOUND`, "Workspace not found or you don't have access to it."). The same single query serves both cases, so neither the response body nor the timing reveals whether an organization exists. Membership is checked before any organization data is loaded.
- Resource ids inside an organization (`:memberId`, `:invitationId`) are always looked up **together with the organization id**. A member id from another organization is `404 MEMBERSHIP_NOT_FOUND`. Malformed ids are treated as unknown and never reach the database.
- Handlers read the verified context with `@OrgContext()`, `@CurrentOrganization()`, or `@CurrentMembership()`.

### Adding an organization-scoped endpoint

```ts
@Controller('organizations/:organizationId')
@UseGuards(OrganizationAccessGuard) // membership check for every route in the class
export class ProductsController {
  @Post('products')
  @RequirePermissions('PRODUCTS_CREATE') // add the permission to ROLE_PERMISSIONS first
  create(@OrgContext() context: OrganizationContext, @Body() body: CreateProductDto) {
    // Always scope queries with context.organization.id, never with an id from the body.
  }
}
```

## RBAC

### Permissions

Permissions are defined once in `@app/shared` (`PERMISSIONS`, `ROLE_PERMISSIONS`). The API enforces them; the web app imports the same map only to decide what to show.

| Permission                                         | OWNER | ADMIN | STAFF |
| -------------------------------------------------- | :---: | :---: | :---: |
| `ORGANIZATION_READ`: view the organization         |  ✅   |  ✅   |  ✅   |
| `ORGANIZATION_UPDATE`: rename                      |  ✅   |  ✅   |  ❌   |
| `MEMBERS_READ`: view members                       |  ✅   |  ✅   |  ✅   |
| `MEMBERS_INVITE`: create, list, revoke invitations |  ✅   | ✅\*  |  ❌   |
| `MEMBERS_UPDATE_ROLE`: change roles                |  ✅   | ✅\*  |  ❌   |
| `MEMBERS_REMOVE`: remove members                   |  ✅   | ✅\*  |  ❌   |
| `OWNERSHIP_TRANSFER`                               |  ✅   |  ❌   |  ❌   |

\* Also restricted by the role hierarchy below.

### Role hierarchy

`ASSIGNABLE_ROLES` defines which roles a role may **grant** (by invitation or role change), and equally which members it may **manage** (change or remove):

| Actor | May grant / manage |
| ----- | ------------------ |
| OWNER | ADMIN, STAFF       |
| ADMIN | STAFF              |
| STAFF | —                  |

Consequences:

- **OWNER** invites ADMIN or STAFF, switches members between ADMIN and STAFF, removes ADMIN or STAFF, transfers ownership, and renames the organization.
- **ADMIN** invites STAFF only, removes STAFF only, and revokes only STAFF invitations. An ADMIN cannot grant ADMIN, and cannot modify the OWNER or another ADMIN. With the current three roles, the only role an ADMIN may assign is STAFF, so in practice an ADMIN cannot change anyone's role. The rule structure is ready for more roles.
- **STAFF** can view the organization and its members.
- Nobody manages themselves through these endpoints (the OWNER is never manageable, and an ADMIN cannot manage ADMINs).
- **OWNER is never assignable.** The generic role endpoint rejects `role: OWNER` (`MEMBER_ROLE_CHANGE_FORBIDDEN`) and rejects any change to the current owner (`OWNER_TRANSFER_REQUIRED`). Invitations can never grant OWNER, which a database CHECK constraint also enforces.

The target checks run **inside the transaction** against the target's current row. Updates are conditional on the role that was checked (`UPDATE … WHERE id = $1 AND role = $checkedRole`), so a concurrent change fails with `409 CONFLICT` instead of being overwritten.

## Ownership

- **Exactly one owner per organization.**
  - **Database:** at most one. The partial unique index `organization_members_one_owner_per_organization ON organization_members (organization_id) WHERE role = 'OWNER'` is created in migration SQL; Prisma does not model partial indexes and ignores this one when diffing.
  - **Application:** at least one. The owner cannot be removed or demoted through member management (`OWNER_TRANSFER_REQUIRED`), and there is no "leave organization" flow for owners.
- **Transfer** (`POST /organizations/:id/ownership/transfer { targetMemberId }`, OWNER only), in **one transaction**:
  1. Load the target within this organization, or return `404 MEMBERSHIP_NOT_FOUND` (other organizations' members included).
  2. Demote the caller: `OWNER → ADMIN`, conditional on still being owner, otherwise `403`.
  3. Promote the target: `→ OWNER`.
  4. Record `OWNERSHIP_TRANSFERRED`.

  Demoting first keeps the unique index satisfied, and other transactions never see an intermediate state.

## Members

| Endpoint                                                     | Permission          | Notes                                                                                                                         |
| ------------------------------------------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `GET /organizations/:id/members`                             | MEMBERS_READ        | Returns `id` (membership), `userId`, `name`, `email`, `role`, `createdAt`, ordered OWNER → ADMIN → STAFF. No security fields. |
| `PATCH /organizations/:id/members/:memberId/role` `{ role }` | MEMBERS_UPDATE_ROLE | Hierarchy rules above. Setting the same role is a no-op.                                                                      |
| `DELETE /organizations/:id/members/:memberId`                | MEMBERS_REMOVE      | Deletes only the membership: the user account, and memberships in other organizations, remain. Access is lost immediately.    |

## Invitations

No email provider is integrated yet. An invitation produces a **link** that the inviter copies and shares.

| Endpoint                                                | Auth                          | Notes                                                                                                                   |
| ------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `POST /organizations/:id/invitations` `{ email, role }` | MEMBERS_INVITE plus hierarchy | Returns `inviteUrl` **once**                                                                                            |
| `GET /organizations/:id/invitations`                    | MEMBERS_INVITE                | Latest 100, with derived `status` (`PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED`) and `invitedBy.name`. No token or hash. |
| `DELETE /organizations/:id/invitations/:invitationId`   | MEMBERS_INVITE plus hierarchy | Idempotent; an ADMIN cannot revoke ADMIN invitations                                                                    |
| `GET /invitations/:token`                               | public (rate-limited)         | Organization id and name, invited email, role, expiry, status. Nothing else.                                            |
| `POST /invitations/:token/accept`                       | session (rate-limited)        | See the acceptance rules below                                                                                          |

- **Token:** 32 random bytes (256 bits) as base64url. The link is `WEB_APP_URL/invite/<token>`. The database stores only `SHA-256(token)` (`token_hash`, unique, CHECK-enforced hex format). The raw token is never persisted, logged, or written to activity metadata. Lookups hash the presented token, and malformed tokens are rejected before any query.
- **Expiry:** `INVITATION_TTL_DAYS`, default **7 days**, checked against server time.
- **Creation rules:**
  - the email is normalized (trimmed, lowercase);
  - OWNER is never allowed, and the role must be grantable by the inviter (`INVITATION_ROLE_FORBIDDEN`);
  - existing members (including the owner) are rejected with `MEMBERSHIP_ALREADY_EXISTS`;
  - a second **pending** invitation for the same email is rejected with `INVITATION_ALREADY_PENDING`. Revoke the old one to issue a new link.
- **Acceptance** (`POST /invitations/:token/accept`), in one transaction:
  1. hash the token and find the invitation (`404 INVITATION_NOT_FOUND`);
  2. reject accepted (`409 INVITATION_ALREADY_ACCEPTED`), revoked (`410 INVITATION_REVOKED`), and expired (`410 INVITATION_EXPIRED`) invitations;
  3. **require that the signed-in user's email equals the invited email** (`403 INVITATION_EMAIL_MISMATCH`). An invitation is never attached to a different account;
  4. reject existing members (`409 MEMBERSHIP_ALREADY_EXISTS`);
  5. mark it accepted with a conditional update, so exactly one concurrent acceptance wins;
  6. create the membership with the invited role;
  7. record `INVITATION_ACCEPTED`.

  Any failure rolls back everything.

- **Database rules:**
  - role ≠ OWNER;
  - normalized email;
  - `accepted_at` and `revoked_at` are mutually exclusive;
  - `expires_at > created_at`.

  Invitations are deleted with their organization (no orphans). If the inviter is deleted, `invited_by_user_id` becomes NULL and the history is kept.

## Activity log

Organization mutations write an `activity_logs` row **in the same transaction** as the change (`recordActivity(tx, …)`), so a mutation and its audit entry commit or roll back together. Rejected requests write nothing.

| Action                  | Entity                 | Metadata                                          |
| ----------------------- | ---------------------- | ------------------------------------------------- |
| `ORGANIZATION_CREATED`  | Organization           | name, slug                                        |
| `ORGANIZATION_UPDATED`  | Organization           | `name: { from, to }` (only when the name changes) |
| `MEMBER_ROLE_CHANGED`   | OrganizationMember     | userId, from, to                                  |
| `MEMBER_REMOVED`        | OrganizationMember     | userId, email, role                               |
| `OWNERSHIP_TRANSFERRED` | Organization           | from/to user and member ids                       |
| `INVITATION_CREATED`    | OrganizationInvitation | email, role, expiresAt                            |
| `INVITATION_REVOKED`    | OrganizationInvitation | email, role                                       |
| `INVITATION_ACCEPTED`   | OrganizationInvitation | email, role, memberId                             |

Every row has `organizationId`, `actorUserId`, `action`, `entityType`, `entityId`, and `createdAt`. Metadata never contains passwords, password hashes, session tokens, or invitation tokens or hashes; tests assert this.

## Frontend organization routing

| Route                           | Purpose                                                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                             | Signed in: no workspaces → `/onboarding`; the last opened workspace (if still in the list) or the only one → `/org/:id`; otherwise → `/organizations` |
| `/onboarding`                   | Create a workspace (also used for "create another workspace")                                                                                         |
| `/organizations`                | All of the user's workspaces with role and member count                                                                                               |
| `/org/:organizationId`          | Workspace home (temporary; not the dashboard)                                                                                                         |
| `/org/:organizationId/team`     | Members, role changes, removal, ownership transfer, invitations                                                                                       |
| `/org/:organizationId/settings` | Name (OWNER/ADMIN), immutable slug                                                                                                                    |
| `/invite/:token`                | Public invitation page: sign in, email-mismatch guidance, accept                                                                                      |

- **The URL identifies the organization.** There is no "active organization" on the session or in auth state, so tabs are independent: two tabs can show two different workspaces.
- `OrganizationLayout` loads `GET /organizations/:id`. A 404 shows "Workspace not found or you don't have access to it." without any data from that organization. On success it provides `{ organization, role, can(), canAssign(), canManage() }` to the pages.
- **`<Can permission>` and the role checks only hide or show controls.** The API authorizes every action again. After a 403 or 404 from a mutation, the app refetches the organization so the UI reflects the current role.
- The last opened workspace id is kept in `localStorage` purely to reopen it from `/`. It is ignored unless the server's list of the user's organizations contains it.
- The workspace switcher in the header lists only organizations returned by `GET /organizations`, and switching is ordinary navigation.
- The invite page preserves `/invite/:token` through sign-in or registration (`location.state.from`) and prefills the invited email.

## Error codes

| Code                                       | Status | Meaning                                                   |
| ------------------------------------------ | ------ | --------------------------------------------------------- |
| `ORGANIZATION_NOT_FOUND`                   | 404    | Unknown organization **or** not a member                  |
| `ORGANIZATION_FORBIDDEN`                   | 403    | Member lacks the permission                               |
| `ORGANIZATION_SLUG_TAKEN`                  | 409    | Slug in use                                               |
| `MEMBERSHIP_NOT_FOUND`                     | 404    | Member id not in this organization                        |
| `MEMBERSHIP_ALREADY_EXISTS`                | 409    | Inviting or accepting an existing member                  |
| `MEMBER_ROLE_CHANGE_FORBIDDEN`             | 403    | Role not assignable, or target not manageable             |
| `MEMBER_REMOVAL_FORBIDDEN`                 | 403    | Target not manageable                                     |
| `OWNER_TRANSFER_REQUIRED`                  | 403    | Tried to change or remove the owner                       |
| `INVITATION_NOT_FOUND`                     | 404    | Unknown or malformed token or id                          |
| `INVITATION_EXPIRED`, `INVITATION_REVOKED` | 410    | No longer usable                                          |
| `INVITATION_ALREADY_ACCEPTED`              | 409    | Already used                                              |
| `INVITATION_ALREADY_PENDING`               | 409    | Pending invitation exists for that email                  |
| `INVITATION_EMAIL_MISMATCH`                | 403    | Signed in with a different email                          |
| `INVITATION_ROLE_FORBIDDEN`                | 403    | Role not grantable by the caller                          |
| `CONFLICT`                                 | 409    | Concurrent modification, or transfer to the current owner |

## Security principles

- **Never trust organization ids from the browser.** They select _which_ organization is requested; the membership lookup decides _whether_ access is allowed.
- Every organization-scoped endpoint uses `OrganizationAccessGuard` and `@RequirePermissions`. Never query tenant data with an id that has not passed through it.
- The OWNER role is protected: no generic assignment, removal, or demotion. Ownership moves only through the dedicated transfer.
- Raw invitation tokens are never stored, logged, or put into activity metadata.
- Frontend role checks are UX only. The API is authoritative.

## Development accounts

> **DEVELOPMENT ONLY**, created by `npm run db:seed`. The password for all of them is `demo-password-2026`.

| Email                           | In "Demo Trading Co."                      |
| ------------------------------- | ------------------------------------------ |
| `owner@demo-trading.example`    | OWNER                                      |
| `admin@demo-trading.example`    | ADMIN                                      |
| `staff@demo-trading.example`    | STAFF                                      |
| `newcomer@demo-trading.example` | none: try onboarding, or invite and accept |
