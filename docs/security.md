# Security

How Nexora protects accounts, workspaces, and business data, as implemented (Phase 10A audit and hardening). Related: [authentication.md](authentication.md), [organizations-rbac.md](organizations-rbac.md), [database-design.md](database-design.md).

## Authentication

- **Passwords:** Argon2id, OWASP baseline parameters (`m=19456 KiB, t=2, p=1`), random salt, PHC string; only through `PasswordService`. Passwords are used exactly as entered (never trimmed or normalized), 12–128 characters, never logged, never echoed in validation errors (`validationError: { value: false }`), never returned. `password_hash` is never selected into a response (`AUTH_USER_SELECT`).
- **Login failures** are one generic `401 AUTH_INVALID_CREDENTIALS`; a missing account still runs a full Argon2 verification against a dummy hash, so timing doesn't reveal whether an email exists. Registration must reveal a taken email (`409 AUTH_EMAIL_TAKEN`) and is rate-limited.
- **Sessions:** a 256-bit random token (`crypto.randomBytes`, 43 base64url characters) in the cookie; the database stores only its SHA-256 (`sessions.token_hash`, unique, format-checked). Absolute lifetime `AUTH_SESSION_TTL_DAYS` (default 7, not sliding). Every request re-validates the session: unknown → `AUTH_UNAUTHENTICATED`, revoked → `AUTH_SESSION_REVOKED`, expired → `AUTH_SESSION_EXPIRED` (the cookie is cleared). Logout revokes the presented session in the database; other devices keep theirs. `last_seen_at` is updated at most every 5 minutes.
- **Session cleanup:** ended sessions (expired or revoked) are kept one day, then deleted opportunistically — the signing-in user's on every sign-in/registration, and everyone's on the first sign-in each hour per API process. No background job; active sessions are never touched.

### Session cookie

| Attribute             | Value                              | Notes                                                                                 |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------- |
| Name                  | `AUTH_COOKIE_NAME` (`app_session`) |                                                                                       |
| `HttpOnly`            | always                             | Unreadable by JavaScript; nothing auth-related is in `localStorage`                   |
| `SameSite`            | `Lax`                              | Not sent on cross-**site** requests; same-site origins are handled by the CSRF check  |
| `Secure`              | `AUTH_COOKIE_SECURE`               | `false` only for local HTTP; the API **refuses to start in production** unless `true` |
| `Path`                | `/`                                |                                                                                       |
| `Domain`              | not set                            | Host-only cookie: never shared with subdomains                                        |
| `Max-Age` / `Expires` | the session's expiry               |                                                                                       |

## CSRF

The session is an ambient cookie, so cross-site request forgery has to be addressed explicitly. `SameSite=Lax` stops cross-**site** requests, but not:

- other origins on the **same site** — another port on `localhost`, or a sibling subdomain in production — which still receive the cookie;
- **simple requests** that need no CORS preflight: the API (Nest/Express) also parses `application/x-www-form-urlencoded` bodies, so a plain HTML form could post to it. CORS only hides the response; it doesn't stop the request.

**Model: strict Origin validation for unsafe methods** (`csrfOriginCheck`, `src/common/security/http-security.ts`, registered in `configureApp` before any route, guard, or body validation):

| Request                                                           | Result                                                                                                                                         |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`, `HEAD`, `OPTIONS`                                          | Never checked (no state change)                                                                                                                |
| `POST`/`PUT`/`PATCH`/`DELETE` with `Origin` in `API_CORS_ORIGINS` | Allowed                                                                                                                                        |
| … with any other `Origin`, including `null`                       | `403 CSRF_ORIGIN_REJECTED`                                                                                                                     |
| … without `Origin` but with a `Referer`                           | The Referer's origin must be allowed                                                                                                           |
| … with neither header                                             | Allowed: browsers always send at least one on these methods, so this is a non-browser client (curl, tests), which can't ride a victim's cookie |

It covers every mutation, public ones included (login — against login CSRF —, logout, registration, invitation acceptance). The web app needs no changes: browsers send `Origin` on its cross-origin requests automatically. A token scheme (synchronizer/double-submit) was not added: with the cookie host-only and `SameSite=Lax`, the Origin check closes the remaining same-site gap without extra state. Verified in a real browser: a form-encoded POST from `http://localhost:4173` carried the session cookie and was refused with 403; nothing was created.

