# Local development

This project runs entirely on the host machine: Node.js for the API and web app, and a native PostgreSQL installation for the database. No Docker or WSL is involved.

## 1. Prerequisites

| Tool       | Version                                   | Check            |
| ---------- | ----------------------------------------- | ---------------- |
| Node.js    | 22.22+ (24 LTS recommended, see `.nvmrc`) | `node --version` |
| npm        | 10+                                       | `npm --version`  |
| Git        | any recent                                | `git --version`  |
| PostgreSQL | 16 or newer                               | `psql --version` |

## 2. Install PostgreSQL on Windows

1. Download the installer from <https://www.postgresql.org/download/windows/> (EDB installer), or use `winget search PostgreSQL` and install the latest version.
2. During setup:
   - Keep the default port **5432**.
   - Set a password for the **postgres** superuser and note it; it goes into `.env`.
   - Stack Builder is not needed.
3. The installer registers a Windows service (for example `postgresql-x64-18`) that starts automatically. Check it with:

   ```powershell
   Get-Service postgresql*
   ```

4. Optional: add `C:\Program Files\PostgreSQL\<version>\bin` to your `PATH` so `psql` is available in any terminal.

## 3. Create the development database

Using `psql` (or pgAdmin → _Databases → Create_):

```powershell
psql -U postgres -h localhost -c "CREATE DATABASE app_development;"
```

Optionally, use a dedicated role instead of the `postgres` superuser. `CREATEDB` is required because `prisma migrate dev` creates a temporary shadow database:

```sql
CREATE ROLE app_dev WITH LOGIN PASSWORD 'choose-a-password' CREATEDB;
CREATE DATABASE app_development OWNER app_dev;
```

## 4. Configure the environment

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set `DB_USER`, `DB_PASSWORD`, and `DB_NAME` to match step 3. Every variable is documented in [`.env.example`](../.env.example).

- The API and Prisma assemble the PostgreSQL connection string from the `DB_*` values and URL-encode credentials, so passwords may contain any characters.
- `.env` is git-ignored. Never commit real credentials.

## 5. Install and verify

```powershell
npm install        # also builds @app/shared and generates the Prisma client
npm run db:check   # Prisma executes `SELECT 1` against the configured database
npm run db:deploy  # apply all migrations (creates tables, constraints, indexes)
npm run db:seed    # load the fictional demo organization (safe to re-run)
npm run test:db    # database integration tests (uses the separate DB_TEST_NAME database)
npm run dev        # API on http://localhost:3000, web app on http://localhost:5173
```

Open <http://localhost:5173>. You are redirected to the sign-in page. Register a new account, or use a seeded demo account.

> **Development-only credentials**, created by `npm run db:seed`. They are not production credentials. The password is `demo-password-2026` for `owner@`, `admin@`, `staff@`, and `newcomer@demo-trading.example`.

Always use `http://localhost:5173`, not `127.0.0.1`, so the session cookie is shared with the API on `localhost`. <http://localhost:5173/health-check> should report **Operational** for both checks.

## 6. Working with the schema

- Edit `apps/api/prisma/schema.prisma`, then run `npm run db:migrate -- --name <change>` to create and apply a migration.
- The database tests use `DB_TEST_NAME` (default `app_test`) on the same server. It is created automatically and **emptied before every test**, so never point it at data you care about.
- To start the development database over, drop and recreate `app_development` (step 3), then run `npm run db:deploy && npm run db:seed`.

See [database-design.md](database-design.md) for the model, tenancy rules, delete strategy, and constraints.

## Sharing a local demo

The web app calls the API through `/api` (`VITE_API_BASE_URL=/api`): Vite (dev and preview) forwards `/api/*` to `http://localhost:$API_PORT` without the prefix, so the API's routes are unchanged and the whole app is one origin. That lets you show your local app to others with one [Cloudflare Quick Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) URL — local demos only, not a deployment.

```bash
npm run dev
cloudflared tunnel --url http://localhost:5173
```

Open the printed `https://<random>.trycloudflare.com` URL. What keeps it safe:

- Only the web server is exposed. The API (:3000) and PostgreSQL stay on localhost; the API is reached only through the proxy.
- Vite accepts the `*.trycloudflare.com` host (`server.allowedHosts`); other unknown hosts stay blocked.
- The API's CSRF/CORS allow-list is unchanged. The proxy replaces the Origin of **same-origin** requests (Origin host = the host the page was loaded from) with `http://localhost:5173`, which the API allows; requests from any other site keep their Origin and are still refused (`403 CSRF_ORIGIN_REJECTED`).
- The session cookie is host-only, HttpOnly, `SameSite=Lax` on the tunnel host.
- Everyone behind the tunnel shares one client IP for the API (the proxy), so the login rate limit (10/minute) is shared.
- Anyone with the URL can reach the sign-in page while the tunnel runs; stop it (Ctrl+C) when the demo is over, and use demo accounts.

## Troubleshooting

| Symptom                                                | Likely cause / fix                                                                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `P1001: Can't reach database server at localhost:5432` | PostgreSQL service not running (`Start-Service postgresql-x64-<version>`), or a different port — check `DB_PORT`.                                                              |
| `P1000: Authentication failed`                         | Wrong `DB_USER` / `DB_PASSWORD`.                                                                                                                                               |
| `P1003: Database ... does not exist`                   | Create it (step 3) or fix `DB_NAME`.                                                                                                                                           |
| API exits with `Invalid environment configuration`     | `.env` is missing or incomplete; compare with `.env.example`.                                                                                                                  |
| Health-check page shows **API unreachable**            | Start the API (`npm run dev:api`); confirm `VITE_API_BASE_URL` matches `API_PORT`. Restart Vite after editing `.env`.                                                          |
| Signed in, but reloading shows the sign-in page again  | You opened the app via `127.0.0.1`, or `AUTH_COOKIE_SECURE=true` over plain HTTP. Use `http://localhost:5173` and `AUTH_COOKIE_SECURE=false` locally.                          |
| `429` "Too many attempts" on sign-in                   | The login rate limit (10/min per IP) was hit. Wait a minute, or restart the API (limits are in memory).                                                                        |
| Browser console shows a CORS error                     | Add the web origin to `API_CORS_ORIGINS` and restart the API.                                                                                                                  |
| Times in `psql` look shifted by your UTC offset        | The database session is not in UTC. Run `npm run db:deploy` (migration `store_timestamps_in_utc`, API stopped), then restart both dev servers. See [timezone.md](timezone.md). |
| `Port 5173 is already in use`                          | Another Vite server is running. The port is fixed on purpose because the API's CORS allow-list expects it.                                                                     |
