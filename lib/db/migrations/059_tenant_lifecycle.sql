-- ============================================================================
-- Tenant lifecycle foundation
--
-- Staging-safe migration: keeps existing tenant rows, keeps is_active for
-- backwards compatibility, and adds explicit lifecycle/status fields for the
-- next SaaS phases.
-- ============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS status varchar(30),
  ADD COLUMN IF NOT EXISTS plan_key varchar(40),
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by uuid,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

UPDATE tenants
SET status = CASE
  WHEN is_active = true THEN 'active'
  ELSE 'suspended'
END
WHERE status IS NULL;

UPDATE tenants
SET plan_key = 'starter'
WHERE plan_key IS NULL OR btrim(plan_key) = '';

ALTER TABLE tenants
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN plan_key SET DEFAULT 'starter',
  ALTER COLUMN plan_key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_status_check'
      AND conrelid = 'tenants'::regclass
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_status_check
      CHECK (status IN ('provisioning', 'trial', 'active', 'suspended', 'archived'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_plan_key_check'
      AND conrelid = 'tenants'::regclass
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_plan_key_check
      CHECK (plan_key IN ('starter', 'professional', 'enterprise'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS tenants_status_idx
  ON tenants (status);

CREATE INDEX IF NOT EXISTS tenants_plan_key_idx
  ON tenants (plan_key);

CREATE INDEX IF NOT EXISTS tenants_runtime_active_idx
  ON tenants (id)
  WHERE is_active = true
    AND status IN ('trial', 'active');
