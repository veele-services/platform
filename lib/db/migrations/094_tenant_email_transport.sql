-- Tenant-scoped outgoing email transport selection.
-- Existing tenants keep platform defaults unless their legacy SMTP toggle was enabled.

ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS email_transport varchar(20) NOT NULL DEFAULT 'platform',
  ADD COLUMN IF NOT EXISTS email_api_provider varchar(40) NOT NULL DEFAULT 'resend',
  ADD COLUMN IF NOT EXISTS email_api_key_encrypted text,
  ADD COLUMN IF NOT EXISTS email_api_sending_domain varchar(255),
  ADD COLUMN IF NOT EXISTS email_api_key_updated_at timestamptz;

UPDATE public.organization_settings
SET email_transport = 'smtp'
WHERE smtp_enabled = true
  AND (email_transport IS NULL OR email_transport = 'platform');

ALTER TABLE public.organization_settings
  DROP CONSTRAINT IF EXISTS organization_settings_email_transport_check,
  DROP CONSTRAINT IF EXISTS organization_settings_email_api_provider_check;

ALTER TABLE public.organization_settings
  ADD CONSTRAINT organization_settings_email_transport_check
  CHECK (email_transport IN ('platform', 'smtp', 'api')),
  ADD CONSTRAINT organization_settings_email_api_provider_check
  CHECK (email_api_provider IN ('resend'));

COMMENT ON COLUMN public.organization_settings.email_transport IS
  'Tenant outgoing mail transport: platform default, tenant SMTP, or tenant API provider.';
COMMENT ON COLUMN public.organization_settings.email_api_key_encrypted IS
  'Encrypted tenant API provider secret. Never expose this value to clients.';
