-- Phase 4A: hard navigation hierarchy and deterministic ordering invariants.
-- Authoring remains server-only and every mutation advances one site revision.

DROP INDEX IF EXISTS public.website_navigation_items_position_idx;

ALTER TABLE public.website_navigation_items
  DROP CONSTRAINT IF EXISTS website_navigation_items_position_unique;
ALTER TABLE public.website_navigation_items
  ADD CONSTRAINT website_navigation_items_position_unique
  UNIQUE (tenant_id, site_id, location, position)
  DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE public.website_navigation_items
  DROP CONSTRAINT IF EXISTS website_navigation_items_position_check;
ALTER TABLE public.website_navigation_items
  ADD CONSTRAINT website_navigation_items_position_check
  CHECK (position >= 0 AND position < 500);

ALTER TABLE public.website_navigation_items
  ADD CONSTRAINT website_navigation_items_label_check
  CHECK (label = btrim(label) AND char_length(label) > 0);

ALTER TABLE public.website_navigation_items
  ADD CONSTRAINT website_navigation_items_internal_target_check
  CHECK (link_type = 'external' OR target = 'self');

ALTER TABLE public.website_navigation_items
  ADD CONSTRAINT website_navigation_items_child_type_check
  CHECK (parent_id IS NULL OR link_type <> 'dropdown');

CREATE OR REPLACE FUNCTION public.website_guard_navigation_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  parent_location varchar(30);
  parent_parent_id uuid;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT parent.location, parent.parent_id
    INTO parent_location, parent_parent_id
    FROM public.website_navigation_items parent
    WHERE parent.tenant_id = NEW.tenant_id
      AND parent.site_id = NEW.site_id
      AND parent.id = NEW.parent_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'navigation parent must belong to the same tenant and site';
    END IF;
    IF parent_location IS DISTINCT FROM NEW.location THEN
      RAISE EXCEPTION 'navigation parent must use the same location';
    END IF;
    IF parent_parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'navigation hierarchy exceeds two levels';
    END IF;
  END IF;

  IF NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.website_navigation_items child
    WHERE child.tenant_id = NEW.tenant_id
      AND child.site_id = NEW.site_id
      AND child.parent_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'navigation hierarchy exceeds two levels';
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.location IS DISTINCT FROM OLD.location
    AND EXISTS (
      SELECT 1
      FROM public.website_navigation_items child
      WHERE child.tenant_id = OLD.tenant_id
        AND child.site_id = OLD.site_id
        AND child.parent_id = OLD.id
    )
  THEN
    RAISE EXCEPTION 'navigation parent location cannot change while it has children';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.website_guard_navigation_hierarchy()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_website_navigation_hierarchy
  ON public.website_navigation_items;
CREATE TRIGGER trg_website_navigation_hierarchy
BEFORE INSERT OR UPDATE ON public.website_navigation_items
FOR EACH ROW EXECUTE FUNCTION public.website_guard_navigation_hierarchy();

COMMENT ON FUNCTION public.website_guard_navigation_hierarchy() IS
  'Rejects cross-location parents, cycles and navigation deeper than one submenu level.';
