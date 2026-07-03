-- ============================================================================
-- Tenant task codes, price history and assignment task snapshots
--
-- Staging-safe migration:
-- - keeps existing task_codes rows as compatibility input;
-- - creates tenant_task_codes and tenant_task_code_prices;
-- - changes task_codes.code uniqueness from global to per tenant;
-- - backfills tenant task codes and current prices from existing task_codes;
-- - snapshots task-code code/name/price/invoiceable onto assignment_tasks;
-- - adds write-time tenant and sector guards for task codes, prices and snapshots.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_task_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_task_code_id uuid REFERENCES task_codes(id) ON DELETE SET NULL,
  code varchar(50) NOT NULL,
  name varchar(200) NOT NULL,
  sector_id uuid REFERENCES sectors(id) ON DELETE SET NULL,
  description text,
  duration_minutes integer,
  required_certificates jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_diploma varchar(200),
  required_knowledge jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_role_id uuid REFERENCES roles(id) ON DELETE SET NULL,
  photo_required boolean NOT NULL DEFAULT false,
  report_required boolean NOT NULL DEFAULT false,
  invoiceable boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_task_code_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tenant_task_code_id uuid NOT NULL REFERENCES tenant_task_codes(id) ON DELETE CASCADE,
  price numeric(10, 2) NOT NULL DEFAULT 0,
  currency varchar(3) NOT NULL DEFAULT 'EUR',
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE assignment_tasks
  ADD COLUMN IF NOT EXISTS tenant_task_code_id uuid;

ALTER TABLE assignment_tasks
  ADD COLUMN IF NOT EXISTS tenant_task_code_price_id uuid;

ALTER TABLE assignment_tasks
  ADD COLUMN IF NOT EXISTS task_code_code varchar(50);

ALTER TABLE assignment_tasks
  ADD COLUMN IF NOT EXISTS task_code_name varchar(200);

ALTER TABLE assignment_tasks
  ADD COLUMN IF NOT EXISTS task_code_price numeric(10, 2);

ALTER TABLE assignment_tasks
  ADD COLUMN IF NOT EXISTS task_code_invoiceable boolean;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'assignment_tasks_tenant_task_code_id_fkey'
      AND conrelid = 'assignment_tasks'::regclass
  ) THEN
    ALTER TABLE assignment_tasks
      ADD CONSTRAINT assignment_tasks_tenant_task_code_id_fkey
      FOREIGN KEY (tenant_task_code_id) REFERENCES tenant_task_codes(id) ON DELETE SET NULL
      NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'assignment_tasks_tenant_task_code_price_id_fkey'
      AND conrelid = 'assignment_tasks'::regclass
  ) THEN
    ALTER TABLE assignment_tasks
      ADD CONSTRAINT assignment_tasks_tenant_task_code_price_id_fkey
      FOREIGN KEY (tenant_task_code_price_id) REFERENCES tenant_task_code_prices(id) ON DELETE SET NULL
      NOT VALID;
  END IF;
END;
$$;

DO $$
DECLARE
  unique_constraint_name text;
BEGIN
  FOR unique_constraint_name IN
    SELECT constraint_record.conname
    FROM pg_constraint constraint_record
    JOIN pg_attribute attribute_record
      ON attribute_record.attrelid = constraint_record.conrelid
     AND attribute_record.attnum = ANY(constraint_record.conkey)
    WHERE constraint_record.conrelid = 'task_codes'::regclass
      AND constraint_record.contype = 'u'
    GROUP BY constraint_record.conname, constraint_record.conkey
    HAVING array_length(constraint_record.conkey, 1) = 1
       AND bool_and(attribute_record.attname = 'code')
  LOOP
    EXECUTE format('ALTER TABLE task_codes DROP CONSTRAINT IF EXISTS %I', unique_constraint_name);
  END LOOP;
END;
$$;

DO $$
DECLARE
  unique_index_name text;
BEGIN
  FOR unique_index_name IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'task_codes'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexdef ILIKE '%(code)%'
      AND indexdef NOT ILIKE '%tenant_id%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', unique_index_name);
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS task_codes_tenant_code_unique_idx
  ON task_codes (tenant_id, code);

CREATE INDEX IF NOT EXISTS task_codes_tenant_active_idx
  ON task_codes (tenant_id, is_active);

