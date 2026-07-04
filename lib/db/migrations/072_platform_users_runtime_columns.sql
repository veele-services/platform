-- Repair legacy platform_users tables that predate the current runtime schema.
-- Older staging databases may already have platform_users, causing
-- CREATE TABLE IF NOT EXISTS in 056 to skip created_by/last_seen_at.

ALTER TABLE platform_users
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE platform_users
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

UPDATE platform_users
SET updated_at = COALESCE(updated_at, created_at, now())
WHERE updated_at IS NULL;

ALTER TABLE platform_users
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE platform_users
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE platform_users
  ADD COLUMN IF NOT EXISTS last_seen_at timestamp with time zone;
