-- Knowledgebase, roadmap and release direct API hardening.
--
-- Runtime reads for these surfaces are intentionally mediated by server-side
-- helpers so tenant, audience, module and permission checks stay centralized.
-- This migration makes the direct Supabase Data API posture explicit: anon and
-- authenticated roles get no table privileges for these content tables.
-- service_role/postgres/database-owner access is not changed here; privileged
-- access remains server-only through route handlers, server actions and
-- DATABASE_URL/service-role infrastructure. The existing management-only RLS
-- policies remain as defense-in-depth if direct grants are deliberately
-- reintroduced in a future migration.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'kb_categories',
    'kb_articles',
    'kb_article_audiences',
    'kb_article_modules',
    'kb_article_permissions',
    'kb_article_media',
    'kb_article_related',
    'kb_article_versions',
    'kb_article_feedback',
    'kb_search_terms',
    'kb_search_events',
    'kb_tooltips',
    'kb_tooltip_audiences',
    'kb_tooltip_related_articles',
    'roadmap_items',
    'roadmap_item_audiences',
    'roadmap_item_modules',
    'roadmap_item_tenant_links',
    'roadmap_item_comments',
    'roadmap_item_votes',
    'roadmap_item_status_history',
    'roadmap_item_ticket_links',
    'release_categories',
    'releases',
    'release_items',
    'release_audiences',
    'release_modules',
    'release_media',
    'release_highlights',
    'release_dismissals',
    'release_roadmap_links',
    'release_ticket_links'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated', table_name);
      EXECUTE format(
        'COMMENT ON TABLE public.%I IS %L',
        table_name,
        'Fieldgrid KB/roadmap/release content table. Direct anon/authenticated Data API privileges are revoked; runtime access is mediated by server-side visibility helpers.'
      );
    END IF;
  END LOOP;
END $$;
