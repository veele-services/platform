-- Sprint 2 - Invoice numbering engine validation guards.
-- Keep database constraints aligned with the application numbering engine.

ALTER TABLE public.invoice_numbering_settings
  DROP CONSTRAINT IF EXISTS invoice_numbering_settings_prefix_check,
  DROP CONSTRAINT IF EXISTS invoice_numbering_settings_format_check,
  DROP CONSTRAINT IF EXISTS invoice_numbering_settings_padding_check,
  DROP CONSTRAINT IF EXISTS invoice_numbering_settings_start_check,
  DROP CONSTRAINT IF EXISTS invoice_numbering_settings_reset_check;

UPDATE public.invoice_numbering_settings
SET
  prefix = CASE WHEN prefix ~ '^[A-Z]{3}$' THEN prefix ELSE 'FAK' END,
  format = CASE
    WHEN position('{PREFIX}' in format) > 0
      AND position('{NUMBER}' in format) > 0
      AND regexp_replace(format, '\{(PREFIX|YYYY|YY|MM|NUMBER)\}', '', 'g') !~ '\{[^}]*\}'
      THEN format
    ELSE '{PREFIX}-{YYYY}-{NUMBER}'
  END,
  number_padding = LEAST(8, GREATEST(3, COALESCE(number_padding, 4))),
  default_start_number = LEAST(99999999, GREATEST(1, COALESCE(default_start_number, 1))),
  reset_period = CASE WHEN reset_period IN ('never', 'yearly', 'monthly') THEN reset_period ELSE 'yearly' END,
  updated_at = now();

ALTER TABLE public.invoice_numbering_settings
  ADD CONSTRAINT invoice_numbering_settings_prefix_check
    CHECK (prefix ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT invoice_numbering_settings_format_check
    CHECK (
      position('{PREFIX}' in format) > 0
      AND position('{NUMBER}' in format) > 0
      AND regexp_replace(format, '\{(PREFIX|YYYY|YY|MM|NUMBER)\}', '', 'g') !~ '\{[^}]*\}'
    ),
  ADD CONSTRAINT invoice_numbering_settings_padding_check
    CHECK (number_padding BETWEEN 3 AND 8),
  ADD CONSTRAINT invoice_numbering_settings_start_check
    CHECK (default_start_number BETWEEN 1 AND 99999999),
  ADD CONSTRAINT invoice_numbering_settings_reset_check
    CHECK (reset_period IN ('never', 'yearly', 'monthly'));