## CORS

- `API_CORS_ORIGINS`: an explicit list of **exact origins** (`scheme://host[:port]`, no path, no trailing slash — env validation rejects anything else and rejects `*`). In production every origin must be `https://`.
- Matching is exact (`Set` lookup): `http://localhost:51730`, `https://localhost:5173`, or `http://localhost:5173.evil.test` don't match `http://localhost:5173`.
- An unknown origin gets **no** CORS headers at all (not even `Access-Control-Allow-Credentials`), for preflights and requests, so the browser blocks credentialed access.

## Rate limiting and client IP

`@nestjs/throttler` with its in-memory store, per client IP:

| Route                             | Limit          |
| --------------------------------- | -------------- |
| `POST /auth/login`                | 10 / minute    |
| `POST /auth/register`             | 5 / 15 minutes |
| `GET /invitations/:token`         | 30 / minute    |
| `POST /invitations/:token/accept` | 10 / minute    |

Every request counts (successful or not). Over the limit: `429 RATE_LIMITED` with `Retry-After`, the same generic body for every route. Idle keys are evicted after their window (store sweep every minute), so memory is bounded by the clients active in the last window.

**Client IP / proxies:** `API_TRUST_PROXY` (Express `trust proxy`) defaults to `false`: the IP is the TCP peer and `X-Forwarded-For` is ignored, so it can't be spoofed to get a fresh bucket per request. Behind a reverse proxy, set a hop count (`1`) or the proxy addresses/ranges (`loopback`, `10.0.0.0/8`); `true` (trust anyone) is refused by env validation.

**Limitations:** in-memory and per process — fine for this single-instance deployment, not for several API instances (each counts separately; counters reset on restart). No per-account lockout. Only the authentication and invitation routes are limited.

## Authorization (RBAC)

