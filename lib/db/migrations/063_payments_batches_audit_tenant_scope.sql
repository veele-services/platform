-- ============================================================================
-- Payments, batches and audit tenant scope wave 3/4
--
-- Staging-safe migration:
-- - adds direct tenant_id columns to payments and customer payment batches;
-- - adds tenant_id to customer payment batch items;
-- - adds nullable tenant_id to audit_log so tenant audit can be separated from
--   platform/global audit without breaking existing platform-only rows;
-- - backfills from invoices, customers, batches and resource-specific audit ids;
-- - adds write-time tenant consistency triggers for new payment and batch rows.
-- ============================================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE customer_payment_batches
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE customer_payment_batch_items
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_tenant_id_fkey'
      AND conrelid = 'payments'::regclass
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_tenant_id_fkey
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
    WHERE conname = 'customer_payment_batches_tenant_id_fkey'
      AND conrelid = 'customer_payment_batches'::regclass
  ) THEN
    ALTER TABLE customer_payment_batches
      ADD CONSTRAINT customer_payment_batches_tenant_id_fkey
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
    WHERE conname = 'customer_payment_batch_items_tenant_id_fkey'
      AND conrelid = 'customer_payment_batch_items'::regclass
  ) THEN
    ALTER TABLE customer_payment_batch_items
      ADD CONSTRAINT customer_payment_batch_items_tenant_id_fkey
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
    WHERE conname = 'audit_log_tenant_id_fkey'
      AND conrelid = 'audit_log'::regclass
  ) THEN
    ALTER TABLE audit_log
      ADD CONSTRAINT audit_log_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END;
$$;

UPDATE payments payment
SET tenant_id = invoice.tenant_id
FROM invoices invoice
WHERE payment.tenant_id IS NULL
  AND payment.invoice_id = invoice.id
  AND invoice.tenant_id IS NOT NULL;

UPDATE payments payment
SET tenant_id = assignment.tenant_id
FROM invoices invoice
JOIN assignments assignment ON assignment.id = invoice.assignment_id
WHERE payment.tenant_id IS NULL
  AND payment.invoice_id = invoice.id;

UPDATE customer_payment_batches batch
SET tenant_id = customer.tenant_id
FROM customers customer
WHERE batch.tenant_id IS NULL
  AND batch.customer_id = customer.id;

UPDATE customer_payment_batch_items item
SET tenant_id = batch.tenant_id
FROM customer_payment_batches batch
WHERE item.tenant_id IS NULL
  AND item.batch_id = batch.id
  AND batch.tenant_id IS NOT NULL;

UPDATE customer_payment_batch_items item
SET tenant_id = invoice.tenant_id
FROM invoices invoice
WHERE item.tenant_id IS NULL
  AND item.invoice_id = invoice.id
  AND invoice.tenant_id IS NOT NULL;

UPDATE customer_payment_batch_items item
SET tenant_id = assignment.tenant_id
FROM invoices invoice
JOIN assignments assignment ON assignment.id = invoice.assignment_id
WHERE item.tenant_id IS NULL
  AND item.invoice_id = invoice.id;

DO $$
DECLARE
  mismatch_count integer;
BEGIN
  SELECT count(*) INTO mismatch_count
  FROM payments payment
  JOIN invoices invoice ON invoice.id = payment.invoice_id
  WHERE payment.tenant_id IS NOT NULL
    AND invoice.tenant_id IS NOT NULL
    AND payment.tenant_id <> invoice.tenant_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'payments backfill found % rows where payment tenant and invoice tenant differ; inspect before validating tenant consistency.', mismatch_count;
  END IF;

  SELECT count(*) INTO mismatch_count
  FROM customer_payment_batches batch
  JOIN customers customer ON customer.id = batch.customer_id
  WHERE batch.tenant_id IS NOT NULL
    AND batch.tenant_id <> customer.tenant_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'customer_payment_batches backfill found % rows where batch tenant and customer tenant differ; inspect before validating tenant consistency.', mismatch_count;
  END IF;

  SELECT count(*) INTO mismatch_count
  FROM customer_payment_batches batch
  JOIN objects object_record ON object_record.id = batch.object_id
  WHERE batch.tenant_id IS NOT NULL
    AND batch.object_id IS NOT NULL
    AND batch.tenant_id <> object_record.tenant_id;

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'customer_payment_batches backfill found % rows where batch tenant and object tenant differ; inspect before validating tenant consistency.', mismatch_count;
  END IF;

  SELECT count(*) INTO mismatch_count
  FROM customer_payment_batch_items item
  JOIN customer_payment_batches batch ON batch.id = item.batch_id
  JOIN invoices invoice ON invoice.id = item.invoice_id
  WHERE item.tenant_id IS NOT NULL
    AND batch.tenant_id IS NOT NULL
    AND invoice.tenant_id IS NOT NULL
    AND (item.tenant_id <> batch.tenant_id OR item.tenant_id <> invoice.tenant_id);

  IF mismatch_count > 0 THEN
    RAISE NOTICE 'customer_payment_batch_items backfill found % rows where item, batch and invoice tenants differ; inspect before validating tenant consistency.', mismatch_count;
  END IF;
