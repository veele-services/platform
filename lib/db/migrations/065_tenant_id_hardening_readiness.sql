-- ============================================================================
-- Sprint 8 tenant_id hardening readiness
--
-- Staging-safe migration:
-- - validates existing tenant foreign keys and tenant_id required checks only when
--   the relevant data is already clean;
-- - creates a read-only readiness view for the sensitive tenantdata hardening wave;
-- - does not SET NOT NULL, drop data, rewrite storage, or reset staging state.
--
-- SET NOT NULL remains a later, explicit step after empty DB and staging-copy
-- migration smoke have proven zero unresolved rows and validated constraints.
-- ============================================================================

CREATE OR REPLACE FUNCTION pg_temp.fieldgrid_validate_tenant_fk_if_clean(
  p_table_name text,
  p_constraint_name text
)
RETURNS void AS $$
DECLARE
  invalid_count bigint;
  is_validated boolean;
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

  SELECT constraint_row.convalidated INTO is_validated
  FROM pg_constraint constraint_row
  WHERE constraint_row.conrelid = to_regclass(format('%I.%I', 'public', p_table_name))
    AND constraint_row.conname = p_constraint_name;

  IF is_validated IS NULL OR is_validated THEN
    RETURN;
  END IF;

  EXECUTE format(
    'SELECT count(*) FROM public.%I row_data LEFT JOIN public.tenants tenant ON tenant.id = row_data.tenant_id WHERE row_data.tenant_id IS NOT NULL AND tenant.id IS NULL',
    p_table_name
  ) INTO invalid_count;

  IF invalid_count = 0 THEN
    EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', p_table_name, p_constraint_name);
  ELSE
    RAISE NOTICE 'sprint8 tenant hardening: %.% not validated; invalid tenant references = %',
      p_table_name,
      p_constraint_name,
      invalid_count;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.fieldgrid_validate_required_check_if_clean(
  p_table_name text,
  p_constraint_name text
)
RETURNS void AS $$
DECLARE
  unresolved_count bigint;
  is_validated boolean;
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

  SELECT constraint_row.convalidated INTO is_validated
  FROM pg_constraint constraint_row
  WHERE constraint_row.conrelid = to_regclass(format('%I.%I', 'public', p_table_name))
    AND constraint_row.conname = p_constraint_name;

  IF is_validated IS NULL OR is_validated THEN
    RETURN;
  END IF;

  EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id IS NULL', p_table_name)
    INTO unresolved_count;

  IF unresolved_count = 0 THEN
    EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', p_table_name, p_constraint_name);
  ELSE
    RAISE NOTICE 'sprint8 tenant hardening: %.% not validated; unresolved tenant_id rows = %',
      p_table_name,
      p_constraint_name,
      unresolved_count;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Validate tenant foreign keys where clean. Null tenant_id rows do not block FK
-- validation; invalid non-null tenant references do.
SELECT pg_temp.fieldgrid_validate_tenant_fk_if_clean('documents', 'documents_tenant_id_fkey');
SELECT pg_temp.fieldgrid_validate_tenant_fk_if_clean('reports', 'reports_tenant_id_fkey');
SELECT pg_temp.fieldgrid_validate_tenant_fk_if_clean('quotes', 'quotes_tenant_id_fkey');
SELECT pg_temp.fieldgrid_validate_tenant_fk_if_clean('invoices', 'invoices_tenant_id_fkey');
SELECT pg_temp.fieldgrid_validate_tenant_fk_if_clean('payments', 'payments_tenant_id_fkey');
SELECT pg_temp.fieldgrid_validate_tenant_fk_if_clean('customer_payment_batches', 'customer_payment_batches_tenant_id_fkey');
SELECT pg_temp.fieldgrid_validate_tenant_fk_if_clean('customer_payment_batch_items', 'customer_payment_batch_items_tenant_id_fkey');
SELECT pg_temp.fieldgrid_validate_tenant_fk_if_clean('audit_log', 'audit_log_tenant_id_fkey');

