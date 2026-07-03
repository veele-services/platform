-- ============================================================================
-- Finance and reports tenant scope wave 2
--
-- Staging-safe migration:
-- - adds direct tenant_id columns to reports, quotes and invoices;
-- - backfills from assignments first, then customers where applicable;
-- - keeps unresolved legacy rows inspectable instead of forcing a destructive reset;
-- - adds write-time tenant consistency triggers so new rows cannot drift across tenants.
-- ============================================================================

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reports_tenant_id_fkey'
      AND conrelid = 'reports'::regclass
  ) THEN
    ALTER TABLE reports
      ADD CONSTRAINT reports_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quotes_tenant_id_fkey'
      AND conrelid = 'quotes'::regclass
  ) THEN
    ALTER TABLE quotes
      ADD CONSTRAINT quotes_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_tenant_id_fkey'
      AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END;
$$;

UPDATE reports report
SET tenant_id = assignment.tenant_id
FROM assignments assignment
WHERE report.tenant_id IS NULL
  AND report.assignment_id = assignment.id;

UPDATE quotes quote
SET tenant_id = assignment.tenant_id
FROM assignments assignment
WHERE quote.tenant_id IS NULL
  AND quote.assignment_id = assignment.id;

UPDATE quotes quote
SET tenant_id = customer.tenant_id
FROM customers customer
WHERE quote.tenant_id IS NULL
  AND quote.customer_id = customer.id;

UPDATE invoices invoice
SET tenant_id = assignment.tenant_id
FROM assignments assignment
WHERE invoice.tenant_id IS NULL
  AND invoice.assignment_id = assignment.id;

UPDATE invoices invoice
SET tenant_id = customer.tenant_id
FROM customers customer
WHERE invoice.tenant_id IS NULL
  AND invoice.customer_id = customer.id;

DO $$
DECLARE
  mismatch_count integer;
BEGIN
  SELECT count(*) INTO mismatch_count
  FROM quotes quote
  JOIN assignments assignment ON assignment.id = quote.assignment_id
  JOIN customers customer ON customer.id = quote.customer_id
  WHERE assignment.tenant_id <> customer.tenant_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'quotes backfill found % rows where assignment tenant and customer tenant differ; inspect before validating tenant consistency.', mismatch_count;
  END IF;

  SELECT count(*) INTO mismatch_count
  FROM invoices invoice
  JOIN assignments assignment ON assignment.id = invoice.assignment_id
  JOIN customers customer ON customer.id = invoice.customer_id
  WHERE assignment.tenant_id <> customer.tenant_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'invoices backfill found % rows where assignment tenant and customer tenant differ; inspect before validating tenant consistency.', mismatch_count;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fieldgrid_set_report_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tenant_id uuid;
BEGIN
  SELECT assignment.tenant_id INTO parent_tenant_id
  FROM assignments assignment
  WHERE assignment.id = NEW.assignment_id;

  IF parent_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Report assignment % does not resolve to a tenant', NEW.assignment_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := parent_tenant_id;
  ELSIF NEW.tenant_id <> parent_tenant_id THEN
    RAISE EXCEPTION 'Report tenant_id % does not match assignment tenant_id %', NEW.tenant_id, parent_tenant_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reports_set_tenant_id ON reports;
CREATE TRIGGER trg_reports_set_tenant_id
  BEFORE INSERT OR UPDATE OF tenant_id, assignment_id
  ON reports
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_set_report_tenant_id();

CREATE OR REPLACE FUNCTION fieldgrid_set_quote_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  assignment_tenant_id uuid;
  customer_tenant_id uuid;
BEGIN
  SELECT assignment.tenant_id INTO assignment_tenant_id
  FROM assignments assignment
  WHERE assignment.id = NEW.assignment_id;

  SELECT customer.tenant_id INTO customer_tenant_id
  FROM customers customer
  WHERE customer.id = NEW.customer_id;

  IF assignment_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Quote assignment % does not resolve to a tenant', NEW.assignment_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF customer_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Quote customer % does not resolve to a tenant', NEW.customer_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF assignment_tenant_id <> customer_tenant_id THEN
    RAISE EXCEPTION 'Quote assignment tenant_id % does not match customer tenant_id %', assignment_tenant_id, customer_tenant_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := assignment_tenant_id;
  ELSIF NEW.tenant_id <> assignment_tenant_id THEN
    RAISE EXCEPTION 'Quote tenant_id % does not match parent tenant_id %', NEW.tenant_id, assignment_tenant_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotes_set_tenant_id ON quotes;
