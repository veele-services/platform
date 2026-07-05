-- ============================================================================
-- Organization settings constraint repair
-- ============================================================================
-- 077 introduced explicit defaults for provisioning. This follow-up is
-- intentionally idempotent for databases where an older check constraint was
-- already present and still rejected the current STARTTLS default.

ALTER TABLE organization_settings
  DROP CONSTRAINT IF EXISTS organization_settings_smtp_encryption_check,
  DROP CONSTRAINT IF EXISTS organization_settings_smtp_port_check,
  DROP CONSTRAINT IF EXISTS organization_settings_availability_advance_days_check;

UPDATE organization_settings
SET
  availability_advance_days = CASE
    WHEN availability_advance_days BETWEEN 7 AND 365 THEN availability_advance_days
    ELSE 60
  END,
  smtp_port = CASE
    WHEN smtp_port IS NULL OR (smtp_port >= 1 AND smtp_port <= 65535) THEN smtp_port
    ELSE NULL
  END,
  smtp_encryption = CASE
    WHEN smtp_encryption IN ('none', 'starttls', 'tls') THEN smtp_encryption
    ELSE 'starttls'
  END;

ALTER TABLE organization_settings
  ALTER COLUMN smtp_encryption SET DEFAULT 'starttls',
  ALTER COLUMN smtp_encryption SET NOT NULL,
  ALTER COLUMN availability_advance_days SET DEFAULT 60,
  ALTER COLUMN availability_advance_days SET NOT NULL;

ALTER TABLE organization_settings
  ADD CONSTRAINT organization_settings_smtp_encryption_check
  CHECK (smtp_encryption IN ('none', 'starttls', 'tls')),
  ADD CONSTRAINT organization_settings_smtp_port_check
  CHECK (smtp_port IS NULL OR (smtp_port >= 1 AND smtp_port <= 65535)),
  ADD CONSTRAINT organization_settings_availability_advance_days_check
  CHECK (availability_advance_days BETWEEN 7 AND 365);
