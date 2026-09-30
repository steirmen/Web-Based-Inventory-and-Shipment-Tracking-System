# Authentication

Email and password sign-in with **database-backed sessions** and an **HttpOnly cookie**. This covers authentication only ("who is this user?"). Authorization (roles, permissions, organization access) is not implemented yet.

| Area                     | Location                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| API module               | [`apps/api/src/auth/`](../apps/api/src/auth/)                                                                        |
| Session model            | `Session` in [`schema.prisma`](../apps/api/prisma/schema.prisma), migration `…_add_sessions`                         |
| Web auth state and pages | `apps/web/src/hooks/use-auth.ts`, `src/routes/guards.tsx`, `src/pages/login-page.tsx`, `src/pages/register-page.tsx` |
| Shared contracts         | `packages/shared/src/auth.ts` (types, input limits), `errors.ts` (error codes)                                       |

## Architecture

```text
Browser (localhost:5173)
   │  fetch(..., { credentials: 'include' })
   │  Cookie: app_session=<random token>        HttpOnly, SameSite=Lax, never visible to JS
   ▼
NestJS API (localhost:3000)
   │  SessionAuthGuard: SHA-256(token) → sessions.token_hash
   ▼
sessions  (token_hash, expires_at, revoked_at, last_seen_at)
   │  user_id
   ▼
users     (email, password_hash = Argon2id)
```

- The **raw session token exists only in the browser cookie**. The database stores its SHA-256 hash, so a database leak does not yield usable sessions.
- Nothing about the session is kept in `localStorage`, `sessionStorage`, URLs, or React state. The web app learns who is signed in only by calling `GET /auth/me`.

## API