CREATE INDEX IF NOT EXISTS task_codes_tenant_sector_idx
  ON task_codes (tenant_id, sector_id);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_task_codes_tenant_code_unique_idx
  ON tenant_task_codes (tenant_id, code);

CREATE INDEX IF NOT EXISTS tenant_task_codes_tenant_idx
  ON tenant_task_codes (tenant_id);

CREATE INDEX IF NOT EXISTS tenant_task_codes_template_idx
  ON tenant_task_codes (template_task_code_id);

CREATE INDEX IF NOT EXISTS tenant_task_codes_tenant_sector_idx
  ON tenant_task_codes (tenant_id, sector_id);

CREATE INDEX IF NOT EXISTS tenant_task_codes_tenant_active_idx
  ON tenant_task_codes (tenant_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_task_code_prices_task_valid_from_unique_idx
  ON tenant_task_code_prices (tenant_task_code_id, valid_from);

CREATE INDEX IF NOT EXISTS tenant_task_code_prices_tenant_idx
  ON tenant_task_code_prices (tenant_id);

CREATE INDEX IF NOT EXISTS tenant_task_code_prices_tenant_task_idx
  ON tenant_task_code_prices (tenant_id, tenant_task_code_id);

CREATE INDEX IF NOT EXISTS tenant_task_code_prices_validity_idx
  ON tenant_task_code_prices (tenant_task_code_id, valid_from, valid_until);

CREATE INDEX IF NOT EXISTS assignment_tasks_tenant_task_code_idx
  ON assignment_tasks (tenant_task_code_id);

CREATE INDEX IF NOT EXISTS assignment_tasks_tenant_task_code_price_idx
  ON assignment_tasks (tenant_task_code_price_id);

CREATE INDEX IF NOT EXISTS assignment_tasks_task_code_snapshot_idx
  ON assignment_tasks (task_code_code);

INSERT INTO tenant_task_codes (
  tenant_id,
  template_task_code_id,
  code,
  name,
  sector_id,
  description,
  duration_minutes,
  required_certificates,
  required_diploma,
  required_knowledge,
  required_role_id,
  photo_required,
  report_required,
  invoiceable,
  is_active,
  created_at,
  updated_at
)
SELECT
  task_code.tenant_id,
  task_code.id,
  task_code.code,
  task_code.name,
  task_code.sector_id,
  task_code.description,
  task_code.duration_minutes,
  task_code.required_certificates,
  task_code.required_diploma,
  task_code.required_knowledge,
  task_code.required_role_id,
  task_code.photo_required,
  task_code.report_required,
  task_code.invoiceable,
  task_code.is_active,
  task_code.created_at,
  task_code.updated_at
FROM task_codes task_code
ON CONFLICT (tenant_id, code) DO UPDATE
SET template_task_code_id = EXCLUDED.template_task_code_id,
    name = EXCLUDED.name,
    sector_id = EXCLUDED.sector_id,
    description = EXCLUDED.description,
    duration_minutes = EXCLUDED.duration_minutes,
    required_certificates = EXCLUDED.required_certificates,
    required_diploma = EXCLUDED.required_diploma,
    required_knowledge = EXCLUDED.required_knowledge,
    required_role_id = EXCLUDED.required_role_id,
    photo_required = EXCLUDED.photo_required,
    report_required = EXCLUDED.report_required,
    invoiceable = EXCLUDED.invoiceable,
    is_active = EXCLUDED.is_active,
    updated_at = EXCLUDED.updated_at;

UPDATE tenant_task_code_prices price
SET price = COALESCE(task_code.price, 0),
    currency = 'EUR'
FROM tenant_task_codes tenant_task_code
JOIN task_codes task_code ON task_code.id = tenant_task_code.template_task_code_id
WHERE price.tenant_task_code_id = tenant_task_code.id
  AND price.valid_from = CURRENT_DATE
  AND price.valid_until IS NULL;

INSERT INTO tenant_task_code_prices (
  tenant_id,
  tenant_task_code_id,
  price,
  currency,
  valid_from,
  created_at
)
SELECT
  tenant_task_code.tenant_id,
  tenant_task_code.id,
  COALESCE(task_code.price, 0),
  'EUR',
  CURRENT_DATE,
  now()
FROM tenant_task_codes tenant_task_code
JOIN task_codes task_code ON task_code.id = tenant_task_code.template_task_code_id
WHERE NOT EXISTS (
  SELECT 1
  FROM tenant_task_code_prices existing_price
  WHERE existing_price.tenant_task_code_id = tenant_task_code.id
    AND existing_price.valid_from = CURRENT_DATE
);

WITH snapshot AS (
  SELECT
    assignment_task.id AS assignment_task_id,
    tenant_task_code.id AS tenant_task_code_id,
    current_price.id AS tenant_task_code_price_id,
    COALESCE(tenant_task_code.code, task_code.code) AS task_code_code,
    COALESCE(tenant_task_code.name, task_code.name) AS task_code_name,
    COALESCE(current_price.price, task_code.price) AS task_code_price,
    COALESCE(tenant_task_code.invoiceable, task_code.invoiceable) AS task_code_invoiceable
  FROM assignment_tasks assignment_task
  JOIN assignments assignment_record ON assignment_record.id = assignment_task.assignment_id
  LEFT JOIN task_codes task_code ON task_code.id = assignment_task.task_code_id
  LEFT JOIN tenant_task_codes tenant_task_code
    ON tenant_task_code.tenant_id = assignment_record.tenant_id
   AND (
      tenant_task_code.id = assignment_task.tenant_task_code_id
      OR tenant_task_code.template_task_code_id = task_code.id
      OR tenant_task_code.code = task_code.code
    )
  LEFT JOIN LATERAL (
    SELECT price.id, price.price
    FROM tenant_task_code_prices price
    WHERE price.tenant_task_code_id = tenant_task_code.id
      AND price.valid_from <= CURRENT_DATE
      AND (price.valid_until IS NULL OR price.valid_until >= CURRENT_DATE)
    ORDER BY price.valid_from DESC, price.created_at DESC
    LIMIT 1
  ) current_price ON TRUE
  WHERE assignment_task.task_code_id IS NOT NULL
     OR assignment_task.tenant_task_code_id IS NOT NULL
)
UPDATE assignment_tasks assignment_task
SET tenant_task_code_id = COALESCE(assignment_task.tenant_task_code_id, snapshot.tenant_task_code_id),
    tenant_task_code_price_id = COALESCE(assignment_task.tenant_task_code_price_id, snapshot.tenant_task_code_price_id),
    task_code_code = COALESCE(assignment_task.task_code_code, snapshot.task_code_code),
    task_code_name = COALESCE(assignment_task.task_code_name, snapshot.task_code_name),
    task_code_price = COALESCE(assignment_task.task_code_price, snapshot.task_code_price),
    task_code_invoiceable = COALESCE(assignment_task.task_code_invoiceable, snapshot.task_code_invoiceable)
FROM snapshot
WHERE assignment_task.id = snapshot.assignment_task_id;

CREATE OR REPLACE FUNCTION fieldgrid_assert_tenant_task_code_sector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sector_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM tenant_sectors tenant_sector
      WHERE tenant_sector.tenant_id = NEW.tenant_id
        AND tenant_sector.sector_id = NEW.sector_id
        AND tenant_sector.is_enabled = true
    )
  THEN
    RAISE EXCEPTION 'Task code sector % is not enabled for tenant %', NEW.sector_id, NEW.tenant_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_task_codes_assert_sector ON tenant_task_codes;
