-- Sprint 9 - Invoice security, RBAC and audit hardening.
-- Close direct Supabase/PostgREST access for invoice canon tables and add
-- database-side tenant consistency guards for invoice numbering and snapshots.

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_numbering_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_number_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_template_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_item_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  role_name text;
  table_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH table_name IN ARRAY ARRAY[
        'invoices',
        'tenant_company_settings',
        'invoice_numbering_settings',
        'invoice_number_sequences',
        'invoice_payment_settings',
        'invoice_template_settings',
        'invoice_line_item_snapshots'
      ] LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.fieldgrid_validate_invoice_number_sequence_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.invoice_numbering_settings settings
    WHERE settings.id = NEW.numbering_settings_id
      AND settings.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'invoice_number_sequences tenant_id must match invoice_numbering_settings tenant_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_number_sequences_tenant_guard ON public.invoice_number_sequences;
CREATE TRIGGER trg_invoice_number_sequences_tenant_guard
BEFORE INSERT OR UPDATE OF tenant_id, numbering_settings_id
ON public.invoice_number_sequences
FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_validate_invoice_number_sequence_tenant();

CREATE OR REPLACE FUNCTION public.fieldgrid_validate_invoice_line_snapshot_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.invoices invoice
    WHERE invoice.id = NEW.invoice_id
      AND invoice.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'invoice_line_item_snapshots tenant_id must match invoice tenant_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_line_item_snapshots_tenant_guard ON public.invoice_line_item_snapshots;
CREATE TRIGGER trg_invoice_line_item_snapshots_tenant_guard
BEFORE INSERT OR UPDATE OF tenant_id, invoice_id
ON public.invoice_line_item_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_validate_invoice_line_snapshot_tenant();
