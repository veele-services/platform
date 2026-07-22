-- Phase 1B: exact authoring revisions, verified primary-domain transitions and
-- immutable managed-publication activation. This migration remains server-only:
-- it adds no browser policy, public route, deployment or live domain change.

ALTER TABLE public.website_publications
  ADD COLUMN IF NOT EXISTS target_delivery_revision integer,
  ADD COLUMN IF NOT EXISTS cache_key varchar(320);

UPDATE public.website_publications
SET target_delivery_revision = CASE
      WHEN snapshot ->> 'deliveryRevision' ~ '^[1-9][0-9]*$'
        THEN (snapshot ->> 'deliveryRevision')::integer
      ELSE 1
    END
WHERE target_delivery_revision IS NULL;

UPDATE public.website_publications
SET cache_key = concat(
  'website-publication:v1:',
  tenant_id::text,
  ':',
  site_id::text,
  ':r',
  target_delivery_revision::text,
  ':',
  content_hash
)
WHERE cache_key IS NULL;

ALTER TABLE public.website_publications
  ALTER COLUMN target_delivery_revision SET NOT NULL,
  ALTER COLUMN cache_key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'website_publications_target_delivery_revision_check'
      AND conrelid = 'public.website_publications'::regclass
  ) THEN
    ALTER TABLE public.website_publications
      ADD CONSTRAINT website_publications_target_delivery_revision_check
      CHECK (target_delivery_revision > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'website_publications_snapshot_delivery_revision_check'
      AND conrelid = 'public.website_publications'::regclass
  ) THEN
    ALTER TABLE public.website_publications
      ADD CONSTRAINT website_publications_snapshot_delivery_revision_check
      CHECK (
        snapshot ->> 'deliveryRevision' ~ '^[1-9][0-9]*$'
        AND (snapshot ->> 'deliveryRevision')::integer = target_delivery_revision
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'website_publications_cache_key_check'
      AND conrelid = 'public.website_publications'::regclass
  ) THEN
    ALTER TABLE public.website_publications
      ADD CONSTRAINT website_publications_cache_key_check
      CHECK (
        cache_key = concat(
          'website-publication:v1:',
          tenant_id::text,
          ':',
          site_id::text,
          ':r',
          target_delivery_revision::text,
          ':',
          content_hash
        )
      );
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS website_publications_cache_key_idx
  ON public.website_publications (cache_key);

CREATE OR REPLACE FUNCTION public.website_guard_site_authoring_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  authoring_changed boolean;
  trusted_touch boolean := current_setting('fieldgrid.website_authoring_touch', true) = 'allowed';
BEGIN
  authoring_changed := ROW(
    NEW.name,
    NEW.is_primary,
    NEW.template_key,
    NEW.template_version,
    NEW.default_locale,
    NEW.theme,
    NEW.contact,
    NEW.social_links,
    NEW.default_seo,
    NEW.analytics
  ) IS DISTINCT FROM ROW(
    OLD.name,
    OLD.is_primary,
    OLD.template_key,
    OLD.template_version,
    OLD.default_locale,
    OLD.theme,
    OLD.contact,
    OLD.social_links,
    OLD.default_seo,
    OLD.analytics
  );

  IF authoring_changed AND NOT trusted_touch THEN
    IF NEW.authoring_revision IS DISTINCT FROM OLD.authoring_revision THEN
      RAISE EXCEPTION 'website authoring revision is database-managed';
    END IF;
    NEW.authoring_revision := OLD.authoring_revision + 1;
  ELSIF NOT authoring_changed
    AND NEW.authoring_revision IS DISTINCT FROM OLD.authoring_revision
    AND NOT trusted_touch
  THEN
    RAISE EXCEPTION 'website authoring revision is database-managed';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.website_guard_site_authoring_revision()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_website_sites_authoring_revision ON public.website_sites;
CREATE TRIGGER trg_website_sites_authoring_revision
BEFORE UPDATE ON public.website_sites
FOR EACH ROW EXECUTE FUNCTION public.website_guard_site_authoring_revision();

CREATE OR REPLACE FUNCTION public.website_touch_child_authoring_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  owner_tenant_id uuid;
  owner_site_id uuid;
  actor_user_id uuid;
  previous_authoring_touch text := current_setting('fieldgrid.website_authoring_touch', true);