CREATE TRIGGER trg_tenant_task_codes_assert_sector
  BEFORE INSERT OR UPDATE OF tenant_id, sector_id
  ON tenant_task_codes
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_assert_tenant_task_code_sector();

CREATE OR REPLACE FUNCTION fieldgrid_set_tenant_task_code_price_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  code_tenant_id uuid;
BEGIN
  SELECT tenant_task_code.tenant_id INTO code_tenant_id
  FROM tenant_task_codes tenant_task_code
  WHERE tenant_task_code.id = NEW.tenant_task_code_id;

  IF code_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant task code price references unknown task code %', NEW.tenant_task_code_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := code_tenant_id;
  ELSIF NEW.tenant_id <> code_tenant_id THEN
    RAISE EXCEPTION 'Tenant task code price tenant_id % does not match task code tenant_id %', NEW.tenant_id, code_tenant_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.valid_until IS NOT NULL AND NEW.valid_until < NEW.valid_from THEN
    RAISE EXCEPTION 'Tenant task code price valid_until must be on or after valid_from'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_task_code_prices_set_tenant ON tenant_task_code_prices;
CREATE TRIGGER trg_tenant_task_code_prices_set_tenant
  BEFORE INSERT OR UPDATE OF tenant_id, tenant_task_code_id, valid_from, valid_until
  ON tenant_task_code_prices
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_set_tenant_task_code_price_tenant();

