-- Drizzle snapshot catch-up marker.
--
-- The schema represented by meta/0002_snapshot.json was already introduced
-- through the ordered hand-written migrations in ../*.sql. Re-emitting that
-- historical delta here would recreate unrelated tables before those SQL
-- migrations run. Phase 2A changes remain canonical in
-- ../20260718120000_durable_staffing_lifecycle.sql.
SELECT 1;
