-- Fieldgrid Phase 2 W10: safe account activation and credential recovery.
-- Contract only: reset codes are never stored as plaintext and are never used as auth passwords.

CREATE TABLE IF NOT EXISTS public.credential_recovery_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  surface varchar(32) NOT NULL,
  purpose varchar(32) NOT NULL,
  subject_user_id uuid,
  account_lookup_hmac bytea NOT NULL,
  code_hash bytea NOT NULL,
  grant_hash bytea,
  expires_at timestamptz NOT NULL,
  resend_available_at timestamptz NOT NULL,
  attempts_remaining integer NOT NULL DEFAULT 6,
  used_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credential_recovery_surface_check CHECK (surface IN ('tenant-backoffice', 'personnel-portal', 'customer-portal', 'platform-admin')),
  CONSTRAINT credential_recovery_purpose_check CHECK (purpose IN ('activation', 'password-reset')),
  CONSTRAINT credential_recovery_attempts_check CHECK (attempts_remaining >= 0),
  CONSTRAINT credential_recovery_tenant_bound_check CHECK (
    (surface = 'platform-admin' AND tenant_id IS NULL) OR
    (surface <> 'platform-admin' AND tenant_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS credential_recovery_one_active_challenge_idx
  ON public.credential_recovery_challenges (surface, tenant_id, account_lookup_hmac, purpose)
  WHERE used_at IS NULL AND invalidated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS credential_recovery_one_active_grant_idx
  ON public.credential_recovery_challenges (grant_hash)
  WHERE grant_hash IS NOT NULL AND used_at IS NULL AND invalidated_at IS NULL;

CREATE INDEX IF NOT EXISTS credential_recovery_expiry_idx
  ON public.credential_recovery_challenges (expires_at)
  WHERE used_at IS NULL AND invalidated_at IS NULL;

COMMENT ON TABLE public.credential_recovery_challenges IS
  'Safe activation/recovery challenges. account_lookup_hmac and code_hash are non-reversible; grants are single-use.';
COMMENT ON COLUMN public.credential_recovery_challenges.account_lookup_hmac IS
  'HMAC-SHA256 of tenant/surface/account identifier using an application secret; no plaintext email stored.';
COMMENT ON COLUMN public.credential_recovery_challenges.code_hash IS
  'Hash/HMAC of the emailed code; plaintext code is never stored and never set as the Supabase password.';
COMMENT ON COLUMN public.credential_recovery_challenges.grant_hash IS
  'Hash/HMAC of a random internal reset grant. The grant is single-use and not sent in e-mail.';
