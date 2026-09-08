-- ============================================================================
-- Fieldflow Calm W00: durable staging custom-website health refresh.
--
-- The API process may only claim active staging delivery identities and record
-- a health observation when that exact identity is still active. Origins are
-- never stored or accepted here; the application resolves them exclusively
-- through its reviewed staging route registry.
--
-- Forward-only rollback reasoning: set
-- FIELDGRID_CUSTOM_WEBSITE_HEALTH_REFRESH_ENABLED=false and redeploy the API.
-- Existing evidence will then expire after five minutes and delivery remains
-- fail-closed. Retain these additive functions for release compatibility and
-- make any ACL correction in a later migration.
-- ============================================================================

DO $fieldgrid_health_refresh_prerequisites$
BEGIN
  IF pg_catalog.to_regrole('fieldgrid_runtime_app') IS NULL
    OR pg_catalog.to_regrole('fieldgrid_runtime_data') IS NULL
    OR pg_catalog.to_regclass(
      'app_private.fieldgrid_runtime_function_capabilities'
    ) IS NULL
  THEN
    RAISE EXCEPTION
      'Runtime least-privilege migration 20260909120000 must run first';
  END IF;

  IF current_user IN ('fieldgrid_runtime_app', 'fieldgrid_runtime_data') THEN
    RAISE EXCEPTION 'Runtime principals may not install health refresh functions';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM app_private.fieldgrid_runtime_principal_configuration AS configuration
    WHERE configuration.singleton = true
      AND configuration.migration_admin = current_user
  ) THEN
    RAISE EXCEPTION
      'Health refresh functions must be installed by the configured migration admin';
  END IF;
END;
$fieldgrid_health_refresh_prerequisites$;