- Order of checks: `SessionAuthGuard` (global) → `OrganizationAccessGuard` (membership from the **route's** `:organizationId`) → `@RequirePermissions` → service rules (e.g. role hierarchy, OWNER protection) → tenant-scoped queries.
- The permission matrix lives only in `packages/shared/src/rbac.ts`. STAFF cannot manage warehouses, adjust or transfer stock, process/ship/complete/cancel orders, archive customers or products, or manage the team; only OWNER can transfer ownership.
- **Enforced structurally:** `src/common/security/route-security.spec.ts` reads the real controller metadata and fails if any organization route lacks `OrganizationAccessGuard` or a declared, known permission, or if anything but the five intended routes (`/health`, `GET /invitations/:token`, login, logout, register) is public.
- **Verified over HTTP:** `test/database/security.db-spec.ts` calls 16 high-value mutations directly as OWNER, ADMIN, and STAFF; forbidden calls answer 403 and change nothing (orders, stock, movements, members, invitations, activity log compared before/after). The frontend's hiding of actions is UX only.

## Tenant isolation

- Organization-scoped data is only reachable under `/organizations/:organizationId`; the id is never read from a body or query (a structural test checks no other route takes it). Non-members and unknown workspaces get the same `404 ORGANIZATION_NOT_FOUND`.
- Every lookup of a sub-resource includes the organization id: another workspace's product, warehouse, customer, order, inventory row, invitation, or member answers exactly like an unknown id. Ids used as filters (`categoryId`, `warehouseId`, `productId`, `customerId`) in lists, reports, or bodies are verified with the organization (`422 …_NOT_FOUND`).
- Search never crosses workspaces: products, inventory, customers, orders, and the three reports searched for another workspace's unique names return nothing (`security.db-spec.ts`), alongside the per-domain isolation suites.
- In the database, references between tenant tables are composite foreign keys `(organization_id, id)`, so a cross-tenant reference can't be stored at all.
- **Appearance** is user-scoped: every query uses the session's user id; another user's profile is `404 APPEARANCE_PROFILE_NOT_FOUND`; a `userId` in a body is rejected.

## Invitations

256-bit token, only its SHA-256 stored, returned once in `inviteUrl`, never logged; 7-day expiry (`INVITATION_TTL_DAYS`). Acceptance requires a session whose email matches, runs in one transaction with a conditional update (exactly one acceptance wins, replays fail with `INVITATION_ALREADY_ACCEPTED`), and rejects expired and revoked invitations. Nobody can invite an OWNER; ADMIN can invite only STAFF. Covered by `invitations-api.db-spec.ts`.

## Input validation and mass assignment

Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` + `transform` (no implicit conversion); every body is a DTO class. Unknown fields — `organizationId`, `userId`, `createdAt`, `status`, `role`, `orderNumber`, `total`, `actorUserId`, `slug`, `ownerId`, … — are `400 VALIDATION_ERROR` and nothing is written. Status fields have their own endpoints (archive/restore, order actions). Organization, user, and actor always come from the session and route.

## Data integrity

- CHECK constraints, unique and composite keys, and the one-OWNER partial index: see [database-design.md](database-design.md#integrity-constraints).
- **Append-only ledgers (database-enforced since Phase 10A):** triggers on `stock_movements` and `activity_logs` refuse every `UPDATE` and `DELETE`, except the `actor_user_id → NULL` that PostgreSQL itself performs when a user is deleted. Before, only the application guaranteed it. Corrections are new movements.
- Stock: every change is one transaction with row locks in a fixed order; `before + delta = after`, the chain per inventory row, non-negative quantities, and balanced transfers are asserted by the DB tests (`expectLedgerConsistent`) and re-checked by every `npm run db:seed`.
- Order fulfillment (CONFIRMED → PROCESSING): order row lock, stock locks, validation of every line, inventory updates, one SALE movement per line, status change, and activity entry in one transaction; any failure rolls back everything. Concurrency is covered by `order-concurrency.db-spec.ts` (10 in stock, two orders of 7 → one succeeds, 3 left, one SALE; the same order processed 6 times at once → once).

## CSV exports

RFC 4180 quoting, CRLF, UTF-8 BOM, exact decimal strings, time zone in the date column header, at most 10,000 rows. Formula injection: text starting with `=`, `+`, `-`, `@` (also after leading spaces), a tab, or a carriage return gets a leading apostrophe; genuine numbers (`-12.50`) stay numeric (`src/reports/csv.ts`).

## Errors and logging

- `ApiExceptionFilter`: `AppException`s return their code and message; every other 4xx gets a generic body (parser errors never echo the request); every 5xx is `500 INTERNAL_ERROR` with no stack, SQL, path, or driver detail. Stack traces are logged server-side only.
- Logs contain user ids, never passwords, hashes, tokens, cookies, or email addresses (asserted in `auth-api.db-spec.ts` and `invitations-api.db-spec.ts`). Request bodies are not logged. Activity-log metadata is business data (e.g. the invited email, visible to workspace admins), never secrets.

## Security headers

- **API** (every response, `securityHeaders`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` (the API serves only JSON and CSV), `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, a restrictive `Permissions-Policy`, no `X-Powered-By`; `Strict-Transport-Security` in production.
- **Web app** (`apps/web/vite.config.ts`): the dev server sends `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy` (no CSP: Vite's hot reload injects inline scripts). `vite preview` (the production build) also sends a strict CSP: `script-src 'self'` plus the SHA-256 of the one inline startup script in `index.html`, `connect-src` limited to the API origin, `frame-ancestors 'none'`, `object-src 'none'`. `style-src` allows inline `style` attributes (React and the theme engine set them). Verified: no CSP violations, the startup script runs. **A production static host must send the same headers** (the hash changes if that script changes; it is computed at build time).

## Secrets and configuration

- `.env` is git-ignored and has never been committed; `.env.example` contains placeholders only.
- Env validation (`src/config/env.ts`) fails fast; in production it requires `AUTH_COOKIE_SECURE=true`, https CORS origins, and a non-empty `DB_PASSWORD`. Validation errors never print values.
- The demo password `demo-password-2026` exists only in the development seed, which refuses `NODE_ENV=production`.
- Database tests run only against a database whose name ends in `_test` and differs from `DB_NAME`; truncation re-checks `current_database()`. The HTTP test app replaces `PrismaService` with the test client.

## Dependencies

`npm audit` (production and development dependencies): 0 vulnerabilities at the Phase 10A and 10B audits (including the Phase 10B addition `@playwright/test`, a development dependency that uses the installed Edge and downloads no browser). Root `overrides` pin patched transitive versions (`mysql2`, `deepmerge-ts`). Upgrade deliberately, not in bulk.

## Verification

The controls above are exercised automatically (see [testing.md](testing.md)): API HTTP tests for CSRF, CORS, headers, proxy, and rate limits (`test/security.e2e-spec.ts`); the structural route test; database suites for sessions, RBAC on 16 mutations × 3 roles, tenant isolation including search, mass assignment, append-only triggers, invitations, and integrity (`security.db-spec.ts`, `integrity.db-spec.ts`, …); and real-browser E2E for the cookie, guest/protected routes, RBAC (UI and direct API), workspace isolation, CSV neutralization, and sanitized error pages. This is automated testing of the implemented controls — **not** a penetration test, a load test, or a review of a production deployment.

## Findings (Phase 10A / 10B audits)

Severity by technical impact on the current single-instance, locally hosted system. No BLOCKER or HIGH finding was identified.

| Severity      | Finding                                                                                                                                              | Status                                                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MEDIUM        | CSRF from same-site origins: SameSite=Lax doesn't stop another origin on the same site, and the API accepted form-encoded bodies without a preflight | **Fixed** (10A): Origin/Referer check on every unsafe method                                                                                                 |
| LOW           | Unknown origins received `Access-Control-Allow-Credentials` (no Allow-Origin, so browsers still blocked them)                                        | **Fixed** (10A)                                                                                                                                              |
| LOW           | Production config could start with an empty DB password or http CORS origins                                                                         | **Fixed** (10A): env validation fails closed                                                                                                                 |
| LOW           | Append-only ledgers were enforced only by application code                                                                                           | **Fixed** (10A): database triggers                                                                                                                           |
| LOW           | Ended sessions accumulated indefinitely                                                                                                              | **Fixed** (10A): opportunistic cleanup                                                                                                                       |
| LOW           | CSV formula injection after leading spaces                                                                                                           | **Fixed** (10A)                                                                                                                                              |
| LOW           | The root error page showed a crashed page's `error.message` to the user                                                                              | **Fixed** (10B): generic message; page-level boundaries keep the shell                                                                                       |
| LOW           | Rate limits are in memory, per process, per IP; no per-account lockout                                                                               | Open by design for one instance. Impact grows only with several API instances or a botnet. Future: shared store + per-account limits in the deployment phase |
| LOW           | The web CSP and headers are set by `vite preview` only                                                                                               | Open: the production host must send them (deployment phase)                                                                                                  |
| LOW           | Two concurrent invitations for one email can both be pending                                                                                         | Open: only one membership can result (unique constraint); future: partial unique index if invitations get an explicit expired state                          |
| INFORMATIONAL | Requests with neither Origin nor Referer pass the CSRF check                                                                                         | By design (non-browser clients)                                                                                                                              |
| INFORMATIONAL | `GET /health` is public and unthrottled                                                                                                              | Cheap (`SELECT 1`), reveals no internals; revisit behind the production proxy                                                                                |
| INFORMATIONAL | A database superuser can bypass the append-only triggers                                                                                             | Database administration trust boundary                                                                                                                       |
| INFORMATIONAL | Prisma's pg adapter prints a `pg` deprecation warning (concurrent `client.query`)                                                                    | Dependency internals; no functional effect; re-check on Prisma upgrades                                                                                      |

Product limitations (no password reset, email verification, or MFA) are scope decisions, not vulnerabilities.

## Known limitations

- Rate limits are in memory and per process; no per-account lockout; general API routes are not rate-limited.
- Requests with neither `Origin` nor `Referer` pass the CSRF check (non-browser clients by definition).
- No "sign out everywhere", no session rotation on role change (role changes take effect on the next request anyway, since permissions are checked per request), sessions are not bound to IP or device.
- No password reset, email verification, MFA, or breached-password check (out of scope so far).
- Two concurrent invitations for the same email can both be created (the pending check is in the application); only one membership can result.
- The web CSP is applied by `vite preview`; production hosting must replicate it. The append-only triggers can be bypassed by a database superuser (e.g. replica mode, used only by one test to backdate fixtures).
- `GET /health` is public and unthrottled (it runs `SELECT 1`).
