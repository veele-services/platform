-- ============================================================================
-- Sprint 2 tenant regions
--
-- Staging-safe migration:
-- - adds tenant-scoped region tables for personnel, objects, customers and assignments;
-- - backfills from legacy personnel.region, personnel.preferred_regions and assignments.required_region;
-- - keeps all legacy fields for compatibility until Sprint 3/4 UI/runtime are proven;
-- - enforces tenant consistency with invoker trigger functions;
-- - enables RLS on new public tables without adding broad authenticated policies.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  normalized_name varchar(120) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_regions_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT tenant_regions_normalized_name_not_blank CHECK (btrim(normalized_name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_regions_tenant_normalized_name_idx
  ON tenant_regions (tenant_id, normalized_name);

CREATE INDEX IF NOT EXISTS tenant_regions_tenant_idx
  ON tenant_regions (tenant_id);

CREATE INDEX IF NOT EXISTS tenant_regions_active_idx
  ON tenant_regions (tenant_id, is_active);

CREATE TABLE IF NOT EXISTS personnel_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  personnel_id uuid NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  tenant_region_id uuid NOT NULL REFERENCES tenant_regions(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  source varchar(40) NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personnel_regions_source_check CHECK (source IN ('legacy_backfill', 'manual', 'object_default', 'planning'))
);

CREATE UNIQUE INDEX IF NOT EXISTS personnel_regions_personnel_region_idx
  ON personnel_regions (personnel_id, tenant_region_id);

CREATE UNIQUE INDEX IF NOT EXISTS personnel_regions_primary_idx
  ON personnel_regions (personnel_id)
  WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS personnel_regions_tenant_idx
  ON personnel_regions (tenant_id);

CREATE INDEX IF NOT EXISTS personnel_regions_region_idx
  ON personnel_regions (tenant_region_id);

CREATE TABLE IF NOT EXISTS object_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  tenant_region_id uuid NOT NULL REFERENCES tenant_regions(id) ON DELETE CASCADE,
  source varchar(40) NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT object_regions_source_check CHECK (source IN ('legacy_backfill', 'manual', 'object_default', 'planning'))
);

CREATE UNIQUE INDEX IF NOT EXISTS object_regions_object_region_idx
  ON object_regions (object_id, tenant_region_id);

CREATE INDEX IF NOT EXISTS object_regions_tenant_idx
  ON object_regions (tenant_id);

CREATE INDEX IF NOT EXISTS object_regions_region_idx
  ON object_regions (tenant_region_id);

CREATE TABLE IF NOT EXISTS customer_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tenant_region_id uuid NOT NULL REFERENCES tenant_regions(id) ON DELETE CASCADE,
  source varchar(40) NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_regions_source_check CHECK (source IN ('legacy_backfill', 'manual', 'object_default', 'planning'))
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_regions_customer_region_idx
  ON customer_regions (customer_id, tenant_region_id);

CREATE INDEX IF NOT EXISTS customer_regions_tenant_idx
  ON customer_regions (tenant_id);

CREATE INDEX IF NOT EXISTS customer_regions_region_idx
  ON customer_regions (tenant_region_id);

CREATE TABLE IF NOT EXISTS assignment_required_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  tenant_region_id uuid NOT NULL REFERENCES tenant_regions(id) ON DELETE CASCADE,
  source varchar(40) NOT NULL DEFAULT 'manual',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_required_regions_source_check CHECK (source IN ('legacy_backfill', 'manual', 'object_default', 'planning'))
);

CREATE UNIQUE INDEX IF NOT EXISTS assignment_required_regions_assignment_region_idx
  ON assignment_required_regions (assignment_id, tenant_region_id);

CREATE INDEX IF NOT EXISTS assignment_required_regions_tenant_idx
  ON assignment_required_regions (tenant_id);

CREATE INDEX IF NOT EXISTS assignment_required_regions_region_idx
  ON assignment_required_regions (tenant_region_id);