CREATE OR REPLACE FUNCTION fieldgrid_sync_task_code_to_tenant_task_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  synced_tenant_task_code_id uuid;
  current_price numeric;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.sector_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM tenant_sectors tenant_sector
      WHERE tenant_sector.tenant_id = NEW.tenant_id
        AND tenant_sector.sector_id = NEW.sector_id
        AND tenant_sector.is_enabled = true
    )
  THEN
    RAISE EXCEPTION 'Task code sector % is not enabled for tenant %', NEW.sector_id, NEW.tenant_id
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE tenant_task_codes tenant_task_code
  SET code = NEW.code,
      name = NEW.name,
      sector_id = NEW.sector_id,
      description = NEW.description,
      duration_minutes = NEW.duration_minutes,
      required_certificates = NEW.required_certificates,
      required_diploma = NEW.required_diploma,
      required_knowledge = NEW.required_knowledge,
      required_role_id = NEW.required_role_id,
      photo_required = NEW.photo_required,
      report_required = NEW.report_required,
      invoiceable = NEW.invoiceable,
      is_active = NEW.is_active,
      updated_at = now()
  WHERE tenant_task_code.template_task_code_id = NEW.id
  RETURNING tenant_task_code.id INTO synced_tenant_task_code_id;

  IF synced_tenant_task_code_id IS NULL THEN
    INSERT INTO tenant_task_codes (
      tenant_id,
      template_task_code_id,
      code,
      name,
      sector_id,
      description,
      duration_minutes,
      required_certificates,
      required_diploma,
      required_knowledge,
      required_role_id,
      photo_required,
      report_required,
      invoiceable,
      is_active,
      created_at,
      updated_at
    )
    VALUES (
      NEW.tenant_id,
      NEW.id,
      NEW.code,
      NEW.name,
      NEW.sector_id,
      NEW.description,
      NEW.duration_minutes,
      NEW.required_certificates,
      NEW.required_diploma,
      NEW.required_knowledge,
      NEW.required_role_id,
      NEW.photo_required,
      NEW.report_required,
      NEW.invoiceable,
      NEW.is_active,
      COALESCE(NEW.created_at, now()),
      now()
    )
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET template_task_code_id = EXCLUDED.template_task_code_id,
        name = EXCLUDED.name,
        sector_id = EXCLUDED.sector_id,
        description = EXCLUDED.description,
        duration_minutes = EXCLUDED.duration_minutes,
        required_certificates = EXCLUDED.required_certificates,
        required_diploma = EXCLUDED.required_diploma,
        required_knowledge = EXCLUDED.required_knowledge,
        required_role_id = EXCLUDED.required_role_id,
        photo_required = EXCLUDED.photo_required,
        report_required = EXCLUDED.report_required,
        invoiceable = EXCLUDED.invoiceable,
        is_active = EXCLUDED.is_active,
        updated_at = now()
    RETURNING tenant_task_codes.id INTO synced_tenant_task_code_id;
  END IF;

  current_price := COALESCE(NEW.price, 0);

  UPDATE tenant_task_code_prices price
  SET valid_until = CURRENT_DATE - 1
  WHERE price.tenant_task_code_id = synced_tenant_task_code_id
    AND price.valid_until IS NULL
    AND price.valid_from < CURRENT_DATE
    AND price.price <> current_price;

  UPDATE tenant_task_code_prices price
  SET price = current_price,
      currency = 'EUR'
  WHERE price.tenant_task_code_id = synced_tenant_task_code_id
    AND price.valid_until IS NULL
    AND price.valid_from = CURRENT_DATE;

  IF NOT FOUND THEN
    INSERT INTO tenant_task_code_prices (
      tenant_id,
      tenant_task_code_id,
      price,
      currency,
      valid_from,
      created_at
    )
    SELECT
      NEW.tenant_id,
      synced_tenant_task_code_id,
      current_price,
      'EUR',
      CURRENT_DATE,
      now()
    WHERE NOT EXISTS (
      SELECT 1
      FROM tenant_task_code_prices price
      WHERE price.tenant_task_code_id = synced_tenant_task_code_id
        AND price.valid_until IS NULL
        AND price.price = current_price
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_codes_sync_tenant_task_code ON task_codes;
CREATE TRIGGER trg_task_codes_sync_tenant_task_code
  AFTER INSERT OR UPDATE OF tenant_id, code, name, sector_id, description, price, duration_minutes, required_certificates, required_diploma, required_knowledge, required_role_id, photo_required, report_required, invoiceable, is_active
  ON task_codes
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_sync_task_code_to_tenant_task_code();

CREATE OR REPLACE FUNCTION fieldgrid_snapshot_assignment_task_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  assignment_tenant_id uuid;
  legacy_task_tenant_id uuid;
  legacy_task_sector_id uuid;
  legacy_task_code varchar(50);
  legacy_task_name varchar(200);
  legacy_task_price numeric;
  legacy_task_invoiceable boolean;
  resolved_tenant_task_code_id uuid;
  selected_template_task_code_id uuid;
  selected_task_tenant_id uuid;
  selected_task_sector_id uuid;
  selected_task_code varchar(50);
  selected_task_name varchar(200);
  selected_task_invoiceable boolean;
  selected_price_id uuid;
  selected_price numeric;
BEGIN
  SELECT assignment_record.tenant_id INTO assignment_tenant_id
  FROM assignments assignment_record
  WHERE assignment_record.id = NEW.assignment_id;

  IF assignment_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Assignment task assignment % does not resolve to a tenant', NEW.assignment_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.task_code_id IS NOT NULL THEN
    SELECT
      task_code.tenant_id,
      task_code.sector_id,
      task_code.code,
      task_code.name,
      task_code.price,
      task_code.invoiceable
    INTO
      legacy_task_tenant_id,
      legacy_task_sector_id,
      legacy_task_code,
      legacy_task_name,
      legacy_task_price,
      legacy_task_invoiceable
    FROM task_codes task_code
    WHERE task_code.id = NEW.task_code_id;

    IF legacy_task_tenant_id IS NULL THEN
      RAISE EXCEPTION 'Assignment task references unknown task code %', NEW.task_code_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF legacy_task_tenant_id <> assignment_tenant_id THEN
      RAISE EXCEPTION 'Assignment task code tenant_id % does not match assignment tenant_id %', legacy_task_tenant_id, assignment_tenant_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF legacy_task_sector_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM tenant_sectors tenant_sector
        WHERE tenant_sector.tenant_id = assignment_tenant_id
          AND tenant_sector.sector_id = legacy_task_sector_id
          AND tenant_sector.is_enabled = true
      )
    THEN
      RAISE EXCEPTION 'Assignment task code sector % is not enabled for tenant %', legacy_task_sector_id, assignment_tenant_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  resolved_tenant_task_code_id := NEW.tenant_task_code_id;

  IF resolved_tenant_task_code_id IS NULL AND NEW.task_code_id IS NOT NULL THEN
    SELECT tenant_task_code.id INTO resolved_tenant_task_code_id
    FROM tenant_task_codes tenant_task_code
    WHERE tenant_task_code.tenant_id = assignment_tenant_id
      AND (
        tenant_task_code.template_task_code_id = NEW.task_code_id
        OR tenant_task_code.code = legacy_task_code
      )
    ORDER BY
      CASE WHEN tenant_task_code.template_task_code_id = NEW.task_code_id THEN 0 ELSE 1 END,
      tenant_task_code.created_at DESC
    LIMIT 1;
  END IF;

  IF resolved_tenant_task_code_id IS NOT NULL THEN
    SELECT
      tenant_task_code.tenant_id,
      tenant_task_code.template_task_code_id,
      tenant_task_code.sector_id,
      tenant_task_code.code,
      tenant_task_code.name,
      tenant_task_code.invoiceable
    INTO
      selected_task_tenant_id,
      selected_template_task_code_id,
      selected_task_sector_id,
      selected_task_code,
      selected_task_name,
      selected_task_invoiceable
    FROM tenant_task_codes tenant_task_code
    WHERE tenant_task_code.id = resolved_tenant_task_code_id;

    IF selected_task_tenant_id IS NULL THEN
      RAISE EXCEPTION 'Assignment task references unknown tenant task code %', resolved_tenant_task_code_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF selected_task_tenant_id <> assignment_tenant_id THEN
      RAISE EXCEPTION 'Assignment tenant task code tenant_id % does not match assignment tenant_id %', selected_task_tenant_id, assignment_tenant_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.task_code_id IS NOT NULL
      AND selected_template_task_code_id IS NOT NULL
      AND selected_template_task_code_id <> NEW.task_code_id
    THEN
      RAISE EXCEPTION 'Assignment task code % does not match tenant task code template %', NEW.task_code_id, selected_template_task_code_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF selected_task_sector_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM tenant_sectors tenant_sector
        WHERE tenant_sector.tenant_id = assignment_tenant_id
          AND tenant_sector.sector_id = selected_task_sector_id
          AND tenant_sector.is_enabled = true
      )
    THEN
      RAISE EXCEPTION 'Assignment tenant task code sector % is not enabled for tenant %', selected_task_sector_id, assignment_tenant_id
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT price.id, price.price INTO selected_price_id, selected_price
    FROM tenant_task_code_prices price
    WHERE price.tenant_task_code_id = resolved_tenant_task_code_id
      AND price.valid_from <= CURRENT_DATE
      AND (price.valid_until IS NULL OR price.valid_until >= CURRENT_DATE)
    ORDER BY price.valid_from DESC, price.created_at DESC
    LIMIT 1;

    NEW.tenant_task_code_id := resolved_tenant_task_code_id;
    NEW.tenant_task_code_price_id := selected_price_id;
    NEW.task_code_code := COALESCE(NEW.task_code_code, selected_task_code, legacy_task_code);
    NEW.task_code_name := COALESCE(NEW.task_code_name, selected_task_name, legacy_task_name);
    NEW.task_code_price := COALESCE(NEW.task_code_price, selected_price, legacy_task_price);
    NEW.task_code_invoiceable := COALESCE(NEW.task_code_invoiceable, selected_task_invoiceable, legacy_task_invoiceable);
  ELSIF NEW.task_code_id IS NOT NULL THEN
    NEW.task_code_code := COALESCE(NEW.task_code_code, legacy_task_code);
    NEW.task_code_name := COALESCE(NEW.task_code_name, legacy_task_name);
    NEW.task_code_price := COALESCE(NEW.task_code_price, legacy_task_price);
    NEW.task_code_invoiceable := COALESCE(NEW.task_code_invoiceable, legacy_task_invoiceable);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_tasks_snapshot_task_code ON assignment_tasks;
