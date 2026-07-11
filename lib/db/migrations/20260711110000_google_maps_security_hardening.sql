-- Google Maps Platform Sprint 11: direct Data API and route cache hardening.
-- Places/Routes/usage runtime access is server-mediated. Browser-facing roles
-- must not read or write route cache, route context or usage metric rows.

BEGIN;

ALTER TABLE public.google_maps_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_route_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_route_contexts ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.google_maps_usage_events FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.assignment_route_cache FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.assignment_route_contexts FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS google_maps_usage_events_management_read ON public.google_maps_usage_events;
DROP POLICY IF EXISTS assignment_route_cache_management ON public.assignment_route_cache;
DROP POLICY IF EXISTS assignment_route_contexts_management ON public.assignment_route_contexts;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'google_maps_usage_events'
        AND policyname = 'google_maps_usage_events_service_role_all'
    ) THEN
      CREATE POLICY google_maps_usage_events_service_role_all
        ON public.google_maps_usage_events
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'assignment_route_cache'
        AND policyname = 'assignment_route_cache_service_role_all'
    ) THEN
      CREATE POLICY assignment_route_cache_service_role_all
        ON public.assignment_route_cache
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'assignment_route_contexts'
        AND policyname = 'assignment_route_contexts_service_role_all'
    ) THEN
      CREATE POLICY assignment_route_contexts_service_role_all
        ON public.assignment_route_contexts
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
    END IF;
  END IF;
END $$;

COMMENT ON TABLE public.google_maps_usage_events IS
  'Server-only Google Maps/Places/Routes usage metrics. Direct anon/authenticated grants are revoked; platform and tenant dashboards must read through server actions.';
COMMENT ON TABLE public.assignment_route_cache IS
  'Server-only tenant-scoped Google Routes cache. Direct browser/Data API access is revoked to prevent cross-tenant route leakage.';
COMMENT ON TABLE public.assignment_route_contexts IS
  'Server-only tenant-scoped route context snapshots. Direct browser/Data API access is revoked to prevent cross-tenant planning leakage.';

COMMIT;

