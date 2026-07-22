-- Fieldgrid Websites Phase 1A: tenant-scoped authoring and fail-closed delivery foundations.
-- Forward-only. This migration creates no public route, deployment or active website.

INSERT INTO public.modules (key, name, description, category, is_system, is_enabled_by_default)
VALUES (
  'website',
  'Website',
  'Beheerde modulaire websites en gecontroleerde enterprise custom-Next.js delivery.',
  'growth',
  true,
  false
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  is_system = true,
  is_enabled_by_default = false,
  updated_at = now();

-- Deliberately do not enable the module for plans or existing tenants. Entitlement
-- remains an explicit platform decision and is checked again during activation.

INSERT INTO public.permissions (resource, action, description)
VALUES
  ('website', 'read', 'Websitestatus, domeinstatus en publicatiegezondheid bekijken.'),
  ('website_settings', 'read', 'Website-instellingen bekijken.'),
  ('website_settings', 'write', 'Website-instellingen beheren.'),
  ('website_pages', 'read', 'Websitepagina''s bekijken.'),
  ('website_pages', 'write', 'Websitepaginaconcepten beheren.'),
  ('website_pages', 'publish', 'Onveranderlijke websitepublicaties activeren.'),
  ('website_navigation', 'read', 'Websitenavigatie bekijken.'),
  ('website_navigation', 'write', 'Websitenavigatie beheren.'),
  ('website_blog', 'read', 'Websiteblog bekijken.'),
  ('website_blog', 'write', 'Websiteblogconcepten beheren.'),
  ('website_blog', 'publish', 'Websiteblog publiceren.'),
  ('website_forms', 'read', 'Websiteformulieren bekijken.'),
  ('website_forms', 'write', 'Websiteformulieren beheren.'),
  ('website_submissions', 'read', 'Websiteformulierinzendingen bekijken.'),
  ('website_submissions', 'write', 'Websiteformulierinzendingen verwerken.'),
  ('website_media', 'read', 'Websitemedia bekijken.'),
  ('website_media', 'write', 'Websitemedia beheren.')
ON CONFLICT (resource, action) DO UPDATE SET description = EXCLUDED.description;

WITH grants(role_name, resource, action) AS (
  VALUES
    ('Management', 'website', 'read'),
    ('Management', 'website_settings', 'read'),
    ('Management', 'website_settings', 'write'),
    ('Management', 'website_pages', 'read'),
    ('Management', 'website_pages', 'write'),
    ('Management', 'website_pages', 'publish'),
    ('Management', 'website_navigation', 'read'),
    ('Management', 'website_navigation', 'write'),
    ('Management', 'website_blog', 'read'),
    ('Management', 'website_blog', 'write'),
    ('Management', 'website_blog', 'publish'),
    ('Management', 'website_forms', 'read'),
    ('Management', 'website_forms', 'write'),
    ('Management', 'website_submissions', 'read'),
    ('Management', 'website_submissions', 'write'),
    ('Management', 'website_media', 'read'),
    ('Management', 'website_media', 'write'),
    ('Administration', 'website', 'read'),
    ('Administration', 'website_settings', 'read'),
    ('Administration', 'website_settings', 'write'),
    ('Administration', 'website_pages', 'read'),
    ('Administration', 'website_pages', 'write'),
    ('Administration', 'website_pages', 'publish'),
    ('Administration', 'website_navigation', 'read'),
    ('Administration', 'website_navigation', 'write'),
    ('Administration', 'website_blog', 'read'),
    ('Administration', 'website_blog', 'write'),
    ('Administration', 'website_blog', 'publish'),
    ('Administration', 'website_forms', 'read'),
    ('Administration', 'website_forms', 'write'),
    ('Administration', 'website_submissions', 'read'),
    ('Administration', 'website_submissions', 'write'),
    ('Administration', 'website_media', 'read'),
    ('Administration', 'website_media', 'write')
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM grants grant_row
JOIN public.roles role ON role.name = grant_row.role_name
JOIN public.permissions permission
  ON permission.resource = grant_row.resource
 AND permission.action = grant_row.action
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.tenant_role_permissions (tenant_role_id, permission_id, created_at)
SELECT tenant_role.id, role_permission.permission_id, now()
FROM public.tenant_roles tenant_role
JOIN public.role_permissions role_permission
  ON role_permission.role_id = tenant_role.template_role_id
JOIN public.permissions permission
  ON permission.id = role_permission.permission_id
 AND permission.resource LIKE 'website%'
WHERE tenant_role.template_role_id IS NOT NULL
ON CONFLICT (tenant_role_id, permission_id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_domains_tenant_id_unique_idx
  ON public.tenant_domains (tenant_id, id);

CREATE TABLE IF NOT EXISTS public.website_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name varchar(160) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'draft',
  is_primary boolean NOT NULL DEFAULT false,
  delivery_mode varchar(30) NOT NULL DEFAULT 'managed_cms',
  delivery_revision integer NOT NULL DEFAULT 1,
  active_publication_id uuid,
  active_custom_deployment_id uuid,
  template_key varchar(80),
  template_version integer,
  default_locale varchar(20) NOT NULL DEFAULT 'nl-NL',
  theme jsonb NOT NULL,
  contact jsonb NOT NULL,
  social_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_seo jsonb NOT NULL,
  analytics jsonb NOT NULL DEFAULT '{"provider":"none"}'::jsonb,
  authoring_revision integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_sites_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT website_sites_status_check CHECK (status IN ('draft', 'active', 'disabled')),
  CONSTRAINT website_sites_delivery_mode_check CHECK (delivery_mode IN ('managed_cms', 'custom_nextjs')),
  CONSTRAINT website_sites_delivery_revision_check CHECK (delivery_revision > 0),
  CONSTRAINT website_sites_authoring_revision_check CHECK (authoring_revision > 0),
  CONSTRAINT website_sites_template_check CHECK (
    template_key IS NULL OR template_key IN (
      'trust_conversion',
      'premium_local_authority',
      'fast_service_emergency',
      'multi_service_company',
      'content_seo_growth'
    )
  ),
  CONSTRAINT website_sites_template_version_check CHECK (template_version IS NULL OR template_version > 0),
  CONSTRAINT website_sites_template_pair_check CHECK (
    (template_key IS NULL AND template_version IS NULL)
    OR (template_key IS NOT NULL AND template_version IS NOT NULL)
  ),
  CONSTRAINT website_sites_locale_check CHECK (default_locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  CONSTRAINT website_sites_json_check CHECK (
    jsonb_typeof(theme) = 'object'
    AND jsonb_typeof(contact) = 'object'
    AND jsonb_typeof(social_links) = 'array'
    AND jsonb_typeof(default_seo) = 'object'
    AND jsonb_typeof(analytics) = 'object'
  ),
  CONSTRAINT website_sites_active_target_presence_check CHECK (
    status <> 'active'
    OR (delivery_mode = 'managed_cms' AND active_publication_id IS NOT NULL)
    OR (delivery_mode = 'custom_nextjs' AND active_custom_deployment_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS website_sites_tenant_primary_idx
  ON public.website_sites (tenant_id)
  WHERE is_primary = true AND status <> 'disabled';
CREATE INDEX IF NOT EXISTS website_sites_tenant_status_idx
  ON public.website_sites (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.website_domain_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL,
  tenant_domain_id uuid NOT NULL,
  hostname varchar(253) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_domain_bindings_tenant_site_fk
    FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.website_sites(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_domain_bindings_tenant_domain_fk
    FOREIGN KEY (tenant_id, tenant_domain_id)
    REFERENCES public.tenant_domains(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_domain_bindings_status_check CHECK (status IN ('pending', 'active', 'disabled')),
  CONSTRAINT website_domain_bindings_hostname_check CHECK (
    hostname = lower(trim(hostname))
    AND hostname ~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
    AND position('.' in hostname) > 0
    AND position('..' in hostname) = 0
  ),
  CONSTRAINT website_domain_bindings_active_verification_check CHECK (
    status <> 'active' OR verified_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS website_domain_bindings_hostname_idx
  ON public.website_domain_bindings (hostname);
CREATE UNIQUE INDEX IF NOT EXISTS website_domain_bindings_tenant_domain_idx
  ON public.website_domain_bindings (tenant_domain_id);
CREATE UNIQUE INDEX IF NOT EXISTS website_domain_bindings_site_primary_idx
  ON public.website_domain_bindings (site_id)
  WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS website_domain_bindings_tenant_site_idx
  ON public.website_domain_bindings (tenant_id, site_id);

CREATE TABLE IF NOT EXISTS public.website_custom_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL,
  provider_key varchar(80) NOT NULL,
  route_key varchar(240) NOT NULL,
  release_id varchar(240) NOT NULL,
  expected_host varchar(253) NOT NULL,
  health_path varchar(500) NOT NULL DEFAULT '/api/health',
  status varchar(20) NOT NULL DEFAULT 'draft',
  approved_at timestamptz,
  approved_by uuid,
  last_checked_at timestamptz,
  last_health jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_custom_deployments_tenant_site_id_unique UNIQUE (tenant_id, site_id, id),
  CONSTRAINT website_custom_deployments_tenant_site_fk
    FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.website_sites(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_custom_deployments_status_check CHECK (
    status IN ('draft', 'checking', 'ready', 'active', 'failed', 'retired')
  ),
  CONSTRAINT website_custom_deployments_provider_check CHECK (
    provider_key ~ '^[a-z0-9][a-z0-9._-]{1,79}$'
  ),
  CONSTRAINT website_custom_deployments_route_check CHECK (
    route_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,239}$'
    AND position('://' in route_key) = 0
  ),
  CONSTRAINT website_custom_deployments_release_check CHECK (
    release_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@+-]{1,239}$'
  ),
  CONSTRAINT website_custom_deployments_host_check CHECK (
    expected_host = lower(trim(expected_host))
    AND expected_host ~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
    AND position('.' in expected_host) > 0
    AND position('..' in expected_host) = 0
  ),
  CONSTRAINT website_custom_deployments_health_path_check CHECK (
    health_path ~ '^/[A-Za-z0-9/_-]*$'
    AND health_path !~ '^//'
  ),
  CONSTRAINT website_custom_deployments_approval_check CHECK (
    (approved_at IS NULL AND approved_by IS NULL)
    OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)
  ),
  CONSTRAINT website_custom_deployments_readiness_check CHECK (
    status NOT IN ('ready', 'active')
    OR (approved_at IS NOT NULL AND approved_by IS NOT NULL AND last_checked_at IS NOT NULL)
  ),
  CONSTRAINT website_custom_deployments_health_json_check CHECK (
    last_health IS NULL OR jsonb_typeof(last_health) = 'object'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS website_custom_deployments_release_idx
  ON public.website_custom_deployments (site_id, provider_key, release_id);
CREATE UNIQUE INDEX IF NOT EXISTS website_custom_deployments_site_active_idx
  ON public.website_custom_deployments (site_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS website_custom_deployments_tenant_status_idx
  ON public.website_custom_deployments (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.website_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL,
  parent_id uuid,
  locale varchar(20) NOT NULL DEFAULT 'nl-NL',
  title varchar(180) NOT NULL,
  navigation_label varchar(180),
  slug varchar(180) NOT NULL,
  path varchar(500) NOT NULL,
  page_type varchar(30) NOT NULL DEFAULT 'standard',
  status varchar(20) NOT NULL DEFAULT 'draft',
  is_homepage boolean NOT NULL DEFAULT false,
  seo jsonb NOT NULL,
  authoring_revision integer NOT NULL DEFAULT 1,
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_pages_tenant_site_id_unique UNIQUE (tenant_id, site_id, id),
  CONSTRAINT website_pages_tenant_site_fk
    FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.website_sites(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_pages_parent_fk
    FOREIGN KEY (tenant_id, site_id, parent_id)
    REFERENCES public.website_pages(tenant_id, site_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_pages_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT website_pages_type_check CHECK (
    page_type IN ('home', 'standard', 'service', 'contact', 'blog_index', 'custom', 'legal', 'area')
  ),
  CONSTRAINT website_pages_locale_check CHECK (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  CONSTRAINT website_pages_slug_check CHECK (slug = '' OR slug ~ '^[a-z0-9][a-z0-9-]*$'),
  CONSTRAINT website_pages_path_check CHECK (
    path ~ '^/(?:[a-z0-9_-]+(?:/[a-z0-9_-]+)*)?$'
    AND path !~ '^/(api|_next|health|preview|assets)(/|$)'
  ),
  CONSTRAINT website_pages_parent_check CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT website_pages_authoring_revision_check CHECK (authoring_revision > 0),
  CONSTRAINT website_pages_seo_check CHECK (jsonb_typeof(seo) = 'object'),
  CONSTRAINT website_pages_publish_check CHECK (status <> 'published' OR published_at IS NOT NULL),
  CONSTRAINT website_pages_archive_check CHECK (status <> 'archived' OR archived_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS website_pages_site_locale_path_idx
  ON public.website_pages (site_id, locale, path)
  WHERE status <> 'archived';
CREATE UNIQUE INDEX IF NOT EXISTS website_pages_site_locale_home_idx
  ON public.website_pages (site_id, locale)
  WHERE is_homepage = true AND status <> 'archived';
CREATE INDEX IF NOT EXISTS website_pages_tenant_site_status_idx
  ON public.website_pages (tenant_id, site_id, status);

CREATE TABLE IF NOT EXISTS public.website_page_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL,
  page_id uuid NOT NULL,
  section_key varchar(80) NOT NULL,
  schema_version integer NOT NULL,
  variant_key varchar(80) NOT NULL,
  position integer NOT NULL,
  content jsonb NOT NULL,
  is_visible boolean NOT NULL DEFAULT true,
  authoring_revision integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_page_sections_tenant_page_fk
    FOREIGN KEY (tenant_id, site_id, page_id)
    REFERENCES public.website_pages(tenant_id, site_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_page_sections_key_check CHECK (
    section_key IN (
      'hero', 'emergency_hero', 'trust_bar', 'services_grid', 'feature_grid',
      'process_steps', 'testimonials', 'faq', 'cta_banner', 'contact_form',
      'service_area', 'project_showcase', 'blog_preview', 'rich_text', 'stats',
      'team', 'logo_wall'
    )
  ),
  CONSTRAINT website_page_sections_schema_version_check CHECK (schema_version > 0),
  CONSTRAINT website_page_sections_position_check CHECK (position >= 0),
  CONSTRAINT website_page_sections_authoring_revision_check CHECK (authoring_revision > 0),
  CONSTRAINT website_page_sections_content_check CHECK (
    jsonb_typeof(content) = 'object'
    AND octet_length(content::text) <= 262144
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS website_page_sections_page_position_idx
  ON public.website_page_sections (page_id, position);
CREATE INDEX IF NOT EXISTS website_page_sections_tenant_page_idx
  ON public.website_page_sections (tenant_id, page_id);

CREATE TABLE IF NOT EXISTS public.website_navigation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL,
  parent_id uuid,
  page_id uuid,
  location varchar(30) NOT NULL,
  label varchar(180) NOT NULL,
  link_type varchar(20) NOT NULL,
  href varchar(2048),
  target varchar(20) NOT NULL DEFAULT 'self',
  position integer NOT NULL,
  is_visible boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_navigation_items_tenant_site_id_unique UNIQUE (tenant_id, site_id, id),
  CONSTRAINT website_navigation_items_tenant_site_fk
    FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.website_sites(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_navigation_items_parent_fk
    FOREIGN KEY (tenant_id, site_id, parent_id)
    REFERENCES public.website_navigation_items(tenant_id, site_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_navigation_items_page_fk
    FOREIGN KEY (tenant_id, site_id, page_id)
    REFERENCES public.website_pages(tenant_id, site_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_navigation_items_location_check CHECK (
    location IN ('header', 'footer_primary', 'footer_legal')
  ),
  CONSTRAINT website_navigation_items_type_check CHECK (link_type IN ('page', 'external', 'dropdown')),
  CONSTRAINT website_navigation_items_target_check CHECK (target IN ('self', 'blank')),
  CONSTRAINT website_navigation_items_position_check CHECK (position >= 0),
  CONSTRAINT website_navigation_items_parent_check CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT website_navigation_items_destination_check CHECK (
    (link_type = 'page' AND page_id IS NOT NULL AND href IS NULL)
    OR (link_type = 'external' AND page_id IS NULL AND href ~ '^https://')
    OR (link_type = 'dropdown' AND page_id IS NULL AND href IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS website_navigation_items_position_idx
  ON public.website_navigation_items (site_id, location, position);
CREATE INDEX IF NOT EXISTS website_navigation_items_tenant_site_idx
  ON public.website_navigation_items (tenant_id, site_id);

CREATE TABLE IF NOT EXISTS public.website_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL,
  sequence integer NOT NULL,
  schema_version integer NOT NULL,
  source_revision integer NOT NULL,
  snapshot jsonb NOT NULL,
  content_hash varchar(64) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'building',
  validation jsonb NOT NULL DEFAULT '{"errors":[],"warnings":[]}'::jsonb,
  created_by uuid NOT NULL,
  activated_by uuid,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_publications_tenant_site_id_unique UNIQUE (tenant_id, site_id, id),
  CONSTRAINT website_publications_tenant_site_fk
    FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.website_sites(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_publications_status_check CHECK (
    status IN ('building', 'ready', 'active', 'superseded', 'failed')
  ),
  CONSTRAINT website_publications_sequence_check CHECK (sequence > 0),
  CONSTRAINT website_publications_schema_version_check CHECK (schema_version > 0),
  CONSTRAINT website_publications_source_revision_check CHECK (source_revision > 0),
  CONSTRAINT website_publications_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT website_publications_json_check CHECK (
    jsonb_typeof(snapshot) = 'object'
    AND jsonb_typeof(validation) = 'object'
    AND octet_length(snapshot::text) <= 8388608
  ),
  CONSTRAINT website_publications_activation_check CHECK (
    (status = 'active' AND activated_at IS NOT NULL AND activated_by IS NOT NULL)
    OR status <> 'active'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS website_publications_site_sequence_idx
  ON public.website_publications (site_id, sequence);
CREATE UNIQUE INDEX IF NOT EXISTS website_publications_site_hash_idx
  ON public.website_publications (site_id, content_hash);
CREATE UNIQUE INDEX IF NOT EXISTS website_publications_site_active_idx
  ON public.website_publications (site_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS website_publications_tenant_status_idx
  ON public.website_publications (tenant_id, status);

ALTER TABLE public.website_sites
  ADD CONSTRAINT website_sites_active_publication_fk
  FOREIGN KEY (tenant_id, id, active_publication_id)
  REFERENCES public.website_publications(tenant_id, site_id, id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.website_sites
  ADD CONSTRAINT website_sites_active_custom_deployment_fk
  FOREIGN KEY (tenant_id, id, active_custom_deployment_id)
  REFERENCES public.website_custom_deployments(tenant_id, site_id, id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY IMMEDIATE;

CREATE TABLE IF NOT EXISTS public.website_delivery_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL,
  from_mode varchar(30) NOT NULL,
  from_target_id uuid,
  to_mode varchar(30) NOT NULL,
  to_target_id uuid NOT NULL,
  expected_revision integer NOT NULL,
  new_revision integer NOT NULL,
  reason text NOT NULL,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_delivery_activations_tenant_site_fk
    FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.website_sites(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_delivery_activations_from_mode_check CHECK (from_mode IN ('managed_cms', 'custom_nextjs')),
  CONSTRAINT website_delivery_activations_to_mode_check CHECK (to_mode IN ('managed_cms', 'custom_nextjs')),
  CONSTRAINT website_delivery_activations_revision_check CHECK (
    expected_revision > 0 AND new_revision = expected_revision + 1
  ),
  CONSTRAINT website_delivery_activations_reason_check CHECK (nullif(trim(reason), '') IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS website_delivery_activations_site_revision_idx
  ON public.website_delivery_activations (site_id, new_revision);
CREATE INDEX IF NOT EXISTS website_delivery_activations_tenant_site_idx
  ON public.website_delivery_activations (tenant_id, site_id, created_at);

CREATE OR REPLACE FUNCTION public.website_validate_domain_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  domain_row record;
BEGIN
  SELECT tenant_id, lower(trim(domain)) AS domain, type, verification_status, verified_at
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
    domain_row.verification_status <> 'verified'
    OR domain_row.verified_at IS NULL
  ) THEN
    RAISE EXCEPTION 'website domain must be verified before activation';
  END IF;
  IF NEW.status = 'active' THEN
    NEW.verified_at := domain_row.verified_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.website_validate_domain_binding() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_website_domain_bindings_validate
BEFORE INSERT OR UPDATE ON public.website_domain_bindings
FOR EACH ROW EXECUTE FUNCTION public.website_validate_domain_binding();

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
    SELECT status
    INTO target_row
    FROM public.website_publications
    WHERE id = NEW.active_publication_id
      AND tenant_id = NEW.tenant_id
      AND site_id = NEW.id;

    IF NOT FOUND OR target_row.status NOT IN ('ready', 'active') THEN
      RAISE EXCEPTION 'managed website publication is not ready';
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
REVOKE ALL ON FUNCTION public.website_assert_delivery_target() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_website_sites_assert_target
BEFORE INSERT OR UPDATE OF status, delivery_mode, active_publication_id, active_custom_deployment_id
ON public.website_sites
FOR EACH ROW EXECUTE FUNCTION public.website_assert_delivery_target();

CREATE OR REPLACE FUNCTION public.website_guard_delivery_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF (
    (TG_OP = 'INSERT' AND NEW.status = 'active')
    OR (
      TG_OP = 'UPDATE'
      AND (
        NEW.delivery_mode IS DISTINCT FROM OLD.delivery_mode
        OR NEW.delivery_revision IS DISTINCT FROM OLD.delivery_revision
        OR NEW.active_publication_id IS DISTINCT FROM OLD.active_publication_id
        OR NEW.active_custom_deployment_id IS DISTINCT FROM OLD.active_custom_deployment_id
        OR (NEW.status = 'active' AND OLD.status <> 'active')
      )
    )
  ) AND current_setting('fieldgrid.website_delivery_transition', true) IS DISTINCT FROM 'allowed' THEN
    RAISE EXCEPTION 'website delivery transitions must use activate_website_delivery';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.website_guard_delivery_transition() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_website_sites_guard_transition
BEFORE INSERT OR UPDATE ON public.website_sites
FOR EACH ROW EXECUTE FUNCTION public.website_guard_delivery_transition();

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

  INSERT INTO public.audit_log (tenant_id, user_id, action, resource, resource_id, metadata)
  VALUES (
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
REVOKE ALL ON FUNCTION public.activate_website_delivery(uuid, uuid, integer, varchar, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

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
    OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
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
REVOKE ALL ON FUNCTION public.website_guard_publication_immutability() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_website_publications_immutable
BEFORE UPDATE OR DELETE ON public.website_publications
FOR EACH ROW EXECUTE FUNCTION public.website_guard_publication_immutability();

CREATE OR REPLACE FUNCTION public.website_guard_custom_deployment_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.approved_at IS NOT NULL THEN
      RAISE EXCEPTION 'approved custom website deployments are immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.approved_at IS NOT NULL AND (
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.site_id IS DISTINCT FROM OLD.site_id
    OR NEW.provider_key IS DISTINCT FROM OLD.provider_key
    OR NEW.route_key IS DISTINCT FROM OLD.route_key
    OR NEW.release_id IS DISTINCT FROM OLD.release_id
    OR NEW.expected_host IS DISTINCT FROM OLD.expected_host
    OR NEW.health_path IS DISTINCT FROM OLD.health_path
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'approved custom website deployments are immutable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.website_sites site
    WHERE site.id = OLD.site_id
      AND site.tenant_id = OLD.tenant_id
      AND site.status = 'active'
      AND site.delivery_mode = 'custom_nextjs'
      AND site.active_custom_deployment_id = OLD.id
  ) AND NEW.status NOT IN ('ready', 'active') THEN
    RAISE EXCEPTION 'active custom Next.js deployment cannot be retired';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.website_guard_custom_deployment_immutability() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_website_custom_deployments_immutable
BEFORE UPDATE OR DELETE ON public.website_custom_deployments
FOR EACH ROW EXECUTE FUNCTION public.website_guard_custom_deployment_immutability();

CREATE OR REPLACE FUNCTION public.website_delivery_activations_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'website delivery activation history is append-only';
END;
$$;
REVOKE ALL ON FUNCTION public.website_delivery_activations_append_only() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_website_delivery_activations_append_only
BEFORE UPDATE OR DELETE ON public.website_delivery_activations
FOR EACH ROW EXECUTE FUNCTION public.website_delivery_activations_append_only();

ALTER TABLE public.website_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_domain_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_custom_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_page_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_navigation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_delivery_activations ENABLE ROW LEVEL SECURITY;

-- Authoring and activation are server-only in Phase 1A. No public or direct
-- authenticated table policy exists; future APIs must remain explicit boundaries.
REVOKE ALL ON TABLE
  public.website_sites,
  public.website_domain_bindings,
  public.website_custom_deployments,
  public.website_pages,
  public.website_page_sections,
  public.website_navigation_items,
  public.website_publications,
  public.website_delivery_activations
FROM anon, authenticated;
