-- ============================================================================
-- Tenant sector policy
--
-- Adds tenant-level sector policy settings and makes single-sector/default-sector
-- behavior explicit. The migration is staging-safe: existing tenant sector links
-- remain intact and tenants with multiple enabled sectors keep multi-sector mode.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_sector_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  mode varchar(20) NOT NULL DEFAULT 'multi',
  max_sectors integer,
  default_sector_id uuid REFERENCES sectors(id) ON DELETE SET NULL,
  enforce_sector_scope boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_sector_settings_default_sector_idx
  ON tenant_sector_settings (default_sector_id);

CREATE INDEX IF NOT EXISTS tenant_sector_settings_mode_idx
  ON tenant_sector_settings (mode);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_sector_settings_mode_check'
      AND conrelid = 'tenant_sector_settings'::regclass
  ) THEN
    ALTER TABLE tenant_sector_settings
      ADD CONSTRAINT tenant_sector_settings_mode_check
      CHECK (mode IN ('multi', 'single'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_sector_settings_max_sectors_check'
      AND conrelid = 'tenant_sector_settings'::regclass
  ) THEN
    ALTER TABLE tenant_sector_settings
      ADD CONSTRAINT tenant_sector_settings_max_sectors_check
      CHECK (max_sectors IS NULL OR max_sectors >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_sector_settings_default_sector_fk'
      AND conrelid = 'tenant_sector_settings'::regclass
  ) THEN
    ALTER TABLE tenant_sector_settings
      ADD CONSTRAINT tenant_sector_settings_default_sector_fk
      FOREIGN KEY (tenant_id, default_sector_id)
      REFERENCES tenant_sectors(tenant_id, sector_id)
      NOT VALID;
  END IF;
END $$;

WITH enabled_counts AS (
  SELECT
    tenant_id,
    count(*) FILTER (WHERE is_enabled = true)::int AS enabled_count,
    min(sector_id) FILTER (WHERE is_enabled = true) AS only_enabled_sector_id
  FROM tenant_sectors
  GROUP BY tenant_id
)
INSERT INTO tenant_sector_settings (
  tenant_id,
  mode,
  max_sectors,
  default_sector_id,
  enforce_sector_scope,
  created_at,
  updated_at
)
SELECT
  tenant_id,
  CASE WHEN enabled_count = 1 THEN 'single' ELSE 'multi' END,
  CASE WHEN enabled_count = 1 THEN 1 ELSE NULL END,
  CASE WHEN enabled_count = 1 THEN only_enabled_sector_id ELSE NULL END,
  true,
  now(),
  now()
FROM enabled_counts
ON CONFLICT (tenant_id) DO NOTHING;

CREATE OR REPLACE FUNCTION fieldgrid_assert_tenant_sector_limit()
RETURNS trigger AS $$
DECLARE
  policy_mode varchar(20);
  configured_max integer;
  effective_max integer;
  enabled_count integer;
BEGIN
  IF NEW.is_enabled IS DISTINCT FROM true THEN
    IF TG_OP = 'UPDATE'
      AND OLD.is_enabled = true
      AND NEW.is_enabled = false
    THEN
      IF EXISTS (
        SELECT 1
        FROM tenant_sector_settings tss
        WHERE tss.tenant_id = NEW.tenant_id
          AND tss.default_sector_id = NEW.sector_id
      ) THEN
        RAISE EXCEPTION 'Sector % is configured as default sector for tenant %', NEW.sector_id, NEW.tenant_id
          USING ERRCODE = '23514';
      END IF;

      IF EXISTS (
        SELECT 1 FROM customers c
        WHERE c.tenant_id = NEW.tenant_id AND c.sector_id = NEW.sector_id
      ) OR EXISTS (
        SELECT 1 FROM objects o
        WHERE o.tenant_id = NEW.tenant_id AND o.sector_id = NEW.sector_id
      ) OR EXISTS (
        SELECT 1 FROM personnel p
        WHERE p.tenant_id = NEW.tenant_id AND p.sector_id = NEW.sector_id
      ) OR EXISTS (
        SELECT 1 FROM task_codes tc
        WHERE tc.tenant_id = NEW.tenant_id AND tc.sector_id = NEW.sector_id
      ) THEN
        RAISE EXCEPTION 'Sector % is still used by tenant % data', NEW.sector_id, NEW.tenant_id
          USING ERRCODE = '23514';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  SELECT mode, max_sectors
  INTO policy_mode, configured_max
  FROM tenant_sector_settings
  WHERE tenant_id = NEW.tenant_id;

  policy_mode := COALESCE(policy_mode, 'multi');
  effective_max := CASE WHEN policy_mode = 'single' THEN 1 ELSE configured_max END;

  IF effective_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::int
  INTO enabled_count
  FROM tenant_sectors
  WHERE tenant_id = NEW.tenant_id
    AND is_enabled = true
    AND sector_id <> NEW.sector_id;

  IF enabled_count >= effective_max THEN
    RAISE EXCEPTION 'Tenant % cannot enable more than % sector(s)', NEW.tenant_id, effective_max
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tenant_sectors_policy_limit_trigger ON tenant_sectors;
CREATE TRIGGER tenant_sectors_policy_limit_trigger
  BEFORE INSERT OR UPDATE OF tenant_id, sector_id, is_enabled ON tenant_sectors
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_assert_tenant_sector_limit();

CREATE OR REPLACE FUNCTION fieldgrid_apply_tenant_sector_policy()
RETURNS trigger AS $$
DECLARE
  policy_mode varchar(20);
  policy_default_sector_id uuid;
  policy_enforce boolean;
  single_enabled_sector_id uuid;
  single_enabled_count integer;
BEGIN
  SELECT mode, default_sector_id, enforce_sector_scope
  INTO policy_mode, policy_default_sector_id, policy_enforce
  FROM tenant_sector_settings
  WHERE tenant_id = NEW.tenant_id;

  policy_mode := COALESCE(policy_mode, 'multi');
  policy_enforce := COALESCE(policy_enforce, true);

  IF policy_enforce IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  IF NEW.sector_id IS NULL AND policy_mode = 'single' THEN
    IF policy_default_sector_id IS NOT NULL THEN
      NEW.sector_id := policy_default_sector_id;
    ELSE
      SELECT count(*)::int, min(sector_id)
      INTO single_enabled_count, single_enabled_sector_id
      FROM tenant_sectors
      WHERE tenant_id = NEW.tenant_id
        AND is_enabled = true;

      IF single_enabled_count = 1 THEN
        NEW.sector_id := single_enabled_sector_id;
      END IF;
    END IF;
  END IF;

  IF NEW.sector_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM tenant_sectors ts
    JOIN sectors s ON s.id = ts.sector_id
    WHERE ts.tenant_id = NEW.tenant_id
      AND ts.sector_id = NEW.sector_id
      AND ts.is_enabled = true
      AND s.is_active = true
  ) THEN
    RAISE EXCEPTION 'Sector % is not enabled for tenant %', NEW.sector_id, NEW.tenant_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customers_tenant_sector_enabled_trigger ON customers;
