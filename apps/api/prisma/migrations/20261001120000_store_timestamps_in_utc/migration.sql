-- Store every timestamp as its real instant and run all sessions in UTC.
-- Root cause and verification: docs/timezone.md.
--
-- Prisma's PostgreSQL driver adapter (@prisma/adapter-pg) assumes UTC sessions:
--   * it sends a DateTime as zone-less UTC wall-clock text ("2026-09-24 11:00:00"),
--     which PostgreSQL reads in the SESSION time zone;
--   * it reads a timestamptz by replacing the printed offset with +00:00.
-- This database's sessions ran in the server's default zone (e.g. Europe/Istanbul),
-- so every value Prisma wrote was stored shifted by that zone's UTC offset
-- (11:00Z stored as 11:00+03 = 08:00Z). Prisma read it back "correctly", but the
-- stored instants were wrong for SQL (now(), AT TIME ZONE, psql), and values
-- PostgreSQL generated itself (now()) were read back shifted the other way.
--
-- 1. Repair the columns Prisma writes (its @default(now()) and @updatedAt are
--    filled by Prisma, not by PostgreSQL): reinterpret the stored wall-clock time
--    of the zone it was written in as UTC. That zone is this session's zone: the
--    database default that every application connection used (the migration CLI
--    connects the same way). With a UTC session this is a no-op, so databases
--    that never had the problem (e.g. fresh ones) are unchanged.
--    order_number_sequences.updated_at is NOT converted: only PostgreSQL's now()
--    writes it, so it already holds the real instant. _prisma_migrations belongs
--    to Prisma's migration engine and is left alone.
--    Stock movements and activity logs are append-only for the application; this
--    one-time repair keeps every row and only corrects the stored instant.
DO $$
DECLARE
  zone CONSTANT text := current_setting('TimeZone');
  target record;
  assignments text;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('users', ARRAY['created_at', 'updated_at']),
      ('sessions', ARRAY['created_at', 'expires_at', 'last_seen_at', 'revoked_at']),
      ('organizations', ARRAY['created_at', 'updated_at']),
      ('organization_members', ARRAY['created_at', 'updated_at']),
      ('organization_invitations', ARRAY['created_at', 'expires_at', 'accepted_at', 'revoked_at']),
      ('categories', ARRAY['created_at', 'updated_at']),
      ('products', ARRAY['created_at', 'updated_at']),
      ('warehouses', ARRAY['created_at', 'updated_at']),
      ('inventory', ARRAY['created_at', 'updated_at']),
      ('stock_movements', ARRAY['created_at']),
      ('customers', ARRAY['created_at', 'updated_at']),
      ('orders', ARRAY['created_at', 'updated_at']),
      ('order_items', ARRAY['created_at', 'updated_at']),
      ('activity_logs', ARRAY['created_at']),
      ('user_appearances', ARRAY['updated_at']),
      ('appearance_profiles', ARRAY['created_at', 'updated_at'])
    ) AS t(table_name, columns)
  LOOP
    SELECT string_agg(format('%1$I = (%1$I AT TIME ZONE %2$L) AT TIME ZONE ''UTC''', col, zone), ', ')
      INTO assignments
      FROM unnest(target.columns) AS col;
    EXECUTE format('UPDATE %I SET %s', target.table_name, assignments);
  END LOOP;

  -- 2. From now on every new session of this database runs in UTC, which is what
  --    the adapter assumes (application, tests, seed, migrations, psql).
  EXECUTE format('ALTER DATABASE %I SET "TimeZone" TO %L', current_database(), 'UTC');
END $$;