-- Validate required tenant_id checks only when unresolved rows are zero.
SELECT pg_temp.fieldgrid_validate_required_check_if_clean('documents', 'documents_tenant_id_required_check');
SELECT pg_temp.fieldgrid_validate_required_check_if_clean('reports', 'reports_tenant_id_required_check');
SELECT pg_temp.fieldgrid_validate_required_check_if_clean('quotes', 'quotes_tenant_id_required_check');
SELECT pg_temp.fieldgrid_validate_required_check_if_clean('invoices', 'invoices_tenant_id_required_check');
SELECT pg_temp.fieldgrid_validate_required_check_if_clean('payments', 'payments_tenant_id_required_check');
SELECT pg_temp.fieldgrid_validate_required_check_if_clean('customer_payment_batches', 'customer_payment_batches_tenant_id_required_check');
SELECT pg_temp.fieldgrid_validate_required_check_if_clean('customer_payment_batch_items', 'customer_payment_batch_items_tenant_id_required_check');

CREATE OR REPLACE VIEW public.fieldgrid_tenant_id_hardening_readiness AS
WITH table_counts AS (
  SELECT 'documents'::text AS table_name, false AS nullable_by_design, count(*)::bigint AS total_rows, count(*) FILTER (WHERE tenant_id IS NULL)::bigint AS unresolved_tenant_id FROM public.documents
  UNION ALL SELECT 'reports', false, count(*)::bigint, count(*) FILTER (WHERE tenant_id IS NULL)::bigint FROM public.reports
  UNION ALL SELECT 'quotes', false, count(*)::bigint, count(*) FILTER (WHERE tenant_id IS NULL)::bigint FROM public.quotes
  UNION ALL SELECT 'invoices', false, count(*)::bigint, count(*) FILTER (WHERE tenant_id IS NULL)::bigint FROM public.invoices
  UNION ALL SELECT 'payments', false, count(*)::bigint, count(*) FILTER (WHERE tenant_id IS NULL)::bigint FROM public.payments
  UNION ALL SELECT 'customer_payment_batches', false, count(*)::bigint, count(*) FILTER (WHERE tenant_id IS NULL)::bigint FROM public.customer_payment_batches
  UNION ALL SELECT 'customer_payment_batch_items', false, count(*)::bigint, count(*) FILTER (WHERE tenant_id IS NULL)::bigint FROM public.customer_payment_batch_items
  UNION ALL SELECT 'audit_log', true, count(*)::bigint, count(*) FILTER (WHERE tenant_id IS NULL)::bigint FROM public.audit_log
), column_state AS (
  SELECT
    columns_row.table_name,
    columns_row.is_nullable AS tenant_id_nullable,
    columns_row.column_default AS tenant_id_default
  FROM information_schema.columns columns_row
  WHERE columns_row.table_schema = 'public'
    AND columns_row.column_name = 'tenant_id'
    AND columns_row.table_name IN (
      'documents',
      'reports',
      'quotes',
      'invoices',
      'payments',
      'customer_payment_batches',
      'customer_payment_batch_items',
      'audit_log'
    )
), constraint_state AS (
  SELECT
    rel.relname AS table_name,
    bool_or(constraint_row.contype = 'f' AND constraint_row.conname = rel.relname || '_tenant_id_fkey') AS tenant_fk_exists,
    bool_or(constraint_row.contype = 'f' AND constraint_row.conname = rel.relname || '_tenant_id_fkey' AND constraint_row.convalidated) AS tenant_fk_validated,
    bool_or(constraint_row.contype = 'c' AND constraint_row.conname = rel.relname || '_tenant_id_required_check') AS required_check_exists,
    bool_or(constraint_row.contype = 'c' AND constraint_row.conname = rel.relname || '_tenant_id_required_check' AND constraint_row.convalidated) AS required_check_validated
  FROM pg_constraint constraint_row
  JOIN pg_class rel ON rel.oid = constraint_row.conrelid
  JOIN pg_namespace namespace_row ON namespace_row.oid = rel.relnamespace
  WHERE namespace_row.nspname = 'public'
    AND rel.relname IN (
      'documents',
      'reports',
      'quotes',
      'invoices',
      'payments',
      'customer_payment_batches',
      'customer_payment_batch_items',
      'audit_log'
    )
  GROUP BY rel.relname
)
SELECT
  table_counts.table_name,
  CASE
    WHEN table_counts.table_name = 'audit_log' THEN 'tenant_audit_nullable_by_design'
    ELSE 'sensitive_tenant_data'
  END AS classification,
  table_counts.nullable_by_design,
  table_counts.total_rows,
  table_counts.unresolved_tenant_id,
  column_state.tenant_id_nullable,
  column_state.tenant_id_default,
  coalesce(constraint_state.tenant_fk_exists, false) AS tenant_fk_exists,
  coalesce(constraint_state.tenant_fk_validated, false) AS tenant_fk_validated,
  coalesce(constraint_state.required_check_exists, false) AS required_check_exists,
  CASE
    WHEN table_counts.nullable_by_design THEN NULL
    ELSE coalesce(constraint_state.required_check_validated, false)
  END AS required_check_validated,
  CASE
    WHEN table_counts.nullable_by_design THEN false
    WHEN column_state.tenant_id_nullable = 'NO' THEN false
    WHEN table_counts.unresolved_tenant_id = 0
      AND column_state.tenant_id_default IS NULL
      AND coalesce(constraint_state.tenant_fk_validated, false)
      AND coalesce(constraint_state.required_check_validated, false)
      THEN true
    ELSE false
  END AS ready_for_not_null,
  CASE
    WHEN table_counts.nullable_by_design THEN 'nullable_by_design'
    WHEN column_state.tenant_id_nullable = 'NO' THEN 'done_not_null'
    WHEN column_state.tenant_id_default IS NOT NULL THEN 'default_must_be_removed'
    WHEN table_counts.unresolved_tenant_id > 0 THEN 'unresolved_rows'
    WHEN NOT coalesce(constraint_state.tenant_fk_validated, false) THEN 'tenant_fk_validation_pending'
    WHEN NOT coalesce(constraint_state.required_check_validated, false) THEN 'required_check_validation_pending'
    ELSE 'ready_for_not_null'
  END AS hardening_status
