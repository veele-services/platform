-- ============================================================================
-- Tenant sector enforcement
--
-- Adds explicit tenant-sector configuration and starts enforcing it for new or
-- changed rows without destroying existing staging data. Existing rows are
-- backfilled into tenant_sectors first; NOT VALID foreign keys keep historical
-- data reviewable while protecting future writes.
-- ============================================================================

ALTER TABLE task_codes ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE task_codes
SET tenant_id = '00000000-0000-0000-0000-000000000010'
WHERE tenant_id IS NULL;

ALTER TABLE task_codes ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000010';
ALTER TABLE task_codes ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_codes_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE task_codes
      ADD CONSTRAINT task_codes_tenant_id_tenants_id_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tenant_sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010' NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sector_id uuid NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  is_enabled boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_sectors_tenant_sector_idx ON tenant_sectors(tenant_id, sector_id);
CREATE INDEX IF NOT EXISTS tenant_sectors_tenant_idx ON tenant_sectors(tenant_id);
CREATE INDEX IF NOT EXISTS tenant_sectors_sector_idx ON tenant_sectors(sector_id);

-- Preserve current default-tenant behavior: all active sectors remain available
-- for the existing/default tenant until the tenant explicitly narrows the set.
INSERT INTO tenant_sectors (tenant_id, sector_id, is_enabled, created_at, updated_at)
SELECT '00000000-0000-0000-0000-000000000010', s.id, true, now(), now()
FROM sectors s
WHERE s.is_active = true
ON CONFLICT (tenant_id, sector_id) DO UPDATE
  SET is_enabled = true,
      updated_at = now();

-- Backfill every sector that is already used by tenant-owned data.
INSERT INTO tenant_sectors (tenant_id, sector_id, is_enabled, created_at, updated_at)
SELECT DISTINCT tenant_id, sector_id, true, now(), now()
FROM customers
WHERE sector_id IS NOT NULL
ON CONFLICT (tenant_id, sector_id) DO UPDATE
  SET is_enabled = true,
      updated_at = now();

INSERT INTO tenant_sectors (tenant_id, sector_id, is_enabled, created_at, updated_at)
SELECT DISTINCT tenant_id, sector_id, true, now(), now()
FROM objects
WHERE sector_id IS NOT NULL
ON CONFLICT (tenant_id, sector_id) DO UPDATE
  SET is_enabled = true,
      updated_at = now();

INSERT INTO tenant_sectors (tenant_id, sector_id, is_enabled, created_at, updated_at)
SELECT DISTINCT tenant_id, sector_id, true, now(), now()
FROM personnel
WHERE sector_id IS NOT NULL
ON CONFLICT (tenant_id, sector_id) DO UPDATE
  SET is_enabled = true,
      updated_at = now();

INSERT INTO tenant_sectors (tenant_id, sector_id, is_enabled, created_at, updated_at)
SELECT DISTINCT tenant_id, sector_id, true, now(), now()
FROM task_codes
WHERE sector_id IS NOT NULL
ON CONFLICT (tenant_id, sector_id) DO UPDATE
  SET is_enabled = true,
      updated_at = now();

-- Enforce tenant-sector membership for future writes. Existing data can be
-- validated after a staging-copy audit with VALIDATE CONSTRAINT.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_tenant_sector_fk') THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_tenant_sector_fk
      FOREIGN KEY (tenant_id, sector_id)
      REFERENCES tenant_sectors(tenant_id, sector_id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objects_tenant_sector_fk') THEN
    ALTER TABLE objects
      ADD CONSTRAINT objects_tenant_sector_fk
      FOREIGN KEY (tenant_id, sector_id)
      REFERENCES tenant_sectors(tenant_id, sector_id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personnel_tenant_sector_fk') THEN
    ALTER TABLE personnel
      ADD CONSTRAINT personnel_tenant_sector_fk
      FOREIGN KEY (tenant_id, sector_id)
      REFERENCES tenant_sectors(tenant_id, sector_id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_codes_tenant_sector_fk') THEN
    ALTER TABLE task_codes
      ADD CONSTRAINT task_codes_tenant_sector_fk
      FOREIGN KEY (tenant_id, sector_id)
      REFERENCES tenant_sectors(tenant_id, sector_id)
      NOT VALID;
  END IF;
END $$;