END;
$$;

WITH metadata_tenant AS (
  SELECT
    audit.id,
    (audit.metadata ->> 'tenantId')::uuid AS tenant_id
  FROM audit_log audit
  WHERE audit.tenant_id IS NULL
    AND audit.metadata ? 'tenantId'
    AND (audit.metadata ->> 'tenantId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
UPDATE audit_log audit
SET tenant_id = metadata_tenant.tenant_id
FROM metadata_tenant
JOIN tenants tenant ON tenant.id = metadata_tenant.tenant_id
WHERE audit.id = metadata_tenant.id;

UPDATE audit_log audit
SET tenant_id = invoice.tenant_id
FROM invoices invoice
WHERE audit.tenant_id IS NULL
  AND audit.resource = 'invoices'
  AND audit.resource_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND audit.resource_id::uuid = invoice.id
  AND invoice.tenant_id IS NOT NULL;

UPDATE audit_log audit
SET tenant_id = quote.tenant_id
FROM quotes quote
WHERE audit.tenant_id IS NULL
  AND audit.resource = 'quotes'
  AND audit.resource_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND audit.resource_id::uuid = quote.id
  AND quote.tenant_id IS NOT NULL;

UPDATE audit_log audit
SET tenant_id = report.tenant_id
FROM reports report
WHERE audit.tenant_id IS NULL
  AND audit.resource = 'reports'
  AND audit.resource_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND audit.resource_id::uuid = report.id
  AND report.tenant_id IS NOT NULL;

UPDATE audit_log audit
SET tenant_id = payment.tenant_id
FROM payments payment
WHERE audit.tenant_id IS NULL
  AND audit.resource = 'payments'
  AND audit.resource_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND audit.resource_id::uuid = payment.id
  AND payment.tenant_id IS NOT NULL;

UPDATE audit_log audit
SET tenant_id = batch.tenant_id
FROM customer_payment_batches batch
WHERE audit.tenant_id IS NULL
  AND audit.resource = 'customer_payment_batches'
  AND audit.resource_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND audit.resource_id::uuid = batch.id
  AND batch.tenant_id IS NOT NULL;

UPDATE audit_log audit
SET tenant_id = document.tenant_id
FROM documents document
WHERE audit.tenant_id IS NULL
  AND audit.resource = 'documents'
  AND audit.resource_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND audit.resource_id::uuid = document.id
  AND document.tenant_id IS NOT NULL;

UPDATE audit_log audit
SET tenant_id = customer.tenant_id
FROM customers customer
WHERE audit.tenant_id IS NULL
  AND audit.resource = 'customers'
  AND audit.resource_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND audit.resource_id::uuid = customer.id;

UPDATE audit_log audit
SET tenant_id = object_record.tenant_id
FROM objects object_record
WHERE audit.tenant_id IS NULL
  AND audit.resource = 'objects'
  AND audit.resource_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND audit.resource_id::uuid = object_record.id;

UPDATE audit_log audit
SET tenant_id = assignment.tenant_id
FROM assignments assignment
WHERE audit.tenant_id IS NULL
  AND audit.resource = 'assignments'
  AND audit.resource_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND audit.resource_id::uuid = assignment.id;

CREATE OR REPLACE FUNCTION fieldgrid_set_payment_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tenant_id uuid;
BEGIN
  SELECT invoice.tenant_id INTO parent_tenant_id
  FROM invoices invoice
  WHERE invoice.id = NEW.invoice_id;

  IF parent_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Payment invoice % does not resolve to a tenant', NEW.invoice_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := parent_tenant_id;
  ELSIF NEW.tenant_id <> parent_tenant_id THEN
    RAISE EXCEPTION 'Payment tenant_id % does not match invoice tenant_id %', NEW.tenant_id, parent_tenant_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_set_tenant_id ON payments;
CREATE TRIGGER trg_payments_set_tenant_id
  BEFORE INSERT OR UPDATE OF tenant_id, invoice_id
  ON payments
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_set_payment_tenant_id();

CREATE OR REPLACE FUNCTION fieldgrid_set_customer_payment_batch_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  customer_tenant_id uuid;
  object_tenant_id uuid;
BEGIN
  SELECT customer.tenant_id INTO customer_tenant_id
  FROM customers customer
  WHERE customer.id = NEW.customer_id;

  IF customer_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Customer payment batch customer % does not resolve to a tenant', NEW.customer_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.object_id IS NOT NULL THEN
    SELECT object_record.tenant_id INTO object_tenant_id
    FROM objects object_record
    WHERE object_record.id = NEW.object_id;

    IF object_tenant_id IS NULL THEN
      RAISE EXCEPTION 'Customer payment batch object % does not resolve to a tenant', NEW.object_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF object_tenant_id <> customer_tenant_id THEN
      RAISE EXCEPTION 'Customer payment batch object tenant_id % does not match customer tenant_id %', object_tenant_id, customer_tenant_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := customer_tenant_id;
  ELSIF NEW.tenant_id <> customer_tenant_id THEN
    RAISE EXCEPTION 'Customer payment batch tenant_id % does not match customer tenant_id %', NEW.tenant_id, customer_tenant_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_payment_batches_set_tenant_id ON customer_payment_batches;
CREATE TRIGGER trg_customer_payment_batches_set_tenant_id
  BEFORE INSERT OR UPDATE OF tenant_id, customer_id, object_id
  ON customer_payment_batches
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_set_customer_payment_batch_tenant_id();

CREATE OR REPLACE FUNCTION fieldgrid_set_customer_payment_batch_item_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  batch_tenant_id uuid;
  invoice_tenant_id uuid;
BEGIN
  SELECT batch.tenant_id INTO batch_tenant_id
  FROM customer_payment_batches batch
  WHERE batch.id = NEW.batch_id;

  SELECT invoice.tenant_id INTO invoice_tenant_id
  FROM invoices invoice
  WHERE invoice.id = NEW.invoice_id;

  IF batch_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Customer payment batch item batch % does not resolve to a tenant', NEW.batch_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF invoice_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Customer payment batch item invoice % does not resolve to a tenant', NEW.invoice_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF batch_tenant_id <> invoice_tenant_id THEN
    RAISE EXCEPTION 'Customer payment batch item batch tenant_id % does not match invoice tenant_id %', batch_tenant_id, invoice_tenant_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := batch_tenant_id;
  ELSIF NEW.tenant_id <> batch_tenant_id THEN
    RAISE EXCEPTION 'Customer payment batch item tenant_id % does not match parent tenant_id %', NEW.tenant_id, batch_tenant_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_payment_batch_items_set_tenant_id ON customer_payment_batch_items;
CREATE TRIGGER trg_customer_payment_batch_items_set_tenant_id
  BEFORE INSERT OR UPDATE OF tenant_id, batch_id, invoice_id
  ON customer_payment_batch_items
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_set_customer_payment_batch_item_tenant_id();

CREATE OR REPLACE FUNCTION fieldgrid_set_audit_log_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  inferred_tenant_id uuid;
BEGIN
  IF NEW.tenant_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.metadata ? 'tenantId'
    AND (NEW.metadata ->> 'tenantId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    inferred_tenant_id := (NEW.metadata ->> 'tenantId')::uuid;
  ELSIF NEW.resource_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    IF NEW.resource = 'invoices' THEN
      SELECT tenant_id INTO inferred_tenant_id FROM invoices WHERE id = NEW.resource_id::uuid;
    ELSIF NEW.resource = 'quotes' THEN
      SELECT tenant_id INTO inferred_tenant_id FROM quotes WHERE id = NEW.resource_id::uuid;
    ELSIF NEW.resource = 'reports' THEN
      SELECT tenant_id INTO inferred_tenant_id FROM reports WHERE id = NEW.resource_id::uuid;
    ELSIF NEW.resource = 'payments' THEN
      SELECT tenant_id INTO inferred_tenant_id FROM payments WHERE id = NEW.resource_id::uuid;
    ELSIF NEW.resource = 'customer_payment_batches' THEN
      SELECT tenant_id INTO inferred_tenant_id FROM customer_payment_batches WHERE id = NEW.resource_id::uuid;
    ELSIF NEW.resource = 'documents' THEN
      SELECT tenant_id INTO inferred_tenant_id FROM documents WHERE id = NEW.resource_id::uuid;
    ELSIF NEW.resource = 'customers' THEN
      SELECT tenant_id INTO inferred_tenant_id FROM customers WHERE id = NEW.resource_id::uuid;
    ELSIF NEW.resource = 'objects' THEN
      SELECT tenant_id INTO inferred_tenant_id FROM objects WHERE id = NEW.resource_id::uuid;
    ELSIF NEW.resource = 'assignments' THEN
      SELECT tenant_id INTO inferred_tenant_id FROM assignments WHERE id = NEW.resource_id::uuid;
    END IF;
  END IF;

  IF inferred_tenant_id IS NOT NULL THEN
    NEW.tenant_id := inferred_tenant_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_set_tenant_id ON audit_log;
CREATE TRIGGER trg_audit_log_set_tenant_id
  BEFORE INSERT OR UPDATE OF tenant_id, resource, resource_id, metadata
  ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION fieldgrid_set_audit_log_tenant_id();

CREATE INDEX IF NOT EXISTS payments_tenant_idx
  ON payments (tenant_id);

CREATE INDEX IF NOT EXISTS payments_tenant_invoice_idx
  ON payments (tenant_id, invoice_id);

CREATE INDEX IF NOT EXISTS payments_tenant_status_idx
  ON payments (tenant_id, status);

CREATE INDEX IF NOT EXISTS customer_payment_batches_tenant_idx
  ON customer_payment_batches (tenant_id);

CREATE INDEX IF NOT EXISTS customer_payment_batches_tenant_customer_idx
  ON customer_payment_batches (tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS customer_payment_batches_tenant_status_idx
  ON customer_payment_batches (tenant_id, status);

CREATE INDEX IF NOT EXISTS customer_payment_batch_items_tenant_idx
  ON customer_payment_batch_items (tenant_id);

CREATE INDEX IF NOT EXISTS customer_payment_batch_items_tenant_batch_idx
  ON customer_payment_batch_items (tenant_id, batch_id);

CREATE INDEX IF NOT EXISTS customer_payment_batch_items_tenant_invoice_idx
  ON customer_payment_batch_items (tenant_id, invoice_id);

CREATE INDEX IF NOT EXISTS audit_log_tenant_idx
  ON audit_log (tenant_id);

CREATE INDEX IF NOT EXISTS audit_log_tenant_resource_idx
  ON audit_log (tenant_id, resource, resource_id);

CREATE INDEX IF NOT EXISTS audit_log_tenant_created_idx
  ON audit_log (tenant_id, created_at);

DO $$
DECLARE
  unresolved_count integer;
BEGIN
  SELECT count(*) INTO unresolved_count
  FROM payments
  WHERE tenant_id IS NULL;

  IF unresolved_count = 0 THEN
    ALTER TABLE payments
      ALTER COLUMN tenant_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'payments.tenant_id backfill left % unresolved legacy rows; resolve before enforcing NOT NULL.', unresolved_count;
  END IF;

  SELECT count(*) INTO unresolved_count
  FROM customer_payment_batches
  WHERE tenant_id IS NULL;

  IF unresolved_count = 0 THEN
    ALTER TABLE customer_payment_batches
      ALTER COLUMN tenant_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'customer_payment_batches.tenant_id backfill left % unresolved legacy rows; resolve before enforcing NOT NULL.', unresolved_count;
  END IF;

  SELECT count(*) INTO unresolved_count
  FROM customer_payment_batch_items
  WHERE tenant_id IS NULL;

  IF unresolved_count = 0 THEN
    ALTER TABLE customer_payment_batch_items
      ALTER COLUMN tenant_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'customer_payment_batch_items.tenant_id backfill left % unresolved legacy rows; resolve before enforcing NOT NULL.', unresolved_count;
  END IF;

  SELECT count(*) INTO unresolved_count
  FROM audit_log
  WHERE tenant_id IS NULL;

  IF unresolved_count > 0 THEN
    RAISE NOTICE 'audit_log.tenant_id backfill left % platform/global/unclassified rows with tenant_id NULL; this is expected until audit is fully split.', unresolved_count;
  END IF;
END;
$$;