FROM table_counts
LEFT JOIN column_state ON column_state.table_name = table_counts.table_name
LEFT JOIN constraint_state ON constraint_state.table_name = table_counts.table_name
ORDER BY table_counts.nullable_by_design, table_counts.table_name;

COMMENT ON VIEW public.fieldgrid_tenant_id_hardening_readiness IS
  'Sprint 8 read-only readiness view for tenant_id hardening. Sensitive tenant tables can only move to SET NOT NULL after zero unresolved rows, no tenant_id default, validated tenant FK, validated tenant_id required check, and migration smoke on empty DB plus staging-copy.';

COMMENT ON COLUMN public.fieldgrid_tenant_id_hardening_readiness.ready_for_not_null IS
  'True only for non-audit sensitive tenant tables that are clean enough for a later explicit SET NOT NULL migration after smoke proof.';

DO $$
DECLARE
  row_result record;
BEGIN
  FOR row_result IN
    SELECT table_name, hardening_status, unresolved_tenant_id
    FROM public.fieldgrid_tenant_id_hardening_readiness
  LOOP
    RAISE NOTICE 'sprint8 tenant_id hardening readiness: table=%, status=%, unresolved=%',
      row_result.table_name,
      row_result.hardening_status,
      row_result.unresolved_tenant_id;
  END LOOP;
END;
$$;
