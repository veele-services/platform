-- ============================================================================
-- Platform custom domains
--
-- Enterprise-only tenant custom domain workflow with DNS verification metadata,
-- Caddy ask support, TLS status and auditable check history.
-- ============================================================================

ALTER TABLE tenant_domains ADD COLUMN IF NOT EXISTS verification_token text;
ALTER TABLE tenant_domains ADD COLUMN IF NOT EXISTS verification_method varchar(30) NOT NULL DEFAULT 'dns_txt';
ALTER TABLE tenant_domains ADD COLUMN IF NOT EXISTS dns_txt_name text;
ALTER TABLE tenant_domains ADD COLUMN IF NOT EXISTS dns_target text;
ALTER TABLE tenant_domains ADD COLUMN IF NOT EXISTS dns_last_checked_at timestamptz;
ALTER TABLE tenant_domains ADD COLUMN IF NOT EXISTS dns_last_error text;
ALTER TABLE tenant_domains ADD COLUMN IF NOT EXISTS tls_status varchar(30) NOT NULL DEFAULT 'pending';
ALTER TABLE tenant_domains ADD COLUMN IF NOT EXISTS tls_last_checked_at timestamptz;
ALTER TABLE tenant_domains ADD COLUMN IF NOT EXISTS tls_last_error text;
ALTER TABLE tenant_domains ADD COLUMN IF NOT EXISTS activated_at timestamptz;
ALTER TABLE tenant_domains ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
ALTER TABLE tenant_domains ADD COLUMN IF NOT EXISTS disabled_reason text;
ALTER TABLE tenant_domains ADD COLUMN IF NOT EXISTS created_by_platform_user_id uuid REFERENCES platform_users(id) ON DELETE SET NULL;
ALTER TABLE tenant_domains ADD COLUMN IF NOT EXISTS verified_by_platform_user_id uuid REFERENCES platform_users(id) ON DELETE SET NULL;

UPDATE tenant_domains
SET verification_method = 'dns_txt'
WHERE verification_method IS NULL;

UPDATE tenant_domains
SET tls_status = CASE
    WHEN verification_status IN ('verified', 'active') THEN 'active'
    WHEN verification_status IN ('disabled', 'disabled_plan') THEN 'disabled'
    WHEN verification_status = 'failed' THEN 'failed'
    ELSE 'pending'
  END
WHERE tls_status IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_domains_verification_status_check'
      AND conrelid = 'tenant_domains'::regclass
  ) THEN
    ALTER TABLE tenant_domains
      DROP CONSTRAINT tenant_domains_verification_status_check;
  END IF;

  ALTER TABLE tenant_domains
    ADD CONSTRAINT tenant_domains_verification_status_check
    CHECK (
      verification_status IN (
        'pending',
        'pending_dns',
        'dns_seen',
        'verified',
        'tls_pending',
        'active',
        'failed',
        'disabled',
        'disabled_plan'
      )
    );

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_domains_tls_status_check'
      AND conrelid = 'tenant_domains'::regclass
  ) THEN
    ALTER TABLE tenant_domains
      ADD CONSTRAINT tenant_domains_tls_status_check
      CHECK (tls_status IN ('pending', 'active', 'failed', 'disabled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_domains_verification_method_check'
      AND conrelid = 'tenant_domains'::regclass
  ) THEN
    ALTER TABLE tenant_domains
      ADD CONSTRAINT tenant_domains_verification_method_check
      CHECK (verification_method IN ('dns_txt'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tenant_domains_verification_status_idx
  ON tenant_domains (verification_status);

CREATE INDEX IF NOT EXISTS tenant_domains_custom_caddy_idx
  ON tenant_domains (domain, verification_status, tls_status)
  WHERE type = 'custom_domain';

CREATE TABLE IF NOT EXISTS tenant_domain_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_domain_id uuid NOT NULL REFERENCES tenant_domains(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  check_type varchar(40) NOT NULL,
  status varchar(30) NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_domain_checks_domain_created_idx
  ON tenant_domain_checks (tenant_domain_id, created_at);

CREATE INDEX IF NOT EXISTS tenant_domain_checks_tenant_created_idx
  ON tenant_domain_checks (tenant_id, created_at);

ALTER TABLE tenant_domain_checks ENABLE ROW LEVEL SECURITY;

WITH plan_limit_seed(plan_key, key, description, is_enabled, limit_value) AS (
  VALUES
    ('starter', 'custom_domains', 'Custom domains zijn beschikbaar voor Enterprise tenants.', false, NULL::integer),
    ('professional', 'custom_domains', 'Custom domains zijn beschikbaar voor Enterprise tenants.', false, NULL::integer),
    ('enterprise', 'custom_domains', 'Enterprise custom domains zijn inbegrepen.', true, NULL::integer)
)
INSERT INTO plan_limits (plan_id, key, description, is_enabled, limit_value)
SELECT plans.id, seed.key, seed.description, seed.is_enabled, seed.limit_value
FROM plan_limit_seed seed
JOIN plans ON plans.key = seed.plan_key
ON CONFLICT (plan_id, key) DO UPDATE
SET description = EXCLUDED.description,
    is_enabled = EXCLUDED.is_enabled,
    limit_value = EXCLUDED.limit_value,
    updated_at = now();
