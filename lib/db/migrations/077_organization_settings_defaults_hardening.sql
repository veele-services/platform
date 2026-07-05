-- ============================================================================
-- Organization settings defaults hardening
-- ============================================================================
-- Older staging databases can have organization_settings columns created by
-- manual SQL or earlier IF NOT EXISTS migrations without the current defaults.
-- Tenant provisioning relies on this table during preflight, so normalize the
-- required defaults and backfill nulls before enforcing NOT NULL.

ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS availability_advance_days integer,
  ADD COLUMN IF NOT EXISTS smtp_enabled boolean,
  ADD COLUMN IF NOT EXISTS smtp_host varchar(255),
  ADD COLUMN IF NOT EXISTS smtp_port integer,
  ADD COLUMN IF NOT EXISTS smtp_encryption varchar(20),
  ADD COLUMN IF NOT EXISTS smtp_username varchar(255),
  ADD COLUMN IF NOT EXISTS smtp_password text,
  ADD COLUMN IF NOT EXISTS smtp_from_name varchar(200),
  ADD COLUMN IF NOT EXISTS smtp_from_email varchar(255),
  ADD COLUMN IF NOT EXISTS smtp_reply_to varchar(255),
  ADD COLUMN IF NOT EXISTS email_template_brand_color varchar(20),
  ADD COLUMN IF NOT EXISTS email_template_accent_color varchar(20),
  ADD COLUMN IF NOT EXISTS email_template_footer_text text,
  ADD COLUMN IF NOT EXISTS email_template_signature text,
  ADD COLUMN IF NOT EXISTS notif_rapport_goedgekeurd boolean,
  ADD COLUMN IF NOT EXISTS notif_rapport_afgekeurd boolean,
  ADD COLUMN IF NOT EXISTS notif_offerte_verstuurd boolean,
  ADD COLUMN IF NOT EXISTS notif_offerte_verlopen boolean,
  ADD COLUMN IF NOT EXISTS notif_betaling_herinnering boolean,
  ADD COLUMN IF NOT EXISTS notif_herinnering_dagen integer;

ALTER TABLE organization_settings
  DROP CONSTRAINT IF EXISTS organization_settings_smtp_encryption_check,
  DROP CONSTRAINT IF EXISTS organization_settings_smtp_port_check,
  DROP CONSTRAINT IF EXISTS organization_settings_availability_advance_days_check;

UPDATE organization_settings
SET
  naam = COALESCE(naam, ''),
  betaaltermijn_dagen = COALESCE(betaaltermijn_dagen, 30),
  availability_advance_days = CASE
    WHEN availability_advance_days BETWEEN 7 AND 365 THEN availability_advance_days
    ELSE 60
  END,
  smtp_enabled = COALESCE(smtp_enabled, false),
  smtp_port = CASE
    WHEN smtp_port IS NULL OR (smtp_port >= 1 AND smtp_port <= 65535) THEN smtp_port
    ELSE NULL
  END,
  smtp_encryption = CASE
    WHEN smtp_encryption IN ('none', 'starttls', 'tls') THEN smtp_encryption
    ELSE 'starttls'
  END,
  email_template_brand_color = COALESCE(email_template_brand_color, '#081D3A'),
  email_template_accent_color = COALESCE(email_template_accent_color, '#00B7B3'),
  email_template_footer_text = COALESCE(
    email_template_footer_text,
    'Dit is een automatisch bericht van Fieldgrid. U ontvangt dit bericht omdat u betrokken bent bij een aanvraag, opdracht, rapportage, factuur of portaalmelding.'
  ),
  email_template_signature = COALESCE(email_template_signature, E'Met vriendelijke groet,\nFieldgrid'),
  notif_rapport_goedgekeurd = COALESCE(notif_rapport_goedgekeurd, true),
  notif_rapport_afgekeurd = COALESCE(notif_rapport_afgekeurd, true),
  notif_offerte_verstuurd = COALESCE(notif_offerte_verstuurd, true),
  notif_offerte_verlopen = COALESCE(notif_offerte_verlopen, true),
  notif_betaling_herinnering = COALESCE(notif_betaling_herinnering, true),
  notif_herinnering_dagen = COALESCE(notif_herinnering_dagen, 7),
  updated_at = COALESCE(updated_at, now());

ALTER TABLE organization_settings
  ALTER COLUMN naam SET DEFAULT '',
  ALTER COLUMN naam SET NOT NULL,
  ALTER COLUMN betaaltermijn_dagen SET DEFAULT 30,
  ALTER COLUMN betaaltermijn_dagen SET NOT NULL,
  ALTER COLUMN availability_advance_days SET DEFAULT 60,
  ALTER COLUMN availability_advance_days SET NOT NULL,
  ALTER COLUMN smtp_enabled SET DEFAULT false,
  ALTER COLUMN smtp_enabled SET NOT NULL,
  ALTER COLUMN smtp_encryption SET DEFAULT 'starttls',
  ALTER COLUMN smtp_encryption SET NOT NULL,
  ALTER COLUMN email_template_brand_color SET DEFAULT '#081D3A',
  ALTER COLUMN email_template_brand_color SET NOT NULL,
  ALTER COLUMN email_template_accent_color SET DEFAULT '#00B7B3',
  ALTER COLUMN email_template_accent_color SET NOT NULL,
  ALTER COLUMN email_template_footer_text SET DEFAULT 'Dit is een automatisch bericht van Fieldgrid. U ontvangt dit bericht omdat u betrokken bent bij een aanvraag, opdracht, rapportage, factuur of portaalmelding.',
  ALTER COLUMN email_template_footer_text SET NOT NULL,
  ALTER COLUMN email_template_signature SET DEFAULT E'Met vriendelijke groet,\nFieldgrid',
  ALTER COLUMN email_template_signature SET NOT NULL,
  ALTER COLUMN notif_rapport_goedgekeurd SET DEFAULT true,
  ALTER COLUMN notif_rapport_goedgekeurd SET NOT NULL,
  ALTER COLUMN notif_rapport_afgekeurd SET DEFAULT true,
  ALTER COLUMN notif_rapport_afgekeurd SET NOT NULL,
  ALTER COLUMN notif_offerte_verstuurd SET DEFAULT true,
  ALTER COLUMN notif_offerte_verstuurd SET NOT NULL,
  ALTER COLUMN notif_offerte_verlopen SET DEFAULT true,
  ALTER COLUMN notif_offerte_verlopen SET NOT NULL,
  ALTER COLUMN notif_betaling_herinnering SET DEFAULT true,
  ALTER COLUMN notif_betaling_herinnering SET NOT NULL,
  ALTER COLUMN notif_herinnering_dagen SET DEFAULT 7,
  ALTER COLUMN notif_herinnering_dagen SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE organization_settings
  ADD CONSTRAINT organization_settings_smtp_encryption_check
  CHECK (smtp_encryption IN ('none', 'starttls', 'tls')),
  ADD CONSTRAINT organization_settings_smtp_port_check
  CHECK (smtp_port IS NULL OR (smtp_port >= 1 AND smtp_port <= 65535)),
  ADD CONSTRAINT organization_settings_availability_advance_days_check
  CHECK (availability_advance_days BETWEEN 7 AND 365);
