-- Stock movements and activity logs are append-only histories (docs/database-design.md,
-- docs/security.md). Until now only the application enforced that; these triggers make
-- the database refuse it too, so no code path, script, or bug can rewrite or remove the
-- stock ledger or the audit trail.
--
-- The one change still allowed is the one PostgreSQL itself makes: when a user is
-- deleted, `actor_user_id` is set to NULL (ON DELETE SET NULL) and nothing else changes.
-- Organizations, warehouses, and products already RESTRICT deletion while history exists.
--
-- TRUNCATE (used only by the test suite on its own database) does not fire row triggers.
-- No existing rows are changed by this migration.

CREATE FUNCTION prevent_append_only_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.actor_user_id IS NULL
     AND OLD.actor_user_id IS NOT NULL
     AND to_jsonb(NEW) - 'actor_user_id' = to_jsonb(OLD) - 'actor_user_id' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'P0001', HINT = 'Record a new entry instead (e.g. a correcting stock movement).';
END;
$$;

CREATE TRIGGER stock_movements_append_only
  BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change();

CREATE TRIGGER activity_logs_append_only
  BEFORE UPDATE OR DELETE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_append_only_change();
