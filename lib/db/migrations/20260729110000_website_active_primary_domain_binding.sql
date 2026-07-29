-- A tenant domain remains fully trusted after platform TLS activation changes
-- verification_status from verified to active. Website binding must accept
-- both trusted lifecycle states while continuing to reject disabled,
-- platform-reserved and unverified domains.

CREATE OR REPLACE FUNCTION public.website_validate_domain_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  domain_row record;
BEGIN
  SELECT
    tenant_id,
    lower(trim(domain)) AS domain,
    type,
    verification_status,
    verified_at,
    disabled_at
  INTO domain_row
  FROM public.tenant_domains
  WHERE id = NEW.tenant_domain_id;

  IF NOT FOUND OR domain_row.tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'website domain tenant mismatch';
  END IF;
  IF domain_row.domain <> NEW.hostname THEN
    RAISE EXCEPTION 'website hostname does not match verified tenant domain';
  END IF;
  IF domain_row.type = 'platform_reserved' THEN
    RAISE EXCEPTION 'platform-reserved domains cannot host tenant websites';
  END IF;
  IF NEW.status = 'active' AND (
    domain_row.verification_status NOT IN ('verified', 'active')
    OR domain_row.verified_at IS NULL
    OR domain_row.disabled_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'website domain must be active or verified before activation';
  END IF;
  IF NEW.status = 'active' THEN
    NEW.verified_at := domain_row.verified_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.website_validate_domain_binding()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_primary_website_domain(
  p_tenant_id uuid,
  p_site_id uuid,
  p_tenant_domain_id uuid,
  p_expected_authoring_revision integer,
  p_actor_user_id uuid,
  p_reason text
)
RETURNS public.website_domain_bindings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  current_site public.website_sites%ROWTYPE;
  tenant_domain public.tenant_domains%ROWTYPE;
  existing_binding public.website_domain_bindings%ROWTYPE;
  current_primary public.website_domain_bindings%ROWTYPE;
  selected_binding public.website_domain_bindings%ROWTYPE;
  previous_child_touch text := current_setting('fieldgrid.website_child_authoring_touch', true);
  previous_authoring_touch text := current_setting('fieldgrid.website_authoring_touch', true);
BEGIN
  IF p_actor_user_id IS NULL OR nullif(trim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'website domain actor and reason are required';
  END IF;

  SELECT * INTO current_site
  FROM public.website_sites
  WHERE tenant_id = p_tenant_id AND id = p_site_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'website site not found';
  END IF;
  IF current_site.authoring_revision <> p_expected_authoring_revision THEN
    RAISE EXCEPTION 'website authoring revision conflict';
  END IF;
  IF current_site.status = 'disabled' THEN
    RAISE EXCEPTION 'disabled website cannot change its primary domain';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_modules entitlement
    JOIN public.modules module ON module.id = entitlement.module_id
    WHERE entitlement.tenant_id = p_tenant_id
      AND module.key = 'website'
      AND entitlement.is_enabled = true
  ) THEN
    RAISE EXCEPTION 'website module entitlement is required';
  END IF;

  SELECT * INTO tenant_domain
  FROM public.tenant_domains
  WHERE tenant_id = p_tenant_id AND id = p_tenant_domain_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'verified tenant domain not found';
  END IF;
  IF tenant_domain.type = 'platform_reserved'
    OR tenant_domain.verification_status NOT IN ('verified', 'active')
    OR tenant_domain.verified_at IS NULL
    OR tenant_domain.disabled_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'website primary domain must be active or verified and tenant-owned';
  END IF;

  SELECT * INTO existing_binding
  FROM public.website_domain_bindings
  WHERE tenant_domain_id = p_tenant_domain_id
     OR hostname = lower(trim(tenant_domain.domain))
  LIMIT 1
  FOR UPDATE;

  IF FOUND AND (
    existing_binding.tenant_id <> p_tenant_id
    OR existing_binding.site_id <> p_site_id
  ) THEN
    RAISE EXCEPTION 'website domain is already bound to another site';
  END IF;

  SELECT * INTO current_primary
  FROM public.website_domain_bindings
  WHERE tenant_id = p_tenant_id
    AND site_id = p_site_id
    AND status = 'active'
    AND is_primary = true
  LIMIT 1
  FOR UPDATE;

  IF FOUND AND current_primary.tenant_domain_id = p_tenant_domain_id THEN
    RAISE EXCEPTION 'website primary domain transition is a no-op';
  END IF;

  PERFORM set_config('fieldgrid.website_child_authoring_touch', 'suppressed', true);

  UPDATE public.website_domain_bindings
  SET is_primary = false, updated_by = p_actor_user_id, updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND site_id = p_site_id
    AND is_primary = true;

  INSERT INTO public.website_domain_bindings (
    tenant_id,
    site_id,
    tenant_domain_id,
    hostname,
    status,
    is_primary,
    verified_at,
    created_by,
    updated_by
  ) VALUES (
    p_tenant_id,
    p_site_id,
    p_tenant_domain_id,
    lower(trim(tenant_domain.domain)),
    'active',
    true,
    tenant_domain.verified_at,
    p_actor_user_id,
    p_actor_user_id
  )
  ON CONFLICT (tenant_domain_id) DO UPDATE
  SET
    status = 'active',
    is_primary = true,
    verified_at = EXCLUDED.verified_at,
    updated_by = p_actor_user_id,
    updated_at = now()
  RETURNING * INTO selected_binding;

  PERFORM set_config(
    'fieldgrid.website_child_authoring_touch',
    COALESCE(previous_child_touch, ''),
    true
  );
  PERFORM set_config('fieldgrid.website_authoring_touch', 'allowed', true);
  UPDATE public.website_sites
  SET
    authoring_revision = authoring_revision + 1,
    updated_by = p_actor_user_id,
    updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_site_id;
  PERFORM set_config(
    'fieldgrid.website_authoring_touch',
    COALESCE(previous_authoring_touch, ''),
    true
  );

  INSERT INTO public.audit_log (
    tenant_id,
    user_id,
    action,
    resource,
    resource_id,
    metadata
  ) VALUES (
    p_tenant_id,
    p_actor_user_id,
    'website_primary_domain_changed',
    'website',
    p_site_id::text,
    jsonb_build_object(
      'fromDomainBindingId', current_primary.id,
      'toDomainBindingId', selected_binding.id,
      'hostname', selected_binding.hostname,
      'fromAuthoringRevision', p_expected_authoring_revision,
      'toAuthoringRevision', p_expected_authoring_revision + 1,
      'reason', trim(p_reason)
    )
  );

  RETURN selected_binding;
END;
$$;

REVOKE ALL ON FUNCTION public.set_primary_website_domain(
  uuid, uuid, uuid, integer, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bind_primary_tenant_domain_to_website(
  p_tenant_id uuid,
  p_site_id uuid,
  p_expected_authoring_revision integer,
  p_actor_user_id uuid,
  p_reason text
)
RETURNS public.website_domain_bindings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  primary_domain public.tenant_domains%ROWTYPE;
BEGIN
  SELECT * INTO primary_domain
  FROM public.tenant_domains
  WHERE tenant_id = p_tenant_id
    AND is_primary = true
    AND type <> 'platform_reserved'
    AND verification_status IN ('verified', 'active')
    AND verified_at IS NOT NULL
    AND disabled_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'exactly one active or verified primary tenant domain is required';
  END IF;

  RETURN public.set_primary_website_domain(
    p_tenant_id,
    p_site_id,
    primary_domain.id,
    p_expected_authoring_revision,
    p_actor_user_id,
    p_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bind_primary_tenant_domain_to_website(
  uuid, uuid, integer, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
