-- Phase 9: durable, staging-only custom website activation evidence.

CREATE TABLE IF NOT EXISTS public.website_delivery_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL,
  operation_type varchar(20) NOT NULL,
  environment varchar(20) NOT NULL DEFAULT 'staging',
  status varchar(20) NOT NULL,
  from_mode varchar(30) NOT NULL,
  from_target_id uuid,
  to_mode varchar(30) NOT NULL,
  to_target_id uuid NOT NULL,
  rollback_source_target_id uuid,
  expected_revision integer NOT NULL,
  new_revision integer,
  change_reference varchar(160) NOT NULL,
  reason text NOT NULL,
  preflight_evidence jsonb NOT NULL,
  error_code varchar(80),
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_delivery_operations_tenant_site_fk
    FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.website_sites(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_delivery_operations_type_check
    CHECK (operation_type IN ('activate', 'rollback')),
  CONSTRAINT website_delivery_operations_environment_check
    CHECK (environment = 'staging'),
  CONSTRAINT website_delivery_operations_status_check
    CHECK (status IN ('succeeded', 'failed')),
  CONSTRAINT website_delivery_operations_mode_check
    CHECK (
      from_mode IN ('managed_cms', 'custom_nextjs')
      AND to_mode IN ('managed_cms', 'custom_nextjs')
    ),
  CONSTRAINT website_delivery_operations_revision_check
    CHECK (
      expected_revision > 0
      AND (
        (status = 'succeeded' AND new_revision = expected_revision + 1)
        OR (status = 'failed' AND new_revision IS NULL)
      )
    ),
  CONSTRAINT website_delivery_operations_reason_check
    CHECK (
      nullif(trim(change_reference), '') IS NOT NULL
      AND nullif(trim(reason), '') IS NOT NULL
    ),
  CONSTRAINT website_delivery_operations_evidence_check
    CHECK (
      jsonb_typeof(preflight_evidence) = 'object'
      AND preflight_evidence ? 'schemaVersion'
      AND preflight_evidence ? 'status'
      AND NOT preflight_evidence ?| ARRAY[
        'origin',
        'upstreamOrigin',
        'headers',
        'cookies',
        'token',
        'secret',
        'responseBody'
      ]
    ),
  CONSTRAINT website_delivery_operations_error_check
    CHECK (
      (status = 'succeeded' AND error_code IS NULL)
      OR (
        status = 'failed'
        AND error_code ~ '^[a-z0-9][a-z0-9._-]{1,79}$'
      )
    )
);

CREATE INDEX IF NOT EXISTS website_delivery_operations_tenant_site_idx
  ON public.website_delivery_operations (tenant_id, site_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS website_delivery_operations_site_revision_idx
  ON public.website_delivery_operations (site_id, new_revision)
  WHERE status = 'succeeded';

CREATE OR REPLACE FUNCTION public.website_delivery_operations_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'website delivery operation evidence is append-only';
END;
$$;
REVOKE ALL ON FUNCTION public.website_delivery_operations_append_only()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_website_delivery_operations_append_only
  ON public.website_delivery_operations;
CREATE TRIGGER trg_website_delivery_operations_append_only
BEFORE UPDATE OR DELETE ON public.website_delivery_operations
FOR EACH ROW EXECUTE FUNCTION public.website_delivery_operations_append_only();

ALTER TABLE public.website_delivery_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.website_delivery_operations
  FROM anon, authenticated;
