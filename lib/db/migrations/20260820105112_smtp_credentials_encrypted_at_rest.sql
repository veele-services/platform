-- Add authenticated-encryption storage for tenant SMTP credentials. Existing
-- plaintext rows are migrated by the application-level backfill before the new
-- runtime is activated; no encryption key is ever present in SQL history.

ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS smtp_password_encrypted text;

COMMENT ON COLUMN public.organization_settings.smtp_password_encrypted IS
  'AES-256-GCM envelope; authenticated to the owning tenant id by application AAD.';

CREATE OR REPLACE FUNCTION app_private.fieldgrid_reject_plaintext_smtp_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.smtp_password IS NOT NULL AND btrim(NEW.smtp_password) <> '' THEN
    RAISE EXCEPTION 'Plaintext tenant SMTP credentials are disabled; use encrypted storage.'
      USING ERRCODE = '23514';
  END IF;

  NEW.smtp_password := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.fieldgrid_reject_plaintext_smtp_password()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS organization_settings_reject_plaintext_smtp_password
  ON public.organization_settings;
CREATE TRIGGER organization_settings_reject_plaintext_smtp_password
  BEFORE INSERT OR UPDATE OF smtp_password
  ON public.organization_settings
  FOR EACH ROW
  EXECUTE FUNCTION app_private.fieldgrid_reject_plaintext_smtp_password();
