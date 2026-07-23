-- Phase 7: controlled SEO and integration settings. The public runtime only
-- consumes validated values compiled into an immutable website publication.

ALTER TABLE public.website_sites
  ADD COLUMN IF NOT EXISTS seo_settings jsonb NOT NULL DEFAULT
    '{
      "schemaVersion": 1,
      "structuredData": {
        "enabled": true,
        "organizationType": "organization"
      },
      "webmasterVerification": {
        "google": null,
        "bing": null
      }
    }'::jsonb;

ALTER TABLE public.website_sites
  DROP CONSTRAINT IF EXISTS website_sites_seo_settings_check;

ALTER TABLE public.website_sites
  ADD CONSTRAINT website_sites_seo_settings_check
  CHECK (
    jsonb_typeof(seo_settings) = 'object'
    AND octet_length(seo_settings::text) <= 8192
  );

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
    NEW.analytics,
    NEW.seo_settings
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
    OLD.analytics,
    OLD.seo_settings
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
