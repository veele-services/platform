-- Fieldgrid-owned credential challenge protocol.
-- Forward-only additive migration.

CREATE TABLE IF NOT EXISTS credential_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose varchar(40) NOT NULL,
  user_id uuid NOT NULL,
  portal varchar(40) NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  host_class varchar(120) NOT NULL,
  email_hmac text NOT NULL,
  code_hash text NOT NULL,
  key_version varchar(80) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  resend_count integer NOT NULL DEFAULT 0,
  verified_at timestamptz,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  request_ip_hash text,
  user_agent_hash text,
  status varchar(40) NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT credential_challenges_purpose_check CHECK (purpose IN ('invite_activation', 'password_reset', 'admin_initiated_reset')),
  CONSTRAINT credential_challenges_status_check CHECK (status IN ('pending', 'verified', 'consumed', 'invalidated', 'expired', 'rate_limited')),
  CONSTRAINT credential_challenges_attempts_check CHECK (attempts >= 0 AND max_attempts > 0),
  CONSTRAINT credential_challenges_expiry_check CHECK (expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS credential_reset_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES credential_challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  purpose varchar(40) NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  host_class varchar(120) NOT NULL,
  grant_hash text NOT NULL,
  key_version varchar(80) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  status varchar(40) NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT credential_reset_grants_purpose_check CHECK (purpose IN ('invite_activation', 'password_reset', 'admin_initiated_reset')),
  CONSTRAINT credential_reset_grants_status_check CHECK (status IN ('active', 'consumed', 'invalidated', 'expired')),
  CONSTRAINT credential_reset_grants_expiry_check CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS credential_challenges_one_active_idx ON credential_challenges (purpose, user_id, portal, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), host_class) WHERE consumed_at IS NULL AND invalidated_at IS NULL AND status IN ('pending', 'verified');
CREATE UNIQUE INDEX IF NOT EXISTS credential_reset_grants_one_active_per_challenge_idx ON credential_reset_grants (challenge_id) WHERE consumed_at IS NULL AND invalidated_at IS NULL AND status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS credential_reset_grants_hash_idx ON credential_reset_grants (grant_hash);
CREATE INDEX IF NOT EXISTS credential_challenges_email_lookup_idx ON credential_challenges (email_hmac, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS credential_challenges_tenant_lookup_idx ON credential_challenges (tenant_id, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS credential_challenges_cleanup_idx ON credential_challenges (expires_at) WHERE consumed_at IS NOT NULL OR invalidated_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS credential_challenges_expired_idx ON credential_challenges (expires_at) WHERE consumed_at IS NULL AND invalidated_at IS NULL;
CREATE INDEX IF NOT EXISTS credential_reset_grants_cleanup_idx ON credential_reset_grants (expires_at) WHERE consumed_at IS NOT NULL OR invalidated_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS credential_reset_grants_expired_idx ON credential_reset_grants (expires_at) WHERE consumed_at IS NULL AND invalidated_at IS NULL;

REVOKE ALL ON TABLE credential_challenges FROM anon, authenticated;
REVOKE ALL ON TABLE credential_reset_grants FROM anon, authenticated;
