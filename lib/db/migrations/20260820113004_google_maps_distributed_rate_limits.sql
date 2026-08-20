-- Durable multi-process abuse control for billable Google Maps provider calls.

CREATE TABLE public.google_maps_rate_limit_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_key varchar(128) NOT NULL,
  action varchar(40) NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_maps_rate_limit_actor_check
    CHECK (length(btrim(actor_key)) BETWEEN 1 AND 128),
  CONSTRAINT google_maps_rate_limit_action_check
    CHECK (action IN ('places_autocomplete', 'place_details', 'route_request', 'usage_event')),
  CONSTRAINT google_maps_rate_limit_count_check
    CHECK (request_count BETWEEN 1 AND 10001),
  CONSTRAINT google_maps_rate_limit_expiry_check
    CHECK (expires_at > window_started_at),
  CONSTRAINT google_maps_rate_limit_bucket_unique
    UNIQUE (tenant_id, actor_key, action, window_started_at)
);

CREATE INDEX google_maps_rate_limit_expiry_idx
  ON public.google_maps_rate_limit_buckets(expires_at);
CREATE INDEX google_maps_rate_limit_tenant_action_idx
  ON public.google_maps_rate_limit_buckets(tenant_id, action, window_started_at DESC);

ALTER TABLE public.google_maps_rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.google_maps_rate_limit_buckets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_maps_rate_limit_buckets TO service_role;

COMMENT ON TABLE public.google_maps_rate_limit_buckets IS
  'Server-only atomic rate-limit buckets for cost-bearing Google Maps calls. No in-process fallback is permitted.';

CREATE TABLE public.google_maps_autocomplete_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_key varchar(128) NOT NULL,
  session_hash varchar(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_maps_autocomplete_session_actor_check
    CHECK (length(btrim(actor_key)) BETWEEN 1 AND 128),
  CONSTRAINT google_maps_autocomplete_session_hash_check
    CHECK (session_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT google_maps_autocomplete_session_unique
    UNIQUE (tenant_id, actor_key, session_hash)
);

CREATE INDEX google_maps_autocomplete_session_expiry_idx
  ON public.google_maps_autocomplete_sessions(expires_at);

ALTER TABLE public.google_maps_autocomplete_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.google_maps_autocomplete_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_maps_autocomplete_sessions TO service_role;

COMMENT ON TABLE public.google_maps_autocomplete_sessions IS
  'Hashed durable analytics dedupe for autocomplete sessions; this table is not the rate-limit boundary.';
