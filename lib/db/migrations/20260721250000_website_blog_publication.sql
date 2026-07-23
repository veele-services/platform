-- Phase 5: tenant-scoped blog authoring and immutable publication inputs.
-- Scheduling is deliberately unsupported: published_at is assigned only by an
-- explicit publish mutation and may never point into the future.

CREATE TABLE IF NOT EXISTS public.website_blog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL,
  locale varchar(20) NOT NULL DEFAULT 'nl-NL',
  name varchar(120) NOT NULL,
  slug varchar(180) NOT NULL,
  path varchar(500) NOT NULL,
  description varchar(500),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_blog_categories_tenant_site_id_unique
    UNIQUE (tenant_id, site_id, id),
  CONSTRAINT website_blog_categories_tenant_site_fk
    FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.website_sites(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_blog_categories_locale_check
    CHECK (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  CONSTRAINT website_blog_categories_name_check
    CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT website_blog_categories_slug_check
    CHECK (
      slug ~ '^[a-z0-9][a-z0-9-]*$'
      AND slug NOT IN ('categorie', 'tag')
    ),
  CONSTRAINT website_blog_categories_path_check
    CHECK (path = '/blog/categorie/' || slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS website_blog_categories_route_idx
  ON public.website_blog_categories (tenant_id, site_id, locale, path)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS website_blog_categories_tenant_site_idx
  ON public.website_blog_categories (tenant_id, site_id, is_active);

CREATE TABLE IF NOT EXISTS public.website_blog_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL,
  locale varchar(20) NOT NULL DEFAULT 'nl-NL',
  name varchar(80) NOT NULL,
  slug varchar(180) NOT NULL,
  path varchar(500) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_blog_tags_tenant_site_id_unique
    UNIQUE (tenant_id, site_id, id),
  CONSTRAINT website_blog_tags_tenant_site_fk
    FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.website_sites(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_blog_tags_locale_check
    CHECK (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  CONSTRAINT website_blog_tags_name_check
    CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT website_blog_tags_slug_check
    CHECK (
      slug ~ '^[a-z0-9][a-z0-9-]*$'
      AND slug NOT IN ('categorie', 'tag')
    ),
  CONSTRAINT website_blog_tags_path_check
    CHECK (path = '/blog/tag/' || slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS website_blog_tags_route_idx
  ON public.website_blog_tags (tenant_id, site_id, locale, path)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS website_blog_tags_tenant_site_idx
  ON public.website_blog_tags (tenant_id, site_id, is_active);

CREATE TABLE IF NOT EXISTS public.website_blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL,
  locale varchar(20) NOT NULL DEFAULT 'nl-NL',
  title varchar(180) NOT NULL,
  slug varchar(180) NOT NULL,
  path varchar(500) NOT NULL,
  excerpt varchar(500) NOT NULL,
  body jsonb NOT NULL,
  category_id uuid,
  seo jsonb NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'draft',
  authoring_revision integer NOT NULL DEFAULT 1,
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_blog_posts_tenant_site_id_unique
    UNIQUE (tenant_id, site_id, id),
  CONSTRAINT website_blog_posts_tenant_site_fk
    FOREIGN KEY (tenant_id, site_id)
    REFERENCES public.website_sites(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_blog_posts_category_fk
    FOREIGN KEY (tenant_id, site_id, category_id)
    REFERENCES public.website_blog_categories(tenant_id, site_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT website_blog_posts_locale_check
    CHECK (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  CONSTRAINT website_blog_posts_title_check
    CHECK (title = btrim(title) AND char_length(title) BETWEEN 1 AND 180),
  CONSTRAINT website_blog_posts_excerpt_check
    CHECK (excerpt = btrim(excerpt) AND char_length(excerpt) BETWEEN 1 AND 500),
  CONSTRAINT website_blog_posts_slug_check
    CHECK (
      slug ~ '^[a-z0-9][a-z0-9-]*$'
      AND slug NOT IN ('categorie', 'tag')
    ),
  CONSTRAINT website_blog_posts_path_check
    CHECK (path = '/blog/' || slug),
  CONSTRAINT website_blog_posts_status_check
    CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT website_blog_posts_authoring_revision_check
    CHECK (authoring_revision > 0),
  CONSTRAINT website_blog_posts_body_object_check
    CHECK (jsonb_typeof(body) = 'object'),
  CONSTRAINT website_blog_posts_seo_object_check
    CHECK (jsonb_typeof(seo) = 'object'),
  CONSTRAINT website_blog_posts_publication_state_check
    CHECK (
      (status = 'published' AND published_at IS NOT NULL AND archived_at IS NULL)
      OR (status = 'draft' AND published_at IS NULL AND archived_at IS NULL)
      OR (status = 'archived' AND published_at IS NULL AND archived_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS website_blog_posts_route_idx
  ON public.website_blog_posts (tenant_id, site_id, locale, path)
  WHERE status <> 'archived';
CREATE INDEX IF NOT EXISTS website_blog_posts_tenant_site_status_idx
  ON public.website_blog_posts (tenant_id, site_id, status);

CREATE TABLE IF NOT EXISTS public.website_blog_post_tags (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  site_id uuid NOT NULL,
  post_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_blog_post_tags_identity_unique
    UNIQUE (tenant_id, site_id, post_id, tag_id),
  CONSTRAINT website_blog_post_tags_post_fk
    FOREIGN KEY (tenant_id, site_id, post_id)
    REFERENCES public.website_blog_posts(tenant_id, site_id, id)
    ON DELETE CASCADE,
  CONSTRAINT website_blog_post_tags_tag_fk
    FOREIGN KEY (tenant_id, site_id, tag_id)
    REFERENCES public.website_blog_tags(tenant_id, site_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS website_blog_post_tags_tag_idx
  ON public.website_blog_post_tags (tenant_id, site_id, tag_id);

CREATE OR REPLACE FUNCTION public.website_guard_blog_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.site_id IS DISTINCT FROM OLD.site_id
  THEN
    RAISE EXCEPTION 'website blog ownership is immutable';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.website_guard_blog_ownership()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.website_guard_blog_post()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  referenced_locale varchar(20);
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.site_id IS DISTINCT FROM OLD.site_id
  ) THEN
    RAISE EXCEPTION 'website blog ownership is immutable';
  END IF;

  IF NEW.status = 'published' AND NEW.published_at > clock_timestamp() THEN
    RAISE EXCEPTION 'scheduled blog publication is not supported';
  END IF;
  IF NEW.category_id IS NOT NULL THEN
    SELECT category.locale
    INTO referenced_locale
    FROM public.website_blog_categories category
    WHERE category.tenant_id = NEW.tenant_id
      AND category.site_id = NEW.site_id
      AND category.id = NEW.category_id
      AND category.is_active = true;
    IF NOT FOUND OR referenced_locale IS DISTINCT FROM NEW.locale THEN
      RAISE EXCEPTION 'blog category must be active in the post locale';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.website_guard_blog_post()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.website_guard_blog_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.site_id IS DISTINCT FROM OLD.site_id
  THEN
    RAISE EXCEPTION 'website blog ownership is immutable';
  END IF;
  IF (
    NEW.is_active IS DISTINCT FROM true
    OR NEW.locale IS DISTINCT FROM OLD.locale
  ) AND EXISTS (
    SELECT 1
    FROM public.website_blog_posts post
    WHERE post.tenant_id = OLD.tenant_id
      AND post.site_id = OLD.site_id
      AND post.category_id = OLD.id
      AND post.status <> 'archived'
  )
  THEN
    RAISE EXCEPTION 'a used blog category cannot be deactivated or moved to another locale';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.website_guard_blog_category()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.website_guard_blog_tag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.site_id IS DISTINCT FROM OLD.site_id
  THEN
    RAISE EXCEPTION 'website blog ownership is immutable';
  END IF;
  IF (
    NEW.is_active IS DISTINCT FROM true
    OR NEW.locale IS DISTINCT FROM OLD.locale
  ) AND EXISTS (
    SELECT 1
    FROM public.website_blog_post_tags relation
    JOIN public.website_blog_posts post
      ON post.tenant_id = relation.tenant_id
     AND post.site_id = relation.site_id
     AND post.id = relation.post_id
    WHERE relation.tenant_id = OLD.tenant_id
      AND relation.site_id = OLD.site_id
      AND relation.tag_id = OLD.id
      AND post.status <> 'archived'
  )
  THEN
    RAISE EXCEPTION 'a used blog tag cannot be deactivated or moved to another locale';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.website_guard_blog_tag()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_website_blog_categories_guard
BEFORE UPDATE ON public.website_blog_categories
FOR EACH ROW EXECUTE FUNCTION public.website_guard_blog_category();
CREATE TRIGGER trg_website_blog_tags_guard
BEFORE UPDATE ON public.website_blog_tags
FOR EACH ROW EXECUTE FUNCTION public.website_guard_blog_tag();
CREATE TRIGGER trg_website_blog_posts_guard
BEFORE INSERT OR UPDATE ON public.website_blog_posts
FOR EACH ROW EXECUTE FUNCTION public.website_guard_blog_post();
CREATE TRIGGER trg_website_blog_post_tags_guard
BEFORE UPDATE ON public.website_blog_post_tags
FOR EACH ROW EXECUTE FUNCTION public.website_guard_blog_ownership();

CREATE OR REPLACE FUNCTION public.website_guard_blog_post_tag_locale()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  post_locale varchar(20);
  tag_locale varchar(20);
  tag_active boolean;
BEGIN
  SELECT post.locale
  INTO post_locale
  FROM public.website_blog_posts post
  WHERE post.tenant_id = NEW.tenant_id
    AND post.site_id = NEW.site_id
    AND post.id = NEW.post_id
    AND post.status <> 'archived';

  SELECT tag.locale, tag.is_active
  INTO tag_locale, tag_active
  FROM public.website_blog_tags tag
  WHERE tag.tenant_id = NEW.tenant_id
    AND tag.site_id = NEW.site_id
    AND tag.id = NEW.tag_id;

  IF post_locale IS NULL OR tag_locale IS NULL OR tag_active IS NOT TRUE
    OR post_locale IS DISTINCT FROM tag_locale
  THEN
    RAISE EXCEPTION 'blog tag must be active in the post locale';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.website_guard_blog_post_tag_locale()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER trg_website_blog_post_tag_locale
AFTER INSERT OR UPDATE ON public.website_blog_post_tags
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION public.website_guard_blog_post_tag_locale();

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
    FROM (
      SELECT page.locale, page.path
      FROM public.website_pages page
      WHERE page.tenant_id = p_tenant_id
        AND page.site_id = p_site_id
        AND page.status <> 'archived'
      UNION ALL
      SELECT redirect.locale, redirect.source_path
      FROM public.website_redirects redirect
      WHERE redirect.tenant_id = p_tenant_id
        AND redirect.site_id = p_site_id
        AND redirect.is_active = true
      UNION ALL
      SELECT category.locale, category.path
      FROM public.website_blog_categories category
      WHERE category.tenant_id = p_tenant_id
        AND category.site_id = p_site_id
        AND category.is_active = true
      UNION ALL
      SELECT tag.locale, tag.path
      FROM public.website_blog_tags tag
      WHERE tag.tenant_id = p_tenant_id
        AND tag.site_id = p_site_id
        AND tag.is_active = true
      UNION ALL
      SELECT post.locale, post.path
      FROM public.website_blog_posts post
      WHERE post.tenant_id = p_tenant_id
        AND post.site_id = p_site_id
        AND post.status <> 'archived'
    ) route
    GROUP BY route.locale, route.path
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'website page, redirect and blog routes must not collide';
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
        UNION ALL
        SELECT 1
        FROM public.website_blog_categories category
        WHERE category.tenant_id = redirect.tenant_id
          AND category.site_id = redirect.site_id
          AND category.locale = redirect.locale
          AND category.path = redirect.destination
          AND category.is_active = true
        UNION ALL
        SELECT 1
        FROM public.website_blog_tags tag
        WHERE tag.tenant_id = redirect.tenant_id
          AND tag.site_id = redirect.site_id
          AND tag.locale = redirect.locale
          AND tag.path = redirect.destination
          AND tag.is_active = true
        UNION ALL
        SELECT 1
        FROM public.website_blog_posts post
        WHERE post.tenant_id = redirect.tenant_id
          AND post.site_id = redirect.site_id
          AND post.locale = redirect.locale
          AND post.path = redirect.destination
          AND post.status <> 'archived'
      )
  ) THEN
    RAISE EXCEPTION 'internal redirect destination must resolve to active website content';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.website_assert_route_integrity(uuid, uuid, varchar, varchar)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.website_guard_blog_route_integrity()
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
REVOKE ALL ON FUNCTION public.website_guard_blog_route_integrity()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER trg_website_blog_categories_route_integrity
AFTER INSERT OR UPDATE OR DELETE ON public.website_blog_categories
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION public.website_guard_blog_route_integrity();
CREATE CONSTRAINT TRIGGER trg_website_blog_tags_route_integrity
AFTER INSERT OR UPDATE OR DELETE ON public.website_blog_tags
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION public.website_guard_blog_route_integrity();
CREATE CONSTRAINT TRIGGER trg_website_blog_posts_route_integrity
AFTER INSERT OR UPDATE OR DELETE ON public.website_blog_posts
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION public.website_guard_blog_route_integrity();

CREATE TRIGGER trg_website_blog_categories_touch_authoring
AFTER INSERT OR UPDATE OR DELETE ON public.website_blog_categories
FOR EACH ROW EXECUTE FUNCTION public.website_touch_child_authoring_revision();
CREATE TRIGGER trg_website_blog_tags_touch_authoring
AFTER INSERT OR UPDATE OR DELETE ON public.website_blog_tags
FOR EACH ROW EXECUTE FUNCTION public.website_touch_child_authoring_revision();
CREATE TRIGGER trg_website_blog_posts_touch_authoring
AFTER INSERT OR UPDATE OR DELETE ON public.website_blog_posts
FOR EACH ROW EXECUTE FUNCTION public.website_touch_child_authoring_revision();
CREATE TRIGGER trg_website_blog_post_tags_touch_authoring
AFTER INSERT OR UPDATE OR DELETE ON public.website_blog_post_tags
FOR EACH ROW EXECUTE FUNCTION public.website_touch_child_authoring_revision();

ALTER TABLE public.website_blog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_blog_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_blog_post_tags ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.website_blog_categories FROM anon, authenticated;
REVOKE ALL ON TABLE public.website_blog_tags FROM anon, authenticated;
REVOKE ALL ON TABLE public.website_blog_posts FROM anon, authenticated;
REVOKE ALL ON TABLE public.website_blog_post_tags FROM anon, authenticated;

COMMENT ON TABLE public.website_blog_posts IS
  'Managed-CMS blog authoring; public delivery reads only immutable website publication snapshots.';
COMMENT ON FUNCTION public.website_assert_route_integrity(uuid, uuid, varchar, varchar) IS
  'Rejects route collisions across pages, redirects and blog content, redirect chains and unresolved destinations.';