BEGIN
  IF current_setting('fieldgrid.website_child_authoring_touch', true) = 'suppressed' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.site_id IS DISTINCT FROM OLD.site_id
  ) THEN
    RAISE EXCEPTION 'website child ownership is immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    owner_tenant_id := OLD.tenant_id;
    owner_site_id := OLD.site_id;
    actor_user_id := OLD.updated_by;
  ELSE
    owner_tenant_id := NEW.tenant_id;
    owner_site_id := NEW.site_id;
    actor_user_id := NEW.updated_by;
  END IF;

  PERFORM set_config('fieldgrid.website_authoring_touch', 'allowed', true);
  UPDATE public.website_sites
  SET
    authoring_revision = authoring_revision + 1,
    updated_by = actor_user_id,
    updated_at = now()
  WHERE tenant_id = owner_tenant_id
    AND id = owner_site_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'website authoring parent site not found';
  END IF;
  PERFORM set_config(
    'fieldgrid.website_authoring_touch',
    COALESCE(previous_authoring_touch, ''),
    true
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.website_touch_child_authoring_revision()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_website_domain_bindings_touch_authoring
  ON public.website_domain_bindings;
CREATE TRIGGER trg_website_domain_bindings_touch_authoring
AFTER INSERT OR UPDATE OR DELETE ON public.website_domain_bindings
FOR EACH ROW EXECUTE FUNCTION public.website_touch_child_authoring_revision();

DROP TRIGGER IF EXISTS trg_website_pages_touch_authoring ON public.website_pages;
CREATE TRIGGER trg_website_pages_touch_authoring
AFTER INSERT OR UPDATE OR DELETE ON public.website_pages
FOR EACH ROW EXECUTE FUNCTION public.website_touch_child_authoring_revision();

DROP TRIGGER IF EXISTS trg_website_page_sections_touch_authoring
  ON public.website_page_sections;
CREATE TRIGGER trg_website_page_sections_touch_authoring
AFTER INSERT OR UPDATE OR DELETE ON public.website_page_sections
FOR EACH ROW EXECUTE FUNCTION public.website_touch_child_authoring_revision();

DROP TRIGGER IF EXISTS trg_website_navigation_items_touch_authoring
  ON public.website_navigation_items;
CREATE TRIGGER trg_website_navigation_items_touch_authoring
AFTER INSERT OR UPDATE OR DELETE ON public.website_navigation_items
FOR EACH ROW EXECUTE FUNCTION public.website_touch_child_authoring_revision();

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
    OR tenant_domain.verification_status <> 'verified'
    OR tenant_domain.verified_at IS NULL
  THEN
    RAISE EXCEPTION 'website primary domain must be verified and tenant-owned';
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

CREATE OR REPLACE FUNCTION public.website_assert_delivery_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  tenant_row record;
  primary_hostname text;
  target_row record;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT is_active, status, plan_key
  INTO tenant_row
  FROM public.tenants
  WHERE id = NEW.tenant_id;

  IF NOT FOUND OR tenant_row.is_active IS NOT TRUE OR tenant_row.status NOT IN ('trial', 'active') THEN
    RAISE EXCEPTION 'website tenant is not active';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_modules entitlement
    JOIN public.modules module ON module.id = entitlement.module_id
    WHERE entitlement.tenant_id = NEW.tenant_id
      AND module.key = 'website'
      AND entitlement.is_enabled = true
  ) THEN
    RAISE EXCEPTION 'website module entitlement is required';
  END IF;

  SELECT hostname
  INTO primary_hostname
  FROM public.website_domain_bindings
  WHERE tenant_id = NEW.tenant_id
    AND site_id = NEW.id
    AND status = 'active'
    AND is_primary = true;

  IF primary_hostname IS NULL THEN
    RAISE EXCEPTION 'an active primary website domain is required';
  END IF;

  IF NEW.delivery_mode = 'managed_cms' THEN
    SELECT status, target_delivery_revision
    INTO target_row
    FROM public.website_publications
    WHERE id = NEW.active_publication_id
      AND tenant_id = NEW.tenant_id
      AND site_id = NEW.id;

    IF NOT FOUND
      OR target_row.status NOT IN ('ready', 'active')
      OR target_row.target_delivery_revision <> NEW.delivery_revision
    THEN
      RAISE EXCEPTION 'managed website publication is not ready for the exact delivery revision';
    END IF;
  ELSIF NEW.delivery_mode = 'custom_nextjs' THEN
    IF tenant_row.plan_key <> 'enterprise' THEN
      RAISE EXCEPTION 'custom Next.js delivery requires an enterprise tenant';
    END IF;

    SELECT status, approved_at, approved_by, last_checked_at, expected_host
    INTO target_row
    FROM public.website_custom_deployments
    WHERE id = NEW.active_custom_deployment_id
      AND tenant_id = NEW.tenant_id
      AND site_id = NEW.id;

    IF NOT FOUND
      OR target_row.status NOT IN ('ready', 'active')
      OR target_row.approved_at IS NULL
      OR target_row.approved_by IS NULL
      OR target_row.last_checked_at IS NULL
      OR target_row.expected_host <> primary_hostname
    THEN
      RAISE EXCEPTION 'custom Next.js deployment is not approved for the active website host';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported website delivery mode';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.website_assert_delivery_target()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.activate_website_delivery(
  p_tenant_id uuid,
  p_site_id uuid,
  p_expected_revision integer,
  p_to_mode varchar,
  p_to_target_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
