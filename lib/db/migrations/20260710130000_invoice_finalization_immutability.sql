-- Sprint 3: final invoice data is immutable after finalization.

CREATE OR REPLACE FUNCTION public.fieldgrid_prevent_finalized_invoice_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.finalized_at IS NOT NULL THEN
    IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
      OR NEW.invoice_numbering_settings_id IS DISTINCT FROM OLD.invoice_numbering_settings_id
      OR NEW.invoice_number_period_key IS DISTINCT FROM OLD.invoice_number_period_key
      OR NEW.invoice_number_sequence_value IS DISTINCT FROM OLD.invoice_number_sequence_value
      OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
      OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
      OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
      OR NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.vat_percentage IS DISTINCT FROM OLD.vat_percentage
      OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.notes IS DISTINCT FROM OLD.notes
      OR NEW.company_snapshot_json IS DISTINCT FROM OLD.company_snapshot_json
      OR NEW.invoice_settings_snapshot_json IS DISTINCT FROM OLD.invoice_settings_snapshot_json
      OR NEW.payment_settings_snapshot_json IS DISTINCT FROM OLD.payment_settings_snapshot_json
      OR NEW.template_snapshot_json IS DISTINCT FROM OLD.template_snapshot_json
      OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at
    THEN
      RAISE EXCEPTION 'Finalized invoice data is immutable'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_finalized_invoice_mutation ON public.invoices;
CREATE TRIGGER prevent_finalized_invoice_mutation
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_prevent_finalized_invoice_mutation();

CREATE OR REPLACE FUNCTION public.fieldgrid_prevent_finalized_invoice_line_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_invoice_id uuid;
  target_finalized_at timestamptz;
BEGIN
  target_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT finalized_at
    INTO target_finalized_at
  FROM public.invoices
  WHERE id = target_invoice_id;

  IF target_finalized_at IS NOT NULL THEN
    RAISE EXCEPTION 'Finalized invoice line snapshots are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS prevent_finalized_invoice_line_snapshot_insert ON public.invoice_line_item_snapshots;
DROP TRIGGER IF EXISTS prevent_finalized_invoice_line_snapshot_update ON public.invoice_line_item_snapshots;
DROP TRIGGER IF EXISTS prevent_finalized_invoice_line_snapshot_delete ON public.invoice_line_item_snapshots;

CREATE TRIGGER prevent_finalized_invoice_line_snapshot_insert
BEFORE INSERT ON public.invoice_line_item_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_prevent_finalized_invoice_line_snapshot_mutation();

CREATE TRIGGER prevent_finalized_invoice_line_snapshot_update
BEFORE UPDATE ON public.invoice_line_item_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_prevent_finalized_invoice_line_snapshot_mutation();

CREATE TRIGGER prevent_finalized_invoice_line_snapshot_delete
BEFORE DELETE ON public.invoice_line_item_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.fieldgrid_prevent_finalized_invoice_line_snapshot_mutation();