CREATE TRIGGER trg_assignment_tasks_snapshot_task_code
  BEFORE INSERT OR UPDATE OF assignment_id, task_code_id, tenant_task_code_id
  ON assignment_tasks
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_snapshot_assignment_task_code();

DO $$
DECLARE
  mismatch_count integer;
BEGIN
  SELECT count(*) INTO mismatch_count
  FROM tenant_task_codes tenant_task_code
  WHERE tenant_task_code.sector_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM tenant_sectors tenant_sector
      WHERE tenant_sector.tenant_id = tenant_task_code.tenant_id
        AND tenant_sector.sector_id = tenant_task_code.sector_id
        AND tenant_sector.is_enabled = true
    );

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'tenant_task_codes contains % rows with sectors outside or disabled for their tenant; resolve before validating hard sector acceptance.', mismatch_count;
  END IF;

  SELECT count(*) INTO mismatch_count
  FROM assignment_tasks assignment_task
  JOIN assignments assignment_record ON assignment_record.id = assignment_task.assignment_id
  JOIN task_codes task_code ON task_code.id = assignment_task.task_code_id
  WHERE task_code.tenant_id <> assignment_record.tenant_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'assignment_tasks contains % rows where task_code tenant differs from assignment tenant; these rows will be blocked on future writes.', mismatch_count;
  END IF;
END;
$$;