All responses use `Cache-Control: no-store`. Errors use the standard body `{ statusCode, code, message, details? }` (see [Error responses](#error-responses)).

| Endpoint                                          | Auth                 | Success                         | Notes                                                                                 |
| ------------------------------------------------- | -------------------- | ------------------------------- | ------------------------------------------------------------------------------------- |
| `POST /auth/register` `{ name, email, password }` | public, rate-limited | `201 { user }` + session cookie | Signs the new user in immediately. `409 AUTH_EMAIL_TAKEN` if the email exists.        |
| `POST /auth/login` `{ email, password }`          | public, rate-limited | `200 { user }` + session cookie | Any failure is `401 AUTH_INVALID_CREDENTIALS`.                                        |
| `POST /auth/logout`                               | public               | `204` + cookie cleared          | Revokes the presented session. Idempotent; works when already signed out.             |
| `GET /auth/me`                                    | session              | `200 { user }`                  | `401` with `AUTH_UNAUTHENTICATED`, `AUTH_SESSION_EXPIRED`, or `AUTH_SESSION_REVOKED`. |

`user` is always exactly `{ id, name, email }`. Password hashes are never selected into a response.

### Registration flow

1. `ValidationPipe` validates `RegisterDto`:
   - name trimmed, 1–200 characters;
   - email trimmed and lowercased, valid format, at most 320 characters;
   - password 12–128 characters, **used exactly as typed** (never trimmed or case-folded).
2. If the normalized email already exists, respond `409 AUTH_EMAIL_TAKEN`. A unique-constraint race is mapped to the same response.
3. Hash the password with Argon2id and create the `User`.
4. Create a session, then set the cookie and return `{ user }`.

Registration does not create an organization.

### Login flow

1. Validate the input shape (`LoginDto`) and normalize the email.
2. Load the user. If the user is missing or has no password, run an Argon2 verification against a dummy hash anyway, so timing does not reveal whether the account exists.
3. Wrong password, unknown email, and password-less user all return the same `401 AUTH_INVALID_CREDENTIALS` "Invalid email or password."
4. On success, create a **new** session (other sessions stay valid), set the cookie, and return `{ user }`.

### Logout flow

1. Read the token from the cookie, if present.
2. `UPDATE sessions SET revoked_at = now() WHERE token_hash = sha256(token) AND revoked_at IS NULL`.
3. Clear the cookie and return `204`. Revocation happens on the server, so replaying the old cookie is rejected.

### Authentication guard

`SessionAuthGuard` is registered globally (`APP_GUARD`). **Every route requires a valid session unless it is marked `@Public()`.** Currently public: `/health`, `/auth/register`, `/auth/login`, `/auth/logout`.

The guard:

1. reads the cookie;
2. hashes the token and looks up the session by `token_hash`;
3. rejects the session if it is unknown, revoked, or expired, and clears the cookie;
4. loads the user;
5. sets `request.auth = { user, session }`.

It also refreshes `last_seen_at` at most every 5 minutes.

In controllers, use `@CurrentUser()` to get the `AuthUser`. New business controllers need nothing extra to require authentication.

## Session model

| Column         | Notes                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | UUIDv7                                                                                                                                        |
| `user_id`      | FK → `users`, **ON DELETE CASCADE** (deleting a user deletes their sessions)                                                                  |
| `token_hash`   | `CHAR(64)`, UNIQUE. SHA-256 hex of the token; a CHECK constraint allows only `^[0-9a-f]{64}$`, so a raw (base64url) token can never be stored |
| `expires_at`   | Absolute expiry; CHECK `expires_at > created_at`                                                                                              |
| `created_at`   |                                                                                                                                               |
| `last_seen_at` | Last authenticated request (throttled updates)                                                                                                |
| `revoked_at`   | Set on logout; NULL while active                                                                                                              |

Indexes:

- `UNIQUE (token_hash)`: the per-request lookup;
- `(user_id)`: a user's sessions, and the cascade;
- `(expires_at)`: cleanup of expired rows.

**Tokens:** 32 bytes from `crypto.randomBytes` (256 bits), base64url-encoded (43 characters). Tokens are not derived from IDs, timestamps, or UUIDs. SHA-256 rather than Argon2 is correct here: the input is high-entropy random data, so a fast deterministic hash is safe and enables an indexed lookup.

## Session expiration

- **Absolute lifetime:** `AUTH_SESSION_TTL_DAYS`, default **7 days**, allowed range 1–90. A week balances convenience for a daily-use business tool against limiting how long a stolen cookie stays useful. The cookie's `Max-Age` matches.
- The lifetime is not sliding and there are no refresh tokens: after expiry the user signs in again. The server rejects expired sessions (`AUTH_SESSION_EXPIRED`) even if the browser still sends the cookie.
- Expired and revoked rows stay in the table. A periodic cleanup (`DELETE … WHERE expires_at < now() - interval '30 days'`, served by the `expires_at` index) is not scheduled yet.

## Session revocation

Logout sets `revoked_at` in the database. Deleting the cookie alone is not relied on. The guard rejects revoked sessions with `AUTH_SESSION_REVOKED`. A user can hold several sessions (devices); logout revokes only the current one.

## Password hashing

- **Argon2id** via the `argon2` package, with the OWASP baseline parameters `m=19456 KiB, t=2, p=1` (about 25 ms per hash on a developer machine). The hash is a PHC string (`$argon2id$v=19$m=19456,p=1,t=2$<salt>$<hash>`) with a random salt. Its parameters are stored inside the hash, so they can be raised later without invalidating existing passwords.
- All hashing goes through `PasswordService` (`hashPassword` / `verifyPassword`) in `src/auth/password/`. Verification is constant-time and returns `false` for malformed hashes.
- `users.password_hash` is nullable: a user may exist without a password (e.g. future invitations). Such users cannot sign in.

## Cookie security

Configured in one place: `SessionCookieService`.

| Attribute             | Value                                      | Why                                                                                    |
| --------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| Name                  | `AUTH_COOKIE_NAME` (default `app_session`) | Neutral; no branding                                                                   |
| `HttpOnly`            | always                                     | Browser JavaScript cannot read the token                                               |
| `SameSite`            | `Lax`                                      | Not sent on cross-site POST/fetch: the main CSRF mitigation                            |
| `Secure`              | `AUTH_COOKIE_SECURE`                       | `false` for local HTTP; **the API refuses to start in production unless it is `true`** |
| `Path`                | `/`                                        |                                                                                        |
| `Max-Age` / `Expires` | session expiry                             |                                                                                        |

**CSRF:** state-changing endpoints accept JSON bodies only, so a cross-origin request needs a CORS preflight, which only allowed origins pass. Combined with `SameSite=Lax`, this blocks cross-site request forgery for the current endpoints. A dedicated CSRF token is not implemented.

## CORS and credentials

The frontend (`:5173`) and API (`:3000`) are different origins, but the same _site_ (`localhost`), so the `SameSite=Lax` cookie is sent.

- The web client sends every request with `credentials: 'include'`.
- The API enables CORS with `credentials: true` for the explicit origins in `API_CORS_ORIGINS`. Env validation **rejects `*`**, because browsers forbid wildcard origins with credentials and it would be insecure.
- Open the app at `http://localhost:5173`, not `127.0.0.1`: a different host is a different site, and the cookie would not be sent.

## Rate limiting

`@nestjs/throttler`, per client IP:

| Endpoint              | Limit                   |
| --------------------- | ----------------------- |
| `POST /auth/login`    | 10 requests / minute    |
| `POST /auth/register` | 5 requests / 15 minutes |

Exceeding a limit returns `429 RATE_LIMITED` with a `Retry-After` header.

**Limitation:** counters are kept **in memory** in the API process. That is fine for one local or single-instance API, but **not sufficient for a horizontally scaled deployment**: each instance counts separately and counters reset on restart. That needs a shared store (for example Redis) and per-account limits. Behind a reverse proxy, configure Express `trust proxy` so the real client IP is used.

## Error responses

```json
{ "statusCode": 401, "code": "AUTH_INVALID_CREDENTIALS", "message": "Invalid email or password." }
```

| Code                          | Status | When                                                                                 |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `VALIDATION_ERROR`            | 400    | Invalid input. `details: [{ field, messages[] }]`; submitted values are never echoed |
| `AUTH_INVALID_CREDENTIALS`    | 401    | Login failed (deliberately unspecific)                                               |
| `AUTH_UNAUTHENTICATED`        | 401    | No cookie, or unknown token                                                          |
| `AUTH_SESSION_EXPIRED`        | 401    | Session past `expires_at`                                                            |
| `AUTH_SESSION_REVOKED`        | 401    | Session was signed out                                                               |
| `AUTH_EMAIL_TAKEN`            | 409    | Registration with an existing email                                                  |
| `RATE_LIMITED`                | 429    | Too many attempts                                                                    |
| `BAD_REQUEST`, `NOT_FOUND`, … | 4xx    | Generic framework errors, returned with a generic message                            |
| `INTERNAL_ERROR`              | 500    | Unexpected error: logged server-side, no details or stack trace returned             |

`ApiExceptionFilter` guarantees this shape. Only `AppException` messages reach clients; other errors (for example JSON parse errors, which quote the request body) get a generic message.

**Account enumeration:** login never reveals whether an email exists. Registration must reveal it (`AUTH_EMAIL_TAKEN`) so users can recover; this is rate-limited.

**Logging:** only user IDs are logged ("User registered: <id>"). Passwords, password hashes, session tokens, and email addresses are never logged. A test asserts this.

## Frontend

- **State:** `useAuth()` wraps `useQuery(['auth', 'me'], GET /auth/me)`. A 401 resolves to `null`. Resulting states: `loading` | `authenticated` | `unauthenticated` | `error` (API unreachable). Login and register write the returned user into that query. Logout clears it and every other cached query. Any other request that fails with a 401 also sets it to `null`, which triggers a redirect.
- **Routes:**

  | Route                 | Access                       |
  | --------------------- | ---------------------------- |
  | `/`                   | Authenticated (landing page) |
  | `/login`, `/register` | Guest only                   |
  | `/health-check`, 404  | Public                       |
  - `RequireAuth` waits for the session check, so there is no flash of the login page, then redirects visitors to `/login` with `state.from`. After sign-in they return there; only internal paths are allowed, so it can't be used as an open redirect.
  - `RequireGuest` sends signed-in users back into the app.

- **Forms:** client validation mirrors the API limits (`AUTH_LIMITS` from `@app/shared`). The submit button is disabled with a spinner while pending, which prevents duplicate submits. Server field errors map onto fields; other failures show an alert. Credentials are never logged.

## Development credentials

> **DEVELOPMENT ONLY.** These accounts exist only in a local database seeded with `npm run db:seed`. They are not production credentials and must never be used anywhere else.

| Email                           | Password             | Role in "Demo Trading Co." |
| ------------------------------- | -------------------- | -------------------------- |
| `owner@demo-trading.example`    | `demo-password-2026` | OWNER                      |
| `staff@demo-trading.example`    | `demo-password-2026` | STAFF                      |
| `admin@demo-trading.example`    | `demo-password-2026` | ADMIN                      |
| `newcomer@demo-trading.example` | `demo-password-2026` | — (no workspace)           |

The seed stores only Argon2id hashes. For databases seeded before authentication existed, re-running `npm run db:seed` sets this password on the password-less demo users without changing anything else. Roles are enforced since Phase 4; see [organizations-rbac.md](organizations-rbac.md).

## Testing

| Suite                                                              | Command           | Covers                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/auth/**/*.spec.ts`, `src/config/env.spec.ts`                  | `npm run test`    | Argon2id hashing and verification, token generation and hashing, cookie/CORS config validation                                                                                                                                                                  |
| `test/database/auth-api.db-spec.ts`                                | `npm run test:db` | Real HTTP pipeline against the test DB: register/login/me/logout, normalization, validation, duplicate email, expired and revoked sessions, cookie attributes, token hashing, no hash in responses, nothing sensitive logged, rate limits, CORS, generic errors |
| `test/database/sessions.db-spec.ts`                                | `npm run test:db` | Session table: unique and format-checked hash, relation, expiry and revocation queries, cascade on user delete                                                                                                                                                  |
| `apps/web/src/pages/*-page.test.tsx`, `src/routes/guards.test.tsx` | `npm run test`    | Login/register UI states, auth state updates, protected and guest redirects, no redirect while loading, logout                                                                                                                                                  |
