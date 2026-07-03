-- ============================================================================
-- Phase 2 post-migration tenant hardening
--
-- Staging-safe migration:
-- - keeps existing staging data intact;
-- - backfills tenant_id where it can be derived from strong parent relations;
-- - drops the remaining DEFAULT_TENANT_ID fallback from assignments.tenant_id;
-- - adds NOT VALID tenant_id-required checks for future sensitive tenantdata writes;
-- - leaves audit_log.tenant_id nullable for platform/global audit rows.
--
-- Do not add SET NOT NULL here. That belongs in a later staging-copy-verified
-- validation wave after unresolved legacy rows are reported and resolved.
-- ============================================================================

CREATE OR REPLACE FUNCTION pg_temp.fieldgrid_has_tenant_fk(p_table_name text)
RETURNS boolean AS $$
DECLARE
  result boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    JOIN pg_attribute attribute_row
      ON attribute_row.attrelid = constraint_row.conrelid
     AND attribute_row.attnum = ANY(constraint_row.conkey)
    WHERE constraint_row.conrelid = to_regclass(format('%I.%I', 'public', p_table_name))
      AND constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'public.tenants'::regclass
      AND attribute_row.attname = 'tenant_id'
  ) INTO result;

  RETURN COALESCE(result, false);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.fieldgrid_add_tenant_fk(p_table_name text, p_constraint_name text)
RETURNS void AS $$
BEGIN
  IF to_regclass(format('%I.%I', 'public', p_table_name)) IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns columns_row
    WHERE columns_row.table_schema = 'public'
      AND columns_row.table_name = p_table_name
      AND columns_row.column_name = 'tenant_id'
  ) THEN
    RETURN;
  END IF;

  IF pg_temp.fieldgrid_has_tenant_fk(p_table_name) THEN
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE NOT VALID',
    p_table_name,
    p_constraint_name
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.fieldgrid_add_tenant_required_check(p_table_name text, p_constraint_name text)
RETURNS void AS $$
BEGIN
  IF to_regclass(format('%I.%I', 'public', p_table_name)) IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns columns_row
    WHERE columns_row.table_schema = 'public'
      AND columns_row.table_name = p_table_name
      AND columns_row.column_name = 'tenant_id'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = to_regclass(format('%I.%I', 'public', p_table_name))
      AND constraint_row.conname = p_constraint_name
  ) THEN
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (tenant_id IS NOT NULL) NOT VALID',
    p_table_name,
    p_constraint_name
  );
END;
$$ LANGUAGE plpgsql;

ALTER TABLE IF EXISTS reports ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE IF EXISTS quotes ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE IF EXISTS invoices ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE IF EXISTS payments ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE IF EXISTS customer_payment_batches ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE IF EXISTS customer_payment_batch_items ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE IF EXISTS audit_log ADD COLUMN IF NOT EXISTS tenant_id uuid;

SELECT pg_temp.fieldgrid_add_tenant_fk('reports', 'reports_tenant_id_fkey');
SELECT pg_temp.fieldgrid_add_tenant_fk('quotes', 'quotes_tenant_id_fkey');
SELECT pg_temp.fieldgrid_add_tenant_fk('invoices', 'invoices_tenant_id_fkey');
SELECT pg_temp.fieldgrid_add_tenant_fk('payments', 'payments_tenant_id_fkey');
SELECT pg_temp.fieldgrid_add_tenant_fk('customer_payment_batches', 'customer_payment_batches_tenant_id_fkey');
SELECT pg_temp.fieldgrid_add_tenant_fk('customer_payment_batch_items', 'customer_payment_batch_items_tenant_id_fkey');
SELECT pg_temp.fieldgrid_add_tenant_fk('audit_log', 'audit_log_tenant_id_fkey');

-- assignments.tenant_id is already NOT NULL. Remove the legacy safety default so
-- missing runtime tenant context fails loudly instead of writing into a default tenant.
ALTER TABLE IF EXISTS assignments ALTER COLUMN tenant_id DROP DEFAULT;

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

UPDATE payments payment
SET tenant_id = invoice.tenant_id
FROM invoices invoice
WHERE payment.tenant_id IS NULL
  AND payment.invoice_id = invoice.id
  AND invoice.tenant_id IS NOT NULL;

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

