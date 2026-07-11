-- Sprint 7: Google Routes API cache identity hardening.
-- Route cache entries must include non-address request context such as
-- travel mode, traffic preference and departure bucket without storing the
-- raw Google request payload.

ALTER TABLE public.assignment_route_cache
  ADD COLUMN IF NOT EXISTS request_context_hash varchar(80) NOT NULL DEFAULT 'legacy';

DROP INDEX IF EXISTS public.assignment_route_cache_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS assignment_route_cache_unique_idx
  ON public.assignment_route_cache(
    tenant_id,
    provider,
    vehicle_type,
    origin_hash,
    destination_hash,
    request_context_hash
  );

COMMENT ON COLUMN public.assignment_route_cache.request_context_hash IS
  'Hash of route mode, departure bucket and traffic preference for Google Routes cache identity; does not contain raw addresses or API payloads.';
