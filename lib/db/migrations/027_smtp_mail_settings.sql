-- Migration: add SMTP mail settings to organization_settings.

ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS smtp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS smtp_host varchar(255),
  ADD COLUMN IF NOT EXISTS smtp_port integer,
  ADD COLUMN IF NOT EXISTS smtp_encryption varchar(20) NOT NULL DEFAULT 'starttls',
  ADD COLUMN IF NOT EXISTS smtp_username varchar(255),
  ADD COLUMN IF NOT EXISTS smtp_password text,
  ADD COLUMN IF NOT EXISTS smtp_from_name varchar(200),
  ADD COLUMN IF NOT EXISTS smtp_from_email varchar(255),
  ADD COLUMN IF NOT EXISTS smtp_reply_to varchar(255);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_settings_smtp_port_check'
  ) THEN
    ALTER TABLE organization_settings
      ADD CONSTRAINT organization_settings_smtp_port_check
      CHECK (smtp_port IS NULL OR (smtp_port >= 1 AND smtp_port <= 65535));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_settings_smtp_encryption_check'
  ) THEN
    ALTER TABLE organization_settings
      ADD CONSTRAINT organization_settings_smtp_encryption_check
      CHECK (smtp_encryption IN ('none', 'starttls', 'tls'));
  END IF;
END $$;
