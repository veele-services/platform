-- Platform-wide outgoing email provider configuration.
-- Secrets are stored encrypted by the application layer; direct Data API access is revoked.

CREATE TABLE IF NOT EXISTS public.platform_email_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_type varchar(40) NOT NULL,
  name varchar(160) NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  encrypted_config_json text NOT NULL DEFAULT '{}',
  from_email varchar(255) NOT NULL DEFAULT 'noreply@fieldgrid.nl',
  from_name varchar(200) NOT NULL DEFAULT 'Fieldgrid',
  reply_to_email varchar(255),
  status varchar(30) NOT NULL DEFAULT 'draft',
  last_tested_at timestamptz,
  last_test_status varchar(30),
  last_test_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.platform_email_providers
  DROP CONSTRAINT IF EXISTS platform_email_providers_provider_type_check;
ALTER TABLE public.platform_email_providers
  ADD CONSTRAINT platform_email_providers_provider_type_check
  CHECK (provider_type IN ('resend_api', 'smtp'));

ALTER TABLE public.platform_email_providers
  DROP CONSTRAINT IF EXISTS platform_email_providers_status_check;
ALTER TABLE public.platform_email_providers
  ADD CONSTRAINT platform_email_providers_status_check
  CHECK (status IN ('draft', 'configured', 'disabled', 'error'));

ALTER TABLE public.platform_email_providers
  DROP CONSTRAINT IF EXISTS platform_email_providers_last_test_status_check;
ALTER TABLE public.platform_email_providers
  ADD CONSTRAINT platform_email_providers_last_test_status_check
  CHECK (last_test_status IS NULL OR last_test_status IN ('success', 'failed'));

CREATE UNIQUE INDEX IF NOT EXISTS platform_email_providers_one_active_idx
  ON public.platform_email_providers ((is_active))
  WHERE is_active;

CREATE UNIQUE INDEX IF NOT EXISTS platform_email_providers_one_default_idx
  ON public.platform_email_providers ((is_default))
  WHERE is_default;

CREATE INDEX IF NOT EXISTS platform_email_providers_provider_type_idx
  ON public.platform_email_providers (provider_type);

CREATE TABLE IF NOT EXISTS public.email_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES public.platform_email_providers(id) ON DELETE SET NULL,
  provider_type varchar(40) NOT NULL,
  template_key varchar(120),
  tenant_id uuid,
  recipient_email varchar(320) NOT NULL,
  subject varchar(500) NOT NULL,
  status varchar(30) NOT NULL,
  provider_message_id varchar(255),
  error_message text,
  triggered_by uuid,
  triggered_by_type varchar(40) NOT NULL DEFAULT 'system',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_delivery_log
  DROP CONSTRAINT IF EXISTS email_delivery_log_provider_type_check;
ALTER TABLE public.email_delivery_log
  ADD CONSTRAINT email_delivery_log_provider_type_check
  CHECK (provider_type IN ('resend_api', 'smtp', 'legacy_smtp', 'env_resend', 'none'));

ALTER TABLE public.email_delivery_log
  DROP CONSTRAINT IF EXISTS email_delivery_log_status_check;
ALTER TABLE public.email_delivery_log
  ADD CONSTRAINT email_delivery_log_status_check
  CHECK (status IN ('success', 'failed', 'skipped'));

CREATE INDEX IF NOT EXISTS email_delivery_log_created_at_idx
  ON public.email_delivery_log (created_at DESC);

CREATE INDEX IF NOT EXISTS email_delivery_log_tenant_created_at_idx
  ON public.email_delivery_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS email_delivery_log_template_created_at_idx
  ON public.email_delivery_log (template_key, created_at DESC);

ALTER TABLE public.platform_email_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_delivery_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_email_providers FROM anon, authenticated;
REVOKE ALL ON TABLE public.email_delivery_log FROM anon, authenticated;

COMMENT ON TABLE public.platform_email_providers IS
  'Platform-wide outgoing email provider configuration. encrypted_config_json is encrypted by the application using FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY.';
COMMENT ON TABLE public.email_delivery_log IS
  'Server-side outgoing email delivery audit log without provider secrets.';
