-- Phase 3C: short-lived, opaque and authenticated website draft previews.
-- Preview rows are server-only. The browser receives a random signed token,
-- while PostgreSQL stores only its SHA-256 digest and an immutable snapshot.

CREATE TABLE IF NOT EXISTS public.website_preview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  token_hash varchar(64) NOT NULL,
  source_revision integer NOT NULL,
  snapshot jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_preview_sessions_tenant_site_fk
    FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.website_sites(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_preview_sessions_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT website_preview_sessions_token_hash_check
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT website_preview_sessions_source_revision_check
    CHECK (source_revision > 0),
  CONSTRAINT website_preview_sessions_snapshot_check
    CHECK (
      jsonb_typeof(snapshot) = 'object'
      AND octet_length(snapshot::text) <= 8388608
    ),
  CONSTRAINT website_preview_sessions_expiry_check
    CHECK (
      expires_at > created_at
      AND expires_at <= created_at + interval '15 minutes'
    ),
  CONSTRAINT website_preview_sessions_usage_check
    CHECK (last_used_at IS NULL OR last_used_at >= created_at),
  CONSTRAINT website_preview_sessions_revocation_check
    CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX IF NOT EXISTS website_preview_sessions_actor_lookup_idx
  ON public.website_preview_sessions (
    tenant_id,
    actor_user_id,
    token_hash,
    expires_at
  );

CREATE INDEX IF NOT EXISTS website_preview_sessions_expiry_idx
  ON public.website_preview_sessions (expires_at);

CREATE OR REPLACE FUNCTION public.website_guard_preview_session_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.expires_at > now() AND OLD.revoked_at IS NULL THEN
      RAISE EXCEPTION 'active website preview sessions cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.site_id IS DISTINCT FROM OLD.site_id
    OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
    OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
    OR NEW.source_revision IS DISTINCT FROM OLD.source_revision
    OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'website preview session identity is immutable';
  END IF;

  IF OLD.last_used_at IS NOT NULL
    AND (
      NEW.last_used_at IS NULL
      OR NEW.last_used_at < OLD.last_used_at
    )
  THEN
    RAISE EXCEPTION 'website preview usage timestamp is monotonic';
  END IF;

  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'website preview revocation is immutable';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.website_guard_preview_session_immutability()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_website_preview_sessions_immutable
BEFORE UPDATE OR DELETE ON public.website_preview_sessions
FOR EACH ROW EXECUTE FUNCTION public.website_guard_preview_session_immutability();

ALTER TABLE public.website_preview_sessions ENABLE ROW LEVEL SECURITY;

-- Preview creation and consumption always pass through the Node.js service,
-- live RBAC and authenticated user binding. No direct browser role may read
-- either token hashes or draft snapshots.
REVOKE ALL ON TABLE public.website_preview_sessions FROM anon, authenticated;

COMMENT ON TABLE public.website_preview_sessions IS
  'Short-lived server-only website draft previews bound to exact tenant, site, user and authoring revision.';
COMMENT ON COLUMN public.website_preview_sessions.token_hash IS
  'SHA-256 digest of an opaque HMAC-signed browser token; plaintext tokens are never stored.';
