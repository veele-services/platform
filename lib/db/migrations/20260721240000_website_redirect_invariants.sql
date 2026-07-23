-- Phase 4B: tenant-scoped managed redirects and cross-table route integrity.
-- Custom Next.js sites continue to own their live redirects in application code.

CREATE TABLE IF NOT EXISTS public.website_redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL,
  locale varchar(20) NOT NULL DEFAULT 'nl-NL',
  source_path varchar(500) NOT NULL,
  destination_type varchar(20) NOT NULL,
  destination varchar(2048) NOT NULL,
  status_code integer NOT NULL DEFAULT 308,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_redirects_tenant_site_id_unique
    UNIQUE (tenant_id, site_id, id),
  CONSTRAINT website_redirects_tenant_site_fk
    FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.website_sites(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_redirects_locale_check
    CHECK (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  CONSTRAINT website_redirects_source_path_check CHECK (
    source_path <> '/'
    AND source_path ~ '^/(?:[a-z0-9_-]+(?:/[a-z0-9_-]+)*)?$'
    AND source_path !~ '^/(api|_next|health|preview|assets)(/|$)'
  ),
  CONSTRAINT website_redirects_destination_type_check
    CHECK (destination_type IN ('path', 'external')),
  CONSTRAINT website_redirects_destination_check CHECK (
    (
      destination_type = 'path'
      AND destination ~ '^/(?:[a-z0-9_-]+(?:/[a-z0-9_-]+)*)?$'
      AND destination !~ '^/(api|_next|health|preview|assets)(/|$)'
    )
    OR (
      destination_type = 'external'
      AND destination ~ '^https://'
      AND destination !~ '^https://[^/]*@'
    )
  ),
  CONSTRAINT website_redirects_status_code_check
    CHECK (status_code IN (301, 302, 308)),
  CONSTRAINT website_redirects_self_check
    CHECK (destination_type <> 'path' OR destination <> source_path)
);

CREATE UNIQUE INDEX IF NOT EXISTS website_redirects_source_idx
  ON public.website_redirects (tenant_id, site_id, locale, source_path);
CREATE INDEX IF NOT EXISTS website_redirects_tenant_site_active_idx
  ON public.website_redirects (tenant_id, site_id, is_active);

CREATE OR REPLACE FUNCTION public.website_assert_route_integrity(
  p_tenant_id uuid,
  p_site_id uuid,
  p_locale varchar,
  p_path varchar
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.website_pages page
    JOIN public.website_redirects redirect
      ON redirect.tenant_id = page.tenant_id
     AND redirect.site_id = page.site_id
     AND redirect.locale = page.locale
     AND redirect.source_path = page.path
     AND redirect.is_active = true
    WHERE page.tenant_id = p_tenant_id
      AND page.site_id = p_site_id
      AND page.locale = p_locale
      AND page.path = p_path
      AND page.status <> 'archived'
  ) THEN
    RAISE EXCEPTION 'active page path collides with redirect source';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.website_redirects redirect
    WHERE redirect.tenant_id = p_tenant_id
      AND redirect.site_id = p_site_id
      AND redirect.locale = p_locale
      AND redirect.is_active = true
      AND redirect.destination_type = 'path'
      AND (
        redirect.destination = redirect.source_path
        OR EXISTS (
          SELECT 1
          FROM public.website_redirects target
          WHERE target.tenant_id = redirect.tenant_id
            AND target.site_id = redirect.site_id
            AND target.locale = redirect.locale
            AND target.source_path = redirect.destination
            AND target.is_active = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'redirect loops and chains are not allowed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.website_redirects redirect
    WHERE redirect.tenant_id = p_tenant_id
      AND redirect.site_id = p_site_id
      AND redirect.locale = p_locale
      AND redirect.is_active = true
      AND redirect.destination_type = 'path'
      AND NOT EXISTS (
        SELECT 1
        FROM public.website_pages page
        WHERE page.tenant_id = redirect.tenant_id
          AND page.site_id = redirect.site_id
          AND page.locale = redirect.locale
          AND page.path = redirect.destination
          AND page.status <> 'archived'
      )
  ) THEN
    RAISE EXCEPTION 'internal redirect destination must resolve to an active page';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.website_assert_route_integrity(uuid, uuid, varchar, varchar)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.website_guard_redirect_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.site_id IS DISTINCT FROM OLD.site_id
  ) THEN
    RAISE EXCEPTION 'website redirect ownership is immutable';
  END IF;

  IF NEW.destination_type = 'external' THEN
    IF NEW.destination !~ '^https://'
      OR NEW.destination ~ '^https://[^/]*@'
    THEN
      RAISE EXCEPTION 'external redirect must use HTTPS without credentials';
    END IF;
  END IF;

  PERFORM public.website_assert_route_integrity(
    NEW.tenant_id,
    NEW.site_id,
    NEW.locale,
    NEW.source_path
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.website_guard_redirect_integrity()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER trg_website_redirect_integrity
AFTER INSERT OR UPDATE ON public.website_redirects
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION public.website_guard_redirect_integrity();

CREATE OR REPLACE FUNCTION public.website_guard_page_route_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.website_assert_route_integrity(
      OLD.tenant_id,
      OLD.site_id,
      OLD.locale,
      OLD.path
    );
    RETURN OLD;
  END IF;

  PERFORM public.website_assert_route_integrity(
    NEW.tenant_id,
    NEW.site_id,
    NEW.locale,
    NEW.path
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.website_guard_page_route_integrity()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER trg_website_page_route_integrity
AFTER INSERT OR UPDATE OR DELETE ON public.website_pages
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION public.website_guard_page_route_integrity();

CREATE TRIGGER trg_website_redirects_touch_authoring
AFTER INSERT OR UPDATE OR DELETE ON public.website_redirects
FOR EACH ROW EXECUTE FUNCTION public.website_touch_child_authoring_revision();

ALTER TABLE public.website_redirects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.website_redirects FROM anon, authenticated;

COMMENT ON TABLE public.website_redirects IS
  'Managed-CMS authoring redirects; live delivery reads only immutable publication snapshots.';
COMMENT ON FUNCTION public.website_assert_route_integrity(uuid, uuid, varchar, varchar) IS
  'Rejects active page/redirect collisions, redirect chains and unresolved internal redirect destinations.';