CREATE INDEX IF NOT EXISTS website_custom_deployments_active_health_due_idx
  ON public.website_custom_deployments (last_checked_at, tenant_id, site_id, id)
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION app_private.fieldgrid_claim_custom_website_health_refresh(
  p_limit integer
)
RETURNS TABLE (
  tenant_id uuid,
  site_id uuid,
  deployment_id uuid,
  provider_key text,
  route_key text,
  release_id text,
  expected_host text,
  health_path text,
  attempt_started_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog
AS $fieldgrid_claim_custom_website_health_refresh$
DECLARE
  v_attempt_started_at timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Custom website health claim limit must be between 1 and 100';
  END IF;

  RETURN QUERY
  SELECT
    deployment.tenant_id,
    deployment.site_id,
    deployment.id,
    deployment.provider_key::text,
    deployment.route_key::text,
    deployment.release_id::text,
    deployment.expected_host::text,
    deployment.health_path::text,
    v_attempt_started_at
  FROM public.website_custom_deployments AS deployment
  JOIN public.website_sites AS site
    ON site.tenant_id = deployment.tenant_id
   AND site.id = deployment.site_id
   AND site.active_custom_deployment_id = deployment.id
  JOIN public.tenants AS tenant
    ON tenant.id = site.tenant_id
  JOIN public.website_domain_bindings AS binding
    ON binding.tenant_id = site.tenant_id
   AND binding.site_id = site.id
   AND binding.is_primary = true
  JOIN public.tenant_domains AS tenant_domain
    ON tenant_domain.tenant_id = binding.tenant_id
   AND tenant_domain.id = binding.tenant_domain_id
  WHERE deployment.status = 'active'
    AND deployment.approved_at IS NOT NULL
    AND deployment.approved_by IS NOT NULL
    AND site.status = 'active'
    AND site.is_primary = true
    AND site.delivery_mode = 'custom_nextjs'
    AND tenant.is_active = true
    AND tenant.status IN ('trial', 'active')
    AND tenant.plan_key = 'enterprise'
    AND binding.status = 'active'
    AND binding.verified_at IS NOT NULL
    AND binding.hostname = deployment.expected_host
    AND tenant_domain.domain = binding.hostname
    AND tenant_domain.type <> 'platform_reserved'
    AND tenant_domain.verification_status IN ('verified', 'active')
    AND tenant_domain.disabled_at IS NULL
    AND pg_catalog.right(
      deployment.expected_host,
      pg_catalog.length('.staging.fieldgrid.nl')
    ) = '.staging.fieldgrid.nl'
    AND EXISTS (
      SELECT 1
      FROM public.tenant_modules AS entitlement
      JOIN public.modules AS module
        ON module.id = entitlement.module_id
      WHERE entitlement.tenant_id = tenant.id
        AND module.key = 'website'
        AND entitlement.is_enabled = true
    )
    AND (
      deployment.last_checked_at IS NULL
      OR deployment.last_checked_at <=
        v_attempt_started_at - pg_catalog.make_interval(secs => 60)
    )
  ORDER BY deployment.last_checked_at ASC NULLS FIRST,
           deployment.tenant_id,
           deployment.id
  LIMIT p_limit
  FOR UPDATE OF deployment SKIP LOCKED;
END;
$fieldgrid_claim_custom_website_health_refresh$;

CREATE OR REPLACE FUNCTION app_private.fieldgrid_record_custom_website_health_refresh(
  p_tenant_id uuid,
  p_site_id uuid,
  p_deployment_id uuid,
  p_provider_key text,
  p_route_key text,
  p_release_id text,
  p_expected_host text,
  p_health_path text,
  p_attempt_started_at timestamptz,
  p_evidence jsonb,
  p_failure_code text,
  p_actor_user_id uuid
)
RETURNS TABLE (
  applied boolean,
  health_state text,
  checked_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog
AS $fieldgrid_record_custom_website_health_refresh$
DECLARE
  v_previous_health jsonb;
  v_previous_checked_at timestamptz;
  v_checked_at timestamptz;
  v_was_healthy boolean;
BEGIN
  applied := false;
  health_state := 'unchanged';
  checked_at := NULL;

  IF p_attempt_started_at IS NULL
    OR p_attempt_started_at <
      pg_catalog.clock_timestamp() - pg_catalog.make_interval(mins => 4)
    OR p_attempt_started_at >
      pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => 5)
  THEN
    RAISE EXCEPTION 'Custom website health attempt timestamp is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.platform_users AS platform_user
    WHERE platform_user.user_id = p_actor_user_id
      AND platform_user.status = 'active'
      AND platform_user.role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Active platform owner or admin actor is required';
  END IF;

  IF p_evidence IS NULL THEN
    IF p_failure_code IS NULL OR p_failure_code NOT IN (
      'dns_failed',
      'dns_non_public',
      'evidence_mismatch',
      'http_status',
      'invalid_content_type',
      'invalid_json',
      'request_failed',
      'response_too_large',
      'route_identity_mismatch',
      'route_not_routable',
      'timeout',
      'unexpected'
    ) THEN
      RAISE EXCEPTION 'A stable health failure code is required';
    END IF;
  ELSE
    IF p_failure_code IS NOT NULL
      OR pg_catalog.jsonb_typeof(p_evidence) IS DISTINCT FROM 'object'
    THEN
      RAISE EXCEPTION 'Custom website health evidence is invalid';
    END IF;

    IF pg_catalog.jsonb_object_length(p_evidence) <> 11
      OR p_evidence -> 'schemaVersion' IS DISTINCT FROM '3'::jsonb
      OR p_evidence ->> 'status' IS DISTINCT FROM 'healthy'
      OR p_evidence ->> 'providerKey' IS DISTINCT FROM p_provider_key
      OR p_evidence ->> 'routeKey' IS DISTINCT FROM p_route_key
      OR p_evidence ->> 'releaseId' IS DISTINCT FROM p_release_id
      OR p_evidence ->> 'expectedHost' IS DISTINCT FROM p_expected_host
      OR pg_catalog.jsonb_typeof(p_evidence -> 'status')
        IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(p_evidence -> 'providerKey')
        IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(p_evidence -> 'routeKey')
        IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(p_evidence -> 'releaseId')
        IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(p_evidence -> 'expectedHost')
        IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(p_evidence -> 'tls')
        IS DISTINCT FROM 'object'
      OR pg_catalog.jsonb_typeof(p_evidence -> 'network')
        IS DISTINCT FROM 'object'
      OR pg_catalog.jsonb_typeof(p_evidence -> 'seo')
        IS DISTINCT FROM 'object'
      OR pg_catalog.jsonb_typeof(p_evidence -> 'assets')
        IS DISTINCT FROM 'object'
      OR pg_catalog.jsonb_typeof(p_evidence -> 'forms')
        IS DISTINCT FROM 'object'
    THEN
      RAISE EXCEPTION 'Custom website health evidence is invalid';
    END IF;

    IF pg_catalog.jsonb_object_length(p_evidence -> 'tls') <> 1
      OR p_evidence #> '{tls,valid}' IS DISTINCT FROM 'true'::jsonb
      OR pg_catalog.jsonb_object_length(p_evidence -> 'network') <> 1
      OR p_evidence #> '{network,publicAddressesOnly}'
        IS DISTINCT FROM 'true'::jsonb
      OR pg_catalog.jsonb_object_length(p_evidence -> 'seo') <> 4
      OR p_evidence #> '{seo,canonical}' IS DISTINCT FROM 'true'::jsonb
      OR p_evidence #> '{seo,robots}' IS DISTINCT FROM 'true'::jsonb
      OR p_evidence #> '{seo,sitemap}' IS DISTINCT FROM 'true'::jsonb
      OR p_evidence #> '{seo,structuredData}'
        IS DISTINCT FROM 'true'::jsonb
      OR pg_catalog.jsonb_object_length(p_evidence -> 'assets') <> 1
      OR p_evidence #> '{assets,healthy}' IS DISTINCT FROM 'true'::jsonb
      OR pg_catalog.jsonb_object_length(p_evidence -> 'forms') <> 1
      OR p_evidence #> '{forms,platformEndpoint}'
        IS DISTINCT FROM 'true'::jsonb
    THEN
      RAISE EXCEPTION 'Custom website health evidence is invalid';
    END IF;
  END IF;

  SELECT deployment.last_health, deployment.last_checked_at
  INTO v_previous_health, v_previous_checked_at
  FROM public.website_custom_deployments AS deployment
  JOIN public.website_sites AS site
    ON site.tenant_id = deployment.tenant_id
   AND site.id = deployment.site_id
   AND site.active_custom_deployment_id = deployment.id
  JOIN public.tenants AS tenant
    ON tenant.id = site.tenant_id
  JOIN public.website_domain_bindings AS binding
    ON binding.tenant_id = site.tenant_id
   AND binding.site_id = site.id
   AND binding.is_primary = true
  JOIN public.tenant_domains AS tenant_domain
    ON tenant_domain.tenant_id = binding.tenant_id
   AND tenant_domain.id = binding.tenant_domain_id
  WHERE deployment.tenant_id = p_tenant_id
    AND deployment.site_id = p_site_id
    AND deployment.id = p_deployment_id
    AND deployment.provider_key = p_provider_key
    AND deployment.route_key = p_route_key
    AND deployment.release_id = p_release_id
    AND deployment.expected_host = p_expected_host
    AND deployment.health_path = p_health_path
    AND deployment.status = 'active'
    AND deployment.approved_at IS NOT NULL
    AND deployment.approved_by IS NOT NULL
    AND (
      deployment.last_checked_at IS NULL
      OR deployment.last_checked_at <= p_attempt_started_at
    )
    AND site.status = 'active'
    AND site.is_primary = true
    AND site.delivery_mode = 'custom_nextjs'
    AND tenant.is_active = true
    AND tenant.status IN ('trial', 'active')
    AND tenant.plan_key = 'enterprise'
    AND binding.status = 'active'
    AND binding.verified_at IS NOT NULL
    AND binding.hostname = deployment.expected_host
    AND tenant_domain.domain = binding.hostname
    AND tenant_domain.type <> 'platform_reserved'
    AND tenant_domain.verification_status IN ('verified', 'active')
    AND tenant_domain.disabled_at IS NULL
    AND pg_catalog.right(
      deployment.expected_host,
      pg_catalog.length('.staging.fieldgrid.nl')
    ) = '.staging.fieldgrid.nl'
    AND EXISTS (
      SELECT 1
      FROM public.tenant_modules AS entitlement
      JOIN public.modules AS module
        ON module.id = entitlement.module_id
      WHERE entitlement.tenant_id = tenant.id
        AND module.key = 'website'
        AND entitlement.is_enabled = true
    )
  FOR UPDATE OF deployment, site;

  IF NOT FOUND THEN
    RETURN NEXT;
    RETURN;
  END IF;

  v_was_healthy := v_previous_health IS NOT NULL;
  v_checked_at := pg_catalog.clock_timestamp();

  UPDATE public.website_custom_deployments AS deployment
  SET last_checked_at = v_checked_at,
      last_health = p_evidence,
      updated_at = v_checked_at
  WHERE deployment.tenant_id = p_tenant_id
    AND deployment.site_id = p_site_id
    AND deployment.id = p_deployment_id;

  IF v_previous_checked_at IS NOT NULL
    AND v_was_healthy
    AND p_evidence IS NULL
  THEN
    INSERT INTO public.audit_log (
      tenant_id, user_id, action, resource, resource_id, metadata
    ) VALUES (
      p_tenant_id,
      p_actor_user_id,
      'website_custom_deployment_health_failed',
      'website',
      p_deployment_id,
      pg_catalog.jsonb_build_object(
        'siteId', p_site_id::text,
        'automated', true,
        'failureCode', p_failure_code,
        'responseRecorded', false,
        'originRecorded', false
      )
    );
  ELSIF v_previous_checked_at IS NOT NULL
    AND NOT v_was_healthy
    AND p_evidence IS NOT NULL
  THEN
    INSERT INTO public.audit_log (
      tenant_id, user_id, action, resource, resource_id, metadata
    ) VALUES (
      p_tenant_id,
      p_actor_user_id,
      'website_custom_deployment_health_recovered',
      'website',
      p_deployment_id,
      pg_catalog.jsonb_build_object(
        'siteId', p_site_id::text,
        'automated', true,
        'evidenceSchemaVersion', 3,
        'responseRecorded', false,
        'originRecorded', false
      )
    );
  END IF;

  applied := true;
  health_state := CASE WHEN p_evidence IS NULL THEN 'failed' ELSE 'healthy' END;
  checked_at := v_checked_at;
  RETURN NEXT;
END;
$fieldgrid_record_custom_website_health_refresh$;

REVOKE EXECUTE ON FUNCTION
  app_private.fieldgrid_claim_custom_website_health_refresh(integer)
FROM PUBLIC, anon, authenticated, service_role,
  fieldgrid_runtime_app, fieldgrid_runtime_data;
REVOKE EXECUTE ON FUNCTION
  app_private.fieldgrid_record_custom_website_health_refresh(
    uuid, uuid, uuid, text, text, text, text, text,
    timestamptz, jsonb, text, uuid
  )
FROM PUBLIC, anon, authenticated, service_role,
  fieldgrid_runtime_app, fieldgrid_runtime_data;

GRANT EXECUTE ON FUNCTION
  app_private.fieldgrid_claim_custom_website_health_refresh(integer)
TO fieldgrid_runtime_data;
GRANT EXECUTE ON FUNCTION
  app_private.fieldgrid_record_custom_website_health_refresh(
    uuid, uuid, uuid, text, text, text, text, text,
    timestamptz, jsonb, text, uuid
  )
TO fieldgrid_runtime_data;

INSERT INTO app_private.fieldgrid_runtime_function_capabilities (
  schema_name, function_name, argument_types, access_mode, source_migration
) VALUES
  (
    'app_private',
    'fieldgrid_claim_custom_website_health_refresh',
    'integer',
    'direct',
    '20260909121000_custom_website_health_refresh.sql'
  ),
  (
    'app_private',
    'fieldgrid_record_custom_website_health_refresh',
    'uuid, uuid, uuid, text, text, text, text, text, timestamp with time zone, jsonb, text, uuid',
    'direct',
    '20260909121000_custom_website_health_refresh.sql'
  )
ON CONFLICT (schema_name, function_name, argument_types)
DO UPDATE SET
  access_mode = EXCLUDED.access_mode,
  source_migration = EXCLUDED.source_migration;

DO $fieldgrid_health_refresh_acl_closure$
DECLARE
  function_oid oid;
  function_owner oid;
  runtime_app_oid oid := pg_catalog.to_regrole('fieldgrid_runtime_app');
  runtime_data_oid oid := pg_catalog.to_regrole('fieldgrid_runtime_data');
BEGIN
  FOREACH function_oid IN ARRAY ARRAY[
    'app_private.fieldgrid_claim_custom_website_health_refresh(integer)'::regprocedure::oid,
    'app_private.fieldgrid_record_custom_website_health_refresh(uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb,text,uuid)'::regprocedure::oid
  ]
  LOOP
    SELECT function_catalog.proowner
    INTO function_owner
    FROM pg_catalog.pg_proc AS function_catalog
    WHERE function_catalog.oid = function_oid;

    IF function_owner <> pg_catalog.to_regrole(current_user)
      OR function_owner IN (runtime_app_oid, runtime_data_oid)
    THEN
      RAISE EXCEPTION 'Health refresh function has an unsafe owner';
    END IF;

    IF NOT pg_catalog.has_function_privilege(
      'fieldgrid_runtime_data', function_oid, 'EXECUTE'
    ) OR NOT pg_catalog.has_function_privilege(
      'fieldgrid_runtime_app', function_oid, 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'Runtime health refresh EXECUTE grant is missing';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(
        COALESCE(
          (SELECT function_catalog.proacl
           FROM pg_catalog.pg_proc AS function_catalog
           WHERE function_catalog.oid = function_oid),
          pg_catalog.acldefault('f', function_owner)
        )
      ) AS privilege
      WHERE privilege.grantee = runtime_app_oid
        AND privilege.privilege_type = 'EXECUTE'
    ) OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(
        COALESCE(
          (SELECT function_catalog.proacl
           FROM pg_catalog.pg_proc AS function_catalog
           WHERE function_catalog.oid = function_oid),
          pg_catalog.acldefault('f', function_owner)
        )
      ) AS privilege
      WHERE privilege.grantee = runtime_data_oid
        AND privilege.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION
        'Runtime app must inherit health refresh EXECUTE only through runtime data';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(
        COALESCE(
          (SELECT function_catalog.proacl
           FROM pg_catalog.pg_proc AS function_catalog
           WHERE function_catalog.oid = function_oid),
          pg_catalog.acldefault('f', function_owner)
        )
      ) AS privilege
      WHERE privilege.grantee = 0
        AND privilege.privilege_type = 'EXECUTE'
    )
      OR pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE')
      OR pg_catalog.has_function_privilege(
        'authenticated', function_oid, 'EXECUTE'
      )
      OR pg_catalog.has_function_privilege(
        'service_role', function_oid, 'EXECUTE'
      )
    THEN
      RAISE EXCEPTION 'Health refresh function has ambient EXECUTE access';
    END IF;
  END LOOP;

  IF (
    SELECT pg_catalog.count(*)
    FROM app_private.fieldgrid_runtime_function_capabilities AS capability
    WHERE capability.source_migration =
      '20260909121000_custom_website_health_refresh.sql'
      AND capability.schema_name = 'app_private'
      AND capability.access_mode = 'direct'
      AND (
        (
          capability.function_name =
            'fieldgrid_claim_custom_website_health_refresh'
          AND capability.argument_types = 'integer'
        )
        OR (
          capability.function_name =
            'fieldgrid_record_custom_website_health_refresh'
          AND capability.argument_types =
            'uuid, uuid, uuid, text, text, text, text, text, timestamp with time zone, jsonb, text, uuid'
        )
      )
  ) <> 2 OR EXISTS (
    SELECT 1
    FROM app_private.fieldgrid_runtime_function_capabilities AS capability
    WHERE capability.source_migration =
      '20260909121000_custom_website_health_refresh.sql'
      AND NOT (
        capability.schema_name = 'app_private'
        AND capability.access_mode = 'direct'
        AND (
          (
            capability.function_name =
              'fieldgrid_claim_custom_website_health_refresh'
            AND capability.argument_types = 'integer'
          )
          OR (
            capability.function_name =
              'fieldgrid_record_custom_website_health_refresh'
            AND capability.argument_types =
              'uuid, uuid, uuid, text, text, text, text, text, timestamp with time zone, jsonb, text, uuid'
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'Health refresh capability manifest is not exact';
  END IF;
END;
$fieldgrid_health_refresh_acl_closure$;
