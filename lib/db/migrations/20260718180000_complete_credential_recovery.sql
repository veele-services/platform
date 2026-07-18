-- Fieldgrid Phase 2B: complete the durable credential-recovery lifecycle.
-- Raw codes, grants, account identifiers and client/network signals are never persisted.

ALTER TABLE public.credential_recovery_challenges
  ADD COLUMN IF NOT EXISTS request_fingerprint_hmac bytea,
  ADD COLUMN IF NOT EXISTS redirect_origin text,
  ADD COLUMN IF NOT EXISTS issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS grant_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS invalidated_reason varchar(80),
  ADD COLUMN IF NOT EXISTS delivery_status varchar(24) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS requested_by_user_id uuid;

UPDATE public.credential_recovery_challenges
SET
  request_fingerprint_hmac = COALESCE(
    request_fingerprint_hmac,
    decode(repeat('00', 32), 'hex')
  ),
  redirect_origin = COALESCE(redirect_origin, 'https://invalid.fieldgrid.local'),
  issued_at = COALESCE(issued_at, created_at)
WHERE request_fingerprint_hmac IS NULL
   OR redirect_origin IS NULL
   OR issued_at IS NULL;

ALTER TABLE public.credential_recovery_challenges
  ALTER COLUMN request_fingerprint_hmac SET NOT NULL,
  ALTER COLUMN redirect_origin SET NOT NULL,
  ALTER COLUMN issued_at SET DEFAULT now(),
  ALTER COLUMN issued_at SET NOT NULL;