ALTER TABLE tenant_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE personnel_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_required_regions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION fieldgrid_normalize_region_name(p_name text)
RETURNS text AS $$
BEGIN
  RETURN lower(regexp_replace(btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

REVOKE ALL ON FUNCTION fieldgrid_normalize_region_name(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION fieldgrid_ensure_tenant_region_scope()
RETURNS trigger AS $$
DECLARE
  parent_tenant_id uuid;
  region_tenant_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'personnel_regions' THEN
    SELECT personnel.tenant_id INTO parent_tenant_id
    FROM personnel
    WHERE personnel.id = NEW.personnel_id;
  ELSIF TG_TABLE_NAME = 'object_regions' THEN
    SELECT objects.tenant_id INTO parent_tenant_id
    FROM objects
    WHERE objects.id = NEW.object_id;
  ELSIF TG_TABLE_NAME = 'customer_regions' THEN
    SELECT customers.tenant_id INTO parent_tenant_id
    FROM customers
    WHERE customers.id = NEW.customer_id;
  ELSIF TG_TABLE_NAME = 'assignment_required_regions' THEN
    SELECT assignments.tenant_id INTO parent_tenant_id
    FROM assignments
    WHERE assignments.id = NEW.assignment_id;
  ELSE
    RAISE EXCEPTION 'Unsupported tenant region table: %', TG_TABLE_NAME;
  END IF;

  SELECT tenant_regions.tenant_id INTO region_tenant_id
  FROM tenant_regions
  WHERE tenant_regions.id = NEW.tenant_region_id;

  IF parent_tenant_id IS NULL OR parent_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Tenant region parent tenant mismatch on %', TG_TABLE_NAME;
  END IF;

  IF region_tenant_id IS NULL OR region_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Tenant region tenant mismatch on %', TG_TABLE_NAME;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION fieldgrid_ensure_tenant_region_scope() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_personnel_regions_tenant_scope ON personnel_regions;
CREATE TRIGGER trg_personnel_regions_tenant_scope
  BEFORE INSERT OR UPDATE OF tenant_id, personnel_id, tenant_region_id
  ON personnel_regions
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_ensure_tenant_region_scope();

DROP TRIGGER IF EXISTS trg_object_regions_tenant_scope ON object_regions;
CREATE TRIGGER trg_object_regions_tenant_scope
  BEFORE INSERT OR UPDATE OF tenant_id, object_id, tenant_region_id
  ON object_regions
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_ensure_tenant_region_scope();

DROP TRIGGER IF EXISTS trg_customer_regions_tenant_scope ON customer_regions;
CREATE TRIGGER trg_customer_regions_tenant_scope
  BEFORE INSERT OR UPDATE OF tenant_id, customer_id, tenant_region_id
  ON customer_regions
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_ensure_tenant_region_scope();

DROP TRIGGER IF EXISTS trg_assignment_required_regions_tenant_scope ON assignment_required_regions;
CREATE TRIGGER trg_assignment_required_regions_tenant_scope
  BEFORE INSERT OR UPDATE OF tenant_id, assignment_id, tenant_region_id
  ON assignment_required_regions
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_ensure_tenant_region_scope();

WITH legacy_region_values AS (
  SELECT personnel.tenant_id, btrim(personnel.region) AS name
  FROM personnel
  WHERE personnel.region IS NOT NULL
    AND btrim(personnel.region) <> ''

  UNION ALL

  SELECT personnel.tenant_id, btrim(preferred_region.value) AS name
  FROM personnel
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(personnel.preferred_regions) = 'array' THEN personnel.preferred_regions
      ELSE '[]'::jsonb
    END
  ) AS preferred_region(value)
  WHERE btrim(preferred_region.value) <> ''

  UNION ALL

  SELECT assignments.tenant_id, btrim(assignments.required_region) AS name
  FROM assignments
  WHERE assignments.required_region IS NOT NULL
    AND btrim(assignments.required_region) <> ''
), normalized_regions AS (
  SELECT
    legacy_region_values.tenant_id,
    regexp_replace(legacy_region_values.name, '[[:space:]]+', ' ', 'g') AS name,
    fieldgrid_normalize_region_name(legacy_region_values.name) AS normalized_name
  FROM legacy_region_values
  WHERE btrim(legacy_region_values.name) <> ''
)
INSERT INTO tenant_regions (tenant_id, name, normalized_name, source, created_at, updated_at)
SELECT
  normalized_regions.tenant_id,
  min(normalized_regions.name) AS name,
  normalized_regions.normalized_name,
  'legacy_backfill',
  now(),
  now()
FROM normalized_regions
GROUP BY normalized_regions.tenant_id, normalized_regions.normalized_name
ON CONFLICT (tenant_id, normalized_name) DO NOTHING;

INSERT INTO personnel_regions (tenant_id, personnel_id, tenant_region_id, is_primary, source)
SELECT
  personnel.tenant_id,
  personnel.id,
  tenant_regions.id,
  true,
  'legacy_backfill'
FROM personnel
JOIN tenant_regions
  ON tenant_regions.tenant_id = personnel.tenant_id
 AND tenant_regions.normalized_name = fieldgrid_normalize_region_name(personnel.region)
WHERE personnel.region IS NOT NULL
  AND btrim(personnel.region) <> ''
ON CONFLICT (personnel_id, tenant_region_id) DO UPDATE
SET is_primary = true;

INSERT INTO personnel_regions (tenant_id, personnel_id, tenant_region_id, is_primary, source)
SELECT
  personnel.tenant_id,
  personnel.id,
  tenant_regions.id,
  false,
  'legacy_backfill'
FROM personnel
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN jsonb_typeof(personnel.preferred_regions) = 'array' THEN personnel.preferred_regions
    ELSE '[]'::jsonb
  END
) AS preferred_region(value)
JOIN tenant_regions
  ON tenant_regions.tenant_id = personnel.tenant_id
 AND tenant_regions.normalized_name = fieldgrid_normalize_region_name(preferred_region.value)
WHERE btrim(preferred_region.value) <> ''
ON CONFLICT (personnel_id, tenant_region_id) DO NOTHING;

INSERT INTO assignment_required_regions (tenant_id, assignment_id, tenant_region_id, source, sort_order)
SELECT
  assignments.tenant_id,
  assignments.id,
  tenant_regions.id,
  'legacy_backfill',
  0
FROM assignments
JOIN tenant_regions
  ON tenant_regions.tenant_id = assignments.tenant_id
 AND tenant_regions.normalized_name = fieldgrid_normalize_region_name(assignments.required_region)
WHERE assignments.required_region IS NOT NULL
  AND btrim(assignments.required_region) <> ''
ON CONFLICT (assignment_id, tenant_region_id) DO NOTHING;