CREATE TRIGGER trg_quotes_set_tenant_id
  BEFORE INSERT OR UPDATE OF tenant_id, assignment_id, customer_id
  ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_set_quote_tenant_id();

CREATE OR REPLACE FUNCTION fieldgrid_set_invoice_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  assignment_tenant_id uuid;
  customer_tenant_id uuid;
BEGIN
  SELECT assignment.tenant_id INTO assignment_tenant_id
  FROM assignments assignment
  WHERE assignment.id = NEW.assignment_id;

  SELECT customer.tenant_id INTO customer_tenant_id
  FROM customers customer
  WHERE customer.id = NEW.customer_id;

  IF assignment_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Invoice assignment % does not resolve to a tenant', NEW.assignment_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF customer_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Invoice customer % does not resolve to a tenant', NEW.customer_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF assignment_tenant_id <> customer_tenant_id THEN
    RAISE EXCEPTION 'Invoice assignment tenant_id % does not match customer tenant_id %', assignment_tenant_id, customer_tenant_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := assignment_tenant_id;
  ELSIF NEW.tenant_id <> assignment_tenant_id THEN
    RAISE EXCEPTION 'Invoice tenant_id % does not match parent tenant_id %', NEW.tenant_id, assignment_tenant_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_set_tenant_id ON invoices;
CREATE TRIGGER trg_invoices_set_tenant_id
  BEFORE INSERT OR UPDATE OF tenant_id, assignment_id, customer_id
  ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_set_invoice_tenant_id();

CREATE INDEX IF NOT EXISTS reports_tenant_idx
  ON reports (tenant_id);

CREATE INDEX IF NOT EXISTS reports_tenant_assignment_idx
  ON reports (tenant_id, assignment_id);

CREATE INDEX IF NOT EXISTS quotes_tenant_idx
  ON quotes (tenant_id);

CREATE INDEX IF NOT EXISTS quotes_tenant_assignment_idx
  ON quotes (tenant_id, assignment_id);

CREATE INDEX IF NOT EXISTS quotes_tenant_customer_idx
  ON quotes (tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS invoices_tenant_idx
  ON invoices (tenant_id);

CREATE INDEX IF NOT EXISTS invoices_tenant_assignment_idx
  ON invoices (tenant_id, assignment_id);

CREATE INDEX IF NOT EXISTS invoices_tenant_customer_idx
  ON invoices (tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS invoices_tenant_status_idx
  ON invoices (tenant_id, status);

DO $$
DECLARE
  unresolved_count integer;
BEGIN
  SELECT count(*) INTO unresolved_count
  FROM reports
  WHERE tenant_id IS NULL;

  IF unresolved_count = 0 THEN
    ALTER TABLE reports
      ALTER COLUMN tenant_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'reports.tenant_id backfill left % unresolved legacy rows; resolve before enforcing NOT NULL.', unresolved_count;
  END IF;

  SELECT count(*) INTO unresolved_count
  FROM quotes
  WHERE tenant_id IS NULL;

  IF unresolved_count = 0 THEN
    ALTER TABLE quotes
      ALTER COLUMN tenant_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'quotes.tenant_id backfill left % unresolved legacy rows; resolve before enforcing NOT NULL.', unresolved_count;
  END IF;

  SELECT count(*) INTO unresolved_count
  FROM invoices
  WHERE tenant_id IS NULL;

  IF unresolved_count = 0 THEN
    ALTER TABLE invoices
      ALTER COLUMN tenant_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'invoices.tenant_id backfill left % unresolved legacy rows; resolve before enforcing NOT NULL.', unresolved_count;
  END IF;
END;
$$;