DROP TRIGGER IF EXISTS customers_tenant_sector_policy_trigger ON customers;
CREATE TRIGGER customers_tenant_sector_policy_trigger
  BEFORE INSERT OR UPDATE OF tenant_id, sector_id ON customers
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_apply_tenant_sector_policy();

DROP TRIGGER IF EXISTS objects_tenant_sector_enabled_trigger ON objects;
DROP TRIGGER IF EXISTS objects_tenant_sector_policy_trigger ON objects;
CREATE TRIGGER objects_tenant_sector_policy_trigger
  BEFORE INSERT OR UPDATE OF tenant_id, sector_id ON objects
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_apply_tenant_sector_policy();

DROP TRIGGER IF EXISTS personnel_tenant_sector_enabled_trigger ON personnel;
DROP TRIGGER IF EXISTS personnel_tenant_sector_policy_trigger ON personnel;
CREATE TRIGGER personnel_tenant_sector_policy_trigger
  BEFORE INSERT OR UPDATE OF tenant_id, sector_id ON personnel
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_apply_tenant_sector_policy();

DROP TRIGGER IF EXISTS task_codes_tenant_sector_enabled_trigger ON task_codes;
DROP TRIGGER IF EXISTS task_codes_tenant_sector_policy_trigger ON task_codes;
CREATE TRIGGER task_codes_tenant_sector_policy_trigger
  BEFORE INSERT OR UPDATE OF tenant_id, sector_id ON task_codes
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_apply_tenant_sector_policy();