ALTER TABLE public.credential_recovery_challenges
  DROP CONSTRAINT IF EXISTS credential_recovery_digest_lengths_check,
  ADD CONSTRAINT credential_recovery_digest_lengths_check CHECK (
    octet_length(account_lookup_hmac) = 32
    AND octet_length(code_hash) = 32
    AND (grant_hash IS NULL OR octet_length(grant_hash) = 32)
    AND octet_length(request_fingerprint_hmac) = 32
  ),
  DROP CONSTRAINT IF EXISTS credential_recovery_grant_lifecycle_check,
  ADD CONSTRAINT credential_recovery_grant_lifecycle_check CHECK (
    (grant_hash IS NULL AND grant_expires_at IS NULL AND verified_at IS NULL)
    OR
    (grant_hash IS NOT NULL AND grant_expires_at IS NOT NULL AND verified_at IS NOT NULL)
  ),
  DROP CONSTRAINT IF EXISTS credential_recovery_used_lifecycle_check,
  ADD CONSTRAINT credential_recovery_used_lifecycle_check CHECK (
    used_at IS NULL OR verified_at IS NOT NULL
  ),
  DROP CONSTRAINT IF EXISTS credential_recovery_delivery_status_check,
  ADD CONSTRAINT credential_recovery_delivery_status_check CHECK (
    delivery_status IN ('pending', 'sent', 'failed', 'revoked')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'credential_recovery_challenges_tenant_fk'
      AND conrelid = 'public.credential_recovery_challenges'::regclass
  ) THEN
    ALTER TABLE public.credential_recovery_challenges
      ADD CONSTRAINT credential_recovery_challenges_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'credential_recovery_challenges_subject_fk'
      AND conrelid = 'public.credential_recovery_challenges'::regclass
  ) THEN
    ALTER TABLE public.credential_recovery_challenges
      ADD CONSTRAINT credential_recovery_challenges_subject_fk
      FOREIGN KEY (subject_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.credential_recovery_one_active_challenge_idx;
DROP INDEX IF EXISTS public.credential_recovery_one_active_grant_idx;

CREATE UNIQUE INDEX IF NOT EXISTS credential_recovery_active_challenge_v2_idx
  ON public.credential_recovery_challenges (
    surface,
    COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    account_lookup_hmac,
    purpose
  )
  WHERE used_at IS NULL AND invalidated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS credential_recovery_active_grant_v2_idx
  ON public.credential_recovery_challenges (grant_hash)
  WHERE grant_hash IS NOT NULL AND used_at IS NULL AND invalidated_at IS NULL;

CREATE INDEX IF NOT EXISTS credential_recovery_subject_v2_idx
  ON public.credential_recovery_challenges (subject_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS credential_recovery_expiry_v2_idx
  ON public.credential_recovery_challenges (expires_at)
  WHERE used_at IS NULL AND invalidated_at IS NULL;

CREATE TABLE IF NOT EXISTS public.credential_recovery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid REFERENCES public.credential_recovery_challenges(id) ON DELETE SET NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT,
  surface varchar(32) NOT NULL,
  purpose varchar(32) NOT NULL,
  event_type varchar(64) NOT NULL,
  account_lookup_hmac bytea NOT NULL,
  request_fingerprint_hmac bytea NOT NULL,
  actor_user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credential_recovery_events_surface_check
    CHECK (surface IN ('tenant-backoffice', 'personnel-portal', 'customer-portal', 'platform-admin')),
  CONSTRAINT credential_recovery_events_purpose_check
    CHECK (purpose IN ('activation', 'password-reset')),
  CONSTRAINT credential_recovery_events_tenant_bound_check CHECK (
    (surface = 'platform-admin' AND tenant_id IS NULL)
    OR
    (surface <> 'platform-admin' AND tenant_id IS NOT NULL)
  ),
  CONSTRAINT credential_recovery_events_digest_lengths_check CHECK (
    octet_length(account_lookup_hmac) = 32
    AND octet_length(request_fingerprint_hmac) = 32
  )
);

CREATE INDEX IF NOT EXISTS credential_recovery_events_lookup_idx
  ON public.credential_recovery_events (account_lookup_hmac, created_at DESC);

CREATE INDEX IF NOT EXISTS credential_recovery_events_fingerprint_idx
  ON public.credential_recovery_events (request_fingerprint_hmac, created_at DESC);

CREATE INDEX IF NOT EXISTS credential_recovery_events_tenant_idx
  ON public.credential_recovery_events (tenant_id, created_at DESC);

ALTER TABLE public.credential_recovery_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_recovery_challenges FORCE ROW LEVEL SECURITY;
ALTER TABLE public.credential_recovery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_recovery_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.credential_recovery_challenges
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.credential_recovery_events
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.credential_recovery_challenges
  TO service_role;
GRANT SELECT, INSERT ON TABLE public.credential_recovery_events
  TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_expired_credential_recovery_challenges()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.credential_recovery_challenges
  SET
    invalidated_at = now(),
    invalidated_reason = CASE
      WHEN grant_expires_at IS NOT NULL AND grant_expires_at <= now() THEN 'grant_expired'
      ELSE 'challenge_expired'
    END,
    delivery_status = CASE
      WHEN delivery_status = 'pending' THEN 'failed'
      ELSE delivery_status
    END,
    updated_at = now()
  WHERE used_at IS NULL
    AND invalidated_at IS NULL
    AND (
      expires_at <= now()
      OR (grant_expires_at IS NOT NULL AND grant_expires_at <= now())
    );

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_credential_recovery_challenges()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_credential_recovery_challenges()
  TO service_role;

COMMENT ON TABLE public.credential_recovery_events IS
  'Append-only redacted audit events for credential recovery. No raw email, code, grant, password, IP address or user-agent is stored.';
COMMENT ON COLUMN public.credential_recovery_challenges.request_fingerprint_hmac IS
  'HMAC of normalized client/network signals for durable abuse limits; raw signals are never stored.';
COMMENT ON COLUMN public.credential_recovery_challenges.redirect_origin IS
  'Server-selected allowlisted origin bound to challenge verification and grant consumption.';
COMMENT ON COLUMN public.credential_recovery_challenges.issued_at IS
  'Explicit challenge issue time used with expires_at to enforce the bounded credential-recovery lifetime.';
COMMENT ON COLUMN public.credential_recovery_challenges.grant_expires_at IS
  'Independent short expiry for the one-time reset grant.';