WITH audit_metadata_tenant AS (
  SELECT
    id,
    COALESCE(metadata->>'tenantId', metadata->>'tenant_id') AS tenant_text
  FROM audit_log
  WHERE tenant_id IS NULL
    AND metadata IS NOT NULL
    AND COALESCE(metadata->>'tenantId', metadata->>'tenant_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
UPDATE audit_log audit
SET tenant_id = audit_metadata_tenant.tenant_text::uuid
FROM audit_metadata_tenant
JOIN tenants tenant ON tenant.id = audit_metadata_tenant.tenant_text::uuid
WHERE audit.id = audit_metadata_tenant.id;

CREATE INDEX IF NOT EXISTS reports_tenant_idx ON reports (tenant_id);
CREATE INDEX IF NOT EXISTS reports_tenant_assignment_idx ON reports (tenant_id, assignment_id);
CREATE INDEX IF NOT EXISTS quotes_tenant_idx ON quotes (tenant_id);
CREATE INDEX IF NOT EXISTS quotes_tenant_assignment_idx ON quotes (tenant_id, assignment_id);
CREATE INDEX IF NOT EXISTS quotes_tenant_customer_idx ON quotes (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS invoices_tenant_idx ON invoices (tenant_id);
CREATE INDEX IF NOT EXISTS invoices_tenant_assignment_idx ON invoices (tenant_id, assignment_id);
CREATE INDEX IF NOT EXISTS invoices_tenant_customer_idx ON invoices (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS payments_tenant_idx ON payments (tenant_id);
CREATE INDEX IF NOT EXISTS payments_tenant_invoice_idx ON payments (tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS customer_payment_batches_tenant_idx ON customer_payment_batches (tenant_id);
CREATE INDEX IF NOT EXISTS customer_payment_batches_tenant_customer_idx ON customer_payment_batches (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS customer_payment_batch_items_tenant_idx ON customer_payment_batch_items (tenant_id);
CREATE INDEX IF NOT EXISTS customer_payment_batch_items_tenant_batch_idx ON customer_payment_batch_items (tenant_id, batch_id);
CREATE INDEX IF NOT EXISTS customer_payment_batch_items_tenant_invoice_idx ON customer_payment_batch_items (tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS audit_log_tenant_idx ON audit_log (tenant_id);
CREATE INDEX IF NOT EXISTS audit_log_tenant_resource_idx ON audit_log (tenant_id, resource, resource_id);

SELECT pg_temp.fieldgrid_add_tenant_required_check('documents', 'documents_tenant_id_required_check');
SELECT pg_temp.fieldgrid_add_tenant_required_check('reports', 'reports_tenant_id_required_check');
SELECT pg_temp.fieldgrid_add_tenant_required_check('quotes', 'quotes_tenant_id_required_check');
SELECT pg_temp.fieldgrid_add_tenant_required_check('invoices', 'invoices_tenant_id_required_check');
SELECT pg_temp.fieldgrid_add_tenant_required_check('payments', 'payments_tenant_id_required_check');
SELECT pg_temp.fieldgrid_add_tenant_required_check('customer_payment_batches', 'customer_payment_batches_tenant_id_required_check');
SELECT pg_temp.fieldgrid_add_tenant_required_check('customer_payment_batch_items', 'customer_payment_batch_items_tenant_id_required_check');

COMMENT ON COLUMN audit_log.tenant_id IS
  'Tenant context for tenant-visible audit rows. NULL remains valid only for platform/global audit rows.';

DO $$
DECLARE
  row_result record;
BEGIN
  FOR row_result IN
    SELECT * FROM (
      SELECT 'documents' AS table_name, count(*)::integer AS unresolved_count FROM documents WHERE tenant_id IS NULL
      UNION ALL SELECT 'reports', count(*)::integer FROM reports WHERE tenant_id IS NULL
      UNION ALL SELECT 'quotes', count(*)::integer FROM quotes WHERE tenant_id IS NULL
      UNION ALL SELECT 'invoices', count(*)::integer FROM invoices WHERE tenant_id IS NULL
      UNION ALL SELECT 'payments', count(*)::integer FROM payments WHERE tenant_id IS NULL
      UNION ALL SELECT 'customer_payment_batches', count(*)::integer FROM customer_payment_batches WHERE tenant_id IS NULL
      UNION ALL SELECT 'customer_payment_batch_items', count(*)::integer FROM customer_payment_batch_items WHERE tenant_id IS NULL
      UNION ALL SELECT 'audit_log_nullable_by_design', count(*)::integer FROM audit_log WHERE tenant_id IS NULL
    ) unresolved
  LOOP
    IF row_result.unresolved_count > 0 THEN
      RAISE NOTICE 'phase2 tenant hardening: %.tenant_id unresolved rows = %', row_result.table_name, row_result.unresolved_count;
    END IF;
  END LOOP;
END;
$$;