RETURNS public.website_sites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  current_site public.website_sites%ROWTYPE;
  updated_site public.website_sites%ROWTYPE;
  from_target_id uuid;
  previous_managed_publication_id uuid;
  previous_transition text := current_setting('fieldgrid.website_delivery_transition', true);
BEGIN
  IF p_to_mode NOT IN ('managed_cms', 'custom_nextjs') THEN
    RAISE EXCEPTION 'unsupported website delivery mode';
  END IF;
  IF p_to_target_id IS NULL THEN
    RAISE EXCEPTION 'website delivery target is required';
  END IF;
  IF p_actor_user_id IS NULL OR nullif(trim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'website delivery actor and reason are required';
  END IF;

  SELECT * INTO current_site
  FROM public.website_sites
  WHERE tenant_id = p_tenant_id AND id = p_site_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'website site not found';
  END IF;
  IF current_site.delivery_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'website delivery revision conflict';
  END IF;

  from_target_id := CASE current_site.delivery_mode
    WHEN 'managed_cms' THEN current_site.active_publication_id
    ELSE current_site.active_custom_deployment_id
  END;

  IF current_site.status = 'active'
    AND current_site.delivery_mode = p_to_mode
    AND from_target_id = p_to_target_id
  THEN
    RAISE EXCEPTION 'website delivery transition is a no-op';
  END IF;

  previous_managed_publication_id := CASE
    WHEN current_site.delivery_mode = 'managed_cms'
      AND p_to_mode = 'custom_nextjs'
    THEN current_site.active_publication_id
    ELSE NULL
  END;

  IF previous_managed_publication_id IS NOT NULL THEN
    UPDATE public.website_publications
    SET status = 'ready'
    WHERE tenant_id = p_tenant_id
      AND site_id = p_site_id
      AND id = previous_managed_publication_id
      AND status IN ('ready', 'active');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'active managed website publication is not preservable';
    END IF;
  END IF;

  PERFORM set_config('fieldgrid.website_delivery_transition', 'allowed', true);

  UPDATE public.website_sites
  SET
    status = 'active',
    delivery_mode = p_to_mode,
    active_publication_id = CASE
      WHEN p_to_mode = 'managed_cms' THEN p_to_target_id
      ELSE active_publication_id
    END,
    active_custom_deployment_id = CASE
      WHEN p_to_mode = 'custom_nextjs' THEN p_to_target_id
      ELSE active_custom_deployment_id
    END,
    delivery_revision = delivery_revision + 1,
    updated_by = p_actor_user_id,
    updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_site_id
  RETURNING * INTO updated_site;

  PERFORM set_config(
    'fieldgrid.website_delivery_transition',
    COALESCE(previous_transition, ''),
    true
  );

  IF previous_managed_publication_id IS NOT NULL THEN
    UPDATE public.website_publications
    SET status = 'superseded'
    WHERE tenant_id = p_tenant_id
      AND site_id = p_site_id
      AND id = previous_managed_publication_id
      AND status = 'ready';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'managed website publication preservation failed';
    END IF;
  END IF;

  INSERT INTO public.website_delivery_activations (
    tenant_id,
    site_id,
    from_mode,
    from_target_id,
    to_mode,
    to_target_id,
    expected_revision,
    new_revision,
    reason,
    actor_user_id
  ) VALUES (
    p_tenant_id,
    p_site_id,
    current_site.delivery_mode,
    from_target_id,
    p_to_mode,
    p_to_target_id,
    p_expected_revision,
    updated_site.delivery_revision,
    trim(p_reason),
    p_actor_user_id
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
    'website_delivery_switched',
    'website',
    p_site_id::text,
    jsonb_build_object(
      'fromMode', current_site.delivery_mode,
      'fromTargetId', from_target_id,
      'toMode', p_to_mode,
      'toTargetId', p_to_target_id,
      'fromRevision', p_expected_revision,
      'toRevision', updated_site.delivery_revision,
      'reason', trim(p_reason)
    )
  );

  RETURN updated_site;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_website_delivery(
  uuid, uuid, integer, varchar, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.website_guard_publication_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('ready', 'active', 'superseded') THEN
      RAISE EXCEPTION 'ready website publications are immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('ready', 'active', 'superseded') AND (
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.site_id IS DISTINCT FROM OLD.site_id
    OR NEW.sequence IS DISTINCT FROM OLD.sequence
    OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
    OR NEW.source_revision IS DISTINCT FROM OLD.source_revision
    OR NEW.target_delivery_revision IS DISTINCT FROM OLD.target_delivery_revision
    OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
    OR NEW.cache_key IS DISTINCT FROM OLD.cache_key
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'ready website publications are immutable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.website_sites site
    WHERE site.id = OLD.site_id
      AND site.tenant_id = OLD.tenant_id
      AND site.status = 'active'
      AND site.delivery_mode = 'managed_cms'
      AND site.active_publication_id = OLD.id
  ) AND NEW.status NOT IN ('ready', 'active') THEN
    RAISE EXCEPTION 'active managed website publication cannot be retired';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.website_guard_publication_immutability()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.activate_managed_website_publication(
  p_tenant_id uuid,
  p_site_id uuid,
  p_publication_id uuid,
  p_expected_authoring_revision integer,
  p_expected_delivery_revision integer,
  p_actor_user_id uuid,
  p_reason text
)
RETURNS public.website_sites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  current_site public.website_sites%ROWTYPE;
  candidate public.website_publications%ROWTYPE;
  updated_site public.website_sites%ROWTYPE;
  previous_publication_id uuid;
BEGIN
  IF p_actor_user_id IS NULL OR nullif(trim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'website publication activation actor and reason are required';
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
  IF current_site.delivery_revision <> p_expected_delivery_revision THEN
    RAISE EXCEPTION 'website delivery revision conflict';
  END IF;

  SELECT * INTO candidate
  FROM public.website_publications
  WHERE tenant_id = p_tenant_id
    AND site_id = p_site_id
    AND id = p_publication_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'website publication not found';
  END IF;
  IF candidate.status NOT IN ('ready', 'superseded') THEN
    RAISE EXCEPTION 'website publication is not an activatable immutable candidate';
  END IF;
  IF candidate.source_revision <> p_expected_authoring_revision THEN
    RAISE EXCEPTION 'website publication source revision is stale';
  END IF;
  IF candidate.target_delivery_revision <> p_expected_delivery_revision + 1 THEN
    RAISE EXCEPTION 'website publication delivery revision is stale';
  END IF;

  previous_publication_id := current_site.active_publication_id;
  IF current_site.delivery_mode = 'managed_cms'
    AND previous_publication_id = p_publication_id
  THEN
    RAISE EXCEPTION 'website publication activation is a no-op';
  END IF;

  IF previous_publication_id IS NOT NULL
    AND previous_publication_id <> p_publication_id
  THEN
    UPDATE public.website_publications
    SET status = 'ready'
    WHERE tenant_id = p_tenant_id
      AND site_id = p_site_id
      AND id = previous_publication_id
      AND status = 'active';
  END IF;

  UPDATE public.website_publications
  SET
    status = 'active',
    activated_by = p_actor_user_id,
    activated_at = now()
  WHERE tenant_id = p_tenant_id
    AND site_id = p_site_id
    AND id = p_publication_id;

  SELECT * INTO updated_site
  FROM public.activate_website_delivery(
    p_tenant_id,
    p_site_id,
    p_expected_delivery_revision,
    'managed_cms',
    p_publication_id,
    p_actor_user_id,
    p_reason
  );

  IF previous_publication_id IS NOT NULL
    AND previous_publication_id <> p_publication_id
  THEN
    UPDATE public.website_publications
    SET status = 'superseded'
    WHERE tenant_id = p_tenant_id
      AND site_id = p_site_id
      AND id = previous_publication_id;
  END IF;

  RETURN updated_site;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_managed_website_publication(
  uuid, uuid, uuid, integer, integer, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
