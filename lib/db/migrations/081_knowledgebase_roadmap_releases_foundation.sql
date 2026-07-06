-- ============================================================================
-- Knowledgebase, roadmap and release management foundation
--
-- Phase 1:
-- - Adds module catalog entries for knowledgebase, roadmap and releases.
-- - Adds canonical permissions and propagates template grants to tenant roles.
-- - Creates tenant-aware/global content tables for KB, tooltips, roadmap and
--   releases.
-- - Enables RLS with management-only base policies. Runtime visibility for
--   tenant/personnel/customer reads is intentionally handled by server-side
--   helpers in later phases so module/audience/permission gates stay central.
-- - Seeds global KB and release categories.
--
-- Staging-safe: idempotent, no existing data is deleted or reset.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Modules and entitlements
-- ---------------------------------------------------------------------------

INSERT INTO modules (key, name, description, category, is_system, is_enabled_by_default)
VALUES
  ('knowledgebase', 'Knowledgebase', 'Handleidingen, helpartikelen, tooltips en zoekbare productuitleg.', 'support', true, true),
  ('roadmap', 'Roadmap', 'Roadmapbord en tenant featurewensen.', 'support', true, true),
  ('releases', 'Releasebeheer', 'Versienotes, release highlights en doelgroepgerichte updates.', 'support', true, true)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    is_system = true,
    is_enabled_by_default = true,
    updated_at = now();

INSERT INTO plan_modules (plan_id, module_id, is_included)
SELECT plans.id, modules.id, true
FROM plans
JOIN modules ON modules.key IN ('knowledgebase', 'roadmap', 'releases')
ON CONFLICT (plan_id, module_id) DO UPDATE
SET is_included = true,
    updated_at = now();

INSERT INTO tenant_modules (tenant_id, module_id, is_enabled, source, enabled_at, disabled_at)
SELECT tenants.id,
       modules.id,
       true,
       'system',
       now(),
       NULL::timestamptz
FROM tenants
JOIN modules ON modules.key IN ('knowledgebase', 'roadmap', 'releases')
ON CONFLICT (tenant_id, module_id) DO UPDATE
SET is_enabled = true,
    source = CASE
      WHEN tenant_modules.is_enabled = true THEN tenant_modules.source
      ELSE 'system'
    END,
    enabled_at = COALESCE(tenant_modules.enabled_at, now()),
    disabled_at = NULL,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

INSERT INTO permissions (resource, action, description)
VALUES
  ('kb', 'view', 'Knowledgebase-artikelen bekijken.'),
  ('kb', 'manage', 'Knowledgebase volledig beheren.'),
  ('kb', 'create', 'Knowledgebase-artikelen aanmaken.'),
  ('kb', 'update', 'Knowledgebase-artikelen wijzigen.'),
  ('kb', 'publish', 'Knowledgebase-artikelen publiceren.'),
  ('kb', 'archive', 'Knowledgebase-artikelen archiveren.'),
  ('kb', 'manage_categories', 'Knowledgebase-categorieen beheren.'),
  ('kb', 'manage_media', 'Knowledgebase-media beheren.'),
  ('kb', 'preview_audience', 'Knowledgebase previewen als doelgroep.'),
  ('kb', 'manage_tooltips', 'Help-tooltips beheren.'),
  ('help_tooltips', 'view', 'Help-tooltips bekijken.'),
  ('help_tooltips', 'manage', 'Help-tooltips beheren.'),
  ('roadmap', 'view', 'Roadmap bekijken.'),
  ('roadmap', 'manage', 'Roadmap volledig beheren.'),
  ('roadmap', 'create', 'Roadmapitems aanmaken.'),
  ('roadmap', 'update', 'Roadmapitems wijzigen.'),
  ('roadmap', 'submit_request', 'Featurewensen indienen.'),
  ('roadmap', 'change_status', 'Roadmapstatus wijzigen.'),
  ('roadmap', 'comment', 'Reageren op roadmapitems.'),
  ('roadmap', 'vote', 'Stemmen of support geven op roadmapitems.'),
  ('roadmap', 'link_release', 'Roadmapitems aan releases koppelen.'),
  ('releases', 'view', 'Release notes bekijken.'),
  ('releases', 'manage', 'Releasebeheer volledig beheren.'),
  ('releases', 'create', 'Releases aanmaken.'),
  ('releases', 'update', 'Releases wijzigen.'),
  ('releases', 'publish', 'Releases publiceren.'),
  ('releases', 'archive', 'Releases archiveren.'),
  ('releases', 'highlight', 'Release highlights beheren.'),
  ('releases', 'dismiss_highlight', 'Release highlights wegklikken.'),
  ('releases', 'preview_audience', 'Releases previewen als doelgroep.')
ON CONFLICT (resource, action) DO UPDATE
SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.resource IN ('kb', 'help_tooltips', 'roadmap', 'releases')
WHERE roles.name = 'Management'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON (
  (permissions.resource = 'kb' AND permissions.action IN ('view'))
  OR (permissions.resource = 'roadmap' AND permissions.action IN ('view', 'submit_request', 'comment', 'vote'))
  OR (permissions.resource = 'releases' AND permissions.action IN ('view', 'dismiss_highlight'))
)
WHERE roles.name IN ('Administration', 'Planning')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON (
  (permissions.resource = 'kb' AND permissions.action = 'view')
  OR (permissions.resource = 'releases' AND permissions.action IN ('view', 'dismiss_highlight'))
)
WHERE roles.name IN ('Teamlead', 'Employee', 'Flex Employee', 'Customer')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON (
  (permissions.resource = 'kb' AND permissions.action IN ('view'))
  OR (permissions.resource = 'roadmap' AND permissions.action IN ('view', 'comment'))
  OR (permissions.resource = 'releases' AND permissions.action = 'view')
)
WHERE roles.name = 'Support'
ON CONFLICT DO NOTHING;

INSERT INTO tenant_role_permissions (tenant_role_id, permission_id, created_at)
SELECT tenant_roles.id, role_permissions.permission_id, now()
FROM tenant_roles
JOIN role_permissions ON role_permissions.role_id = tenant_roles.template_role_id
WHERE tenant_roles.template_role_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Knowledgebase and tooltip tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kb_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  scope varchar(30) NOT NULL DEFAULT 'platform_global',
  parent_id uuid REFERENCES kb_categories(id) ON DELETE SET NULL,
  name varchar(160) NOT NULL,
  slug varchar(180) NOT NULL,
  description text,
  module_key varchar(80) REFERENCES modules(key) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  language varchar(12) NOT NULL DEFAULT 'nl',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT kb_categories_scope_check CHECK (scope IN ('platform_global', 'tenant')),
  CONSTRAINT kb_categories_scope_tenant_check CHECK (
    (scope = 'platform_global' AND tenant_id IS NULL)
    OR (scope = 'tenant' AND tenant_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS kb_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  scope varchar(30) NOT NULL DEFAULT 'platform_global',
  category_id uuid REFERENCES kb_categories(id) ON DELETE SET NULL,
  title varchar(220) NOT NULL,
  slug varchar(220) NOT NULL,
  summary text,
  content_json jsonb,
  content_html text,
  content_text text,
  keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  smart_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'draft',
  featured boolean NOT NULL DEFAULT false,
  language varchar(12) NOT NULL DEFAULT 'nl',
  sort_order integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT kb_articles_scope_check CHECK (scope IN ('platform_global', 'tenant')),
  CONSTRAINT kb_articles_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT kb_articles_keywords_check CHECK (jsonb_typeof(keywords) = 'array'),
  CONSTRAINT kb_articles_smart_terms_check CHECK (jsonb_typeof(smart_terms) = 'array'),
  CONSTRAINT kb_articles_scope_tenant_check CHECK (
    (scope = 'platform_global' AND tenant_id IS NULL)
    OR (scope = 'tenant' AND tenant_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS kb_article_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  audience_key varchar(40) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kb_article_audiences_key_check CHECK (
    audience_key IN (
      'platform_admin',
      'tenant_admin',
      'tenant_management',
      'tenant_planning',
      'tenant_administration',
      'tenant_personnel',
      'tenant_customer',
      'support'
    )
  )
);

CREATE TABLE IF NOT EXISTS kb_article_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  module_key varchar(80) NOT NULL REFERENCES modules(key) ON DELETE CASCADE,
  is_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kb_article_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  permission_key varchar(220) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kb_article_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  scope varchar(30) NOT NULL DEFAULT 'platform_global',
  media_type varchar(30) NOT NULL,
  storage_path text NOT NULL,
  public_url text,
  mime_type varchar(160),
  size_bytes integer,
  alt_text text,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kb_article_media_scope_check CHECK (scope IN ('platform_global', 'tenant')),
  CONSTRAINT kb_article_media_type_check CHECK (media_type IN ('image', 'video', 'attachment')),
  CONSTRAINT kb_article_media_size_check CHECK (size_bytes IS NULL OR size_bytes >= 0),
  CONSTRAINT kb_article_media_scope_tenant_check CHECK (
    (scope = 'platform_global' AND tenant_id IS NULL)
    OR (scope = 'tenant' AND tenant_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS kb_article_related (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  related_article_id uuid NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  relation_type varchar(40) NOT NULL DEFAULT 'manual',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kb_article_related_no_self_check CHECK (article_id <> related_article_id)
);

CREATE TABLE IF NOT EXISTS kb_article_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  title varchar(220) NOT NULL,
  summary text,
  content_json jsonb,
  content_html text,
  content_text text,
  change_note text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kb_article_versions_version_check CHECK (version_no > 0)
);

CREATE TABLE IF NOT EXISTS kb_article_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid,
  personnel_id uuid,
  customer_id uuid,
  audience_key varchar(40) NOT NULL,
  is_helpful boolean NOT NULL,
  comment text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kb_article_feedback_audience_check CHECK (
    audience_key IN (
      'platform_admin',
      'tenant_admin',
      'tenant_management',
      'tenant_planning',
      'tenant_administration',
      'tenant_personnel',
      'tenant_customer',
      'support'
    )
  )
);

CREATE TABLE IF NOT EXISTS kb_search_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  term varchar(220) NOT NULL,
  weight integer NOT NULL DEFAULT 1,
  language varchar(12) NOT NULL DEFAULT 'nl',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kb_search_terms_weight_check CHECK (weight > 0)
);

CREATE TABLE IF NOT EXISTS kb_search_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  audience_key varchar(40) NOT NULL,
  query text NOT NULL,
  result_count integer NOT NULL DEFAULT 0,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kb_search_events_result_count_check CHECK (result_count >= 0)
);

CREATE TABLE IF NOT EXISTS kb_tooltips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stable_key varchar(180) NOT NULL,
  title varchar(180) NOT NULL,
  description text NOT NULL,
  article_id uuid REFERENCES kb_articles(id) ON DELETE SET NULL,
  module_key varchar(80) REFERENCES modules(key) ON DELETE SET NULL,
  permission_key varchar(220),
  status varchar(20) NOT NULL DEFAULT 'draft',
  placement varchar(40) NOT NULL DEFAULT 'top',
  icon_variant varchar(40) NOT NULL DEFAULT 'circle_help',
  open_in_drawer boolean NOT NULL DEFAULT false,
  show_related_articles boolean NOT NULL DEFAULT true,
  metadata jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kb_tooltips_status_check CHECK (status IN ('draft', 'published', 'archived'))
);

CREATE TABLE IF NOT EXISTS kb_tooltip_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tooltip_id uuid NOT NULL REFERENCES kb_tooltips(id) ON DELETE CASCADE,
  audience_key varchar(40) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kb_tooltip_audiences_key_check CHECK (
    audience_key IN (
      'platform_admin',
      'tenant_admin',
      'tenant_management',
      'tenant_planning',
      'tenant_administration',
      'tenant_personnel',
      'tenant_customer',
      'support'
    )
  )
);

CREATE TABLE IF NOT EXISTS kb_tooltip_related_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tooltip_id uuid NOT NULL REFERENCES kb_tooltips(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Roadmap tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS roadmap_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  scope varchar(20) NOT NULL DEFAULT 'tenant',
  title varchar(220) NOT NULL,
  slug varchar(220) NOT NULL,
  description text NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'new',
  priority varchar(20) NOT NULL DEFAULT 'normal',
  category_id uuid,
  submitted_by uuid,
  planned_version varchar(80),
  expected_delivery timestamptz,
  public_visible boolean NOT NULL DEFAULT false,
  featured boolean NOT NULL DEFAULT false,
  internal_note text,
  converted_from_item_id uuid REFERENCES roadmap_items(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT roadmap_items_scope_check CHECK (scope IN ('global', 'tenant')),
  CONSTRAINT roadmap_items_status_check CHECK (status IN ('new', 'considering', 'in_development', 'done', 'archived')),
  CONSTRAINT roadmap_items_priority_check CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  CONSTRAINT roadmap_items_metadata_check CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT roadmap_items_scope_tenant_check CHECK (
    (scope = 'global')
    OR (scope = 'tenant' AND tenant_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS roadmap_item_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_item_id uuid NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
  audience_key varchar(40) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roadmap_item_audiences_key_check CHECK (
    audience_key IN (
      'platform_admin',
      'tenant_admin',
      'tenant_management',
      'tenant_planning',
      'tenant_administration',
      'tenant_personnel',
      'tenant_customer',
      'support'
    )
  )
);

CREATE TABLE IF NOT EXISTS roadmap_item_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_item_id uuid NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
  module_key varchar(80) NOT NULL REFERENCES modules(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roadmap_item_tenant_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_item_id uuid NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  relation_type varchar(40) NOT NULL DEFAULT 'interested',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roadmap_item_tenant_links_type_check CHECK (
    relation_type IN ('requested_by', 'interested', 'blocked_by', 'related')
  )
);

CREATE TABLE IF NOT EXISTS roadmap_item_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_item_id uuid NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  author_user_id uuid,
  body text NOT NULL,
  visibility varchar(40) NOT NULL DEFAULT 'tenant_visible',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roadmap_item_comments_visibility_check CHECK (visibility IN ('platform_internal', 'tenant_visible')),
  CONSTRAINT roadmap_item_comments_metadata_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS roadmap_item_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_item_id uuid NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  weight integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roadmap_item_votes_weight_check CHECK (weight > 0)
);

CREATE TABLE IF NOT EXISTS roadmap_item_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_item_id uuid NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
  from_status varchar(30),
  to_status varchar(30) NOT NULL,
  changed_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roadmap_item_status_history_from_check CHECK (
    from_status IS NULL OR from_status IN ('new', 'considering', 'in_development', 'done', 'archived')
  ),
  CONSTRAINT roadmap_item_status_history_to_check CHECK (
    to_status IN ('new', 'considering', 'in_development', 'done', 'archived')
  )
);

CREATE TABLE IF NOT EXISTS roadmap_item_ticket_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_item_id uuid NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  ticket_type varchar(40) NOT NULL,
  ticket_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Release tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS release_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  slug varchar(180) NOT NULL,
  module_key varchar(80) REFERENCES modules(key) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version varchar(80) NOT NULL,
  title varchar(220) NOT NULL,
  slug varchar(220) NOT NULL,
  summary text,
  content_json jsonb,
  content_html text,
  content_text text,
  status varchar(20) NOT NULL DEFAULT 'draft',
  impact_level varchar(20) NOT NULL DEFAULT 'medium',
  featured boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT releases_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT releases_impact_check CHECK (impact_level IN ('low', 'medium', 'high', 'critical'))
);

CREATE TABLE IF NOT EXISTS release_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  category_id uuid REFERENCES release_categories(id) ON DELETE SET NULL,
  title varchar(220) NOT NULL,
  description text NOT NULL,
  module_key varchar(80) REFERENCES modules(key) ON DELETE SET NULL,
  impact_level varchar(20) NOT NULL DEFAULT 'medium',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT release_items_impact_check CHECK (impact_level IN ('low', 'medium', 'high', 'critical'))
);

CREATE TABLE IF NOT EXISTS release_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  audience_key varchar(40) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT release_audiences_key_check CHECK (
    audience_key IN (
      'platform_admin',
      'tenant_admin',
      'tenant_management',
      'tenant_planning',
      'tenant_administration',
      'tenant_personnel',
      'tenant_customer',
      'support'
    )
  )
);

CREATE TABLE IF NOT EXISTS release_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  module_key varchar(80) NOT NULL REFERENCES modules(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS release_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  media_type varchar(30) NOT NULL,
  storage_path text NOT NULL,
  public_url text,
  mime_type varchar(160),
  size_bytes integer,
  alt_text text,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT release_media_type_check CHECK (media_type IN ('image', 'video', 'attachment')),
  CONSTRAINT release_media_size_check CHECK (size_bytes IS NULL OR size_bytes >= 0)
);

CREATE TABLE IF NOT EXISTS release_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  surface varchar(40) NOT NULL,
  audience_key varchar(40) NOT NULL,
  module_key varchar(80) REFERENCES modules(key) ON DELETE SET NULL,
  title varchar(180) NOT NULL,
  message text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT release_highlights_surface_check CHECK (
    surface IN ('platform_backoffice', 'tenant_backoffice', 'personnel_pwa', 'customer_pwa')
  ),
  CONSTRAINT release_highlights_audience_check CHECK (
    audience_key IN (
      'platform_admin',
      'tenant_admin',
      'tenant_management',
      'tenant_planning',
      'tenant_administration',
      'tenant_personnel',
      'tenant_customer',
      'support'
    )
  ),
  CONSTRAINT release_highlights_window_check CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS release_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  highlight_id uuid NOT NULL REFERENCES release_highlights(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid,
  personnel_id uuid,
  customer_id uuid,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT release_dismissals_identity_check CHECK (
    user_id IS NOT NULL OR personnel_id IS NOT NULL OR customer_id IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS release_roadmap_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  roadmap_item_id uuid NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS release_ticket_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  ticket_type varchar(40) NOT NULL,
  ticket_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS kb_categories_scope_idx ON kb_categories(scope);
CREATE INDEX IF NOT EXISTS kb_categories_tenant_idx ON kb_categories(tenant_id);
CREATE INDEX IF NOT EXISTS kb_categories_parent_idx ON kb_categories(parent_id);
CREATE INDEX IF NOT EXISTS kb_categories_module_idx ON kb_categories(module_key);
CREATE INDEX IF NOT EXISTS kb_categories_active_idx ON kb_categories(scope, is_active, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS kb_categories_scope_tenant_slug_language_idx
  ON kb_categories(scope, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), slug, language);

CREATE INDEX IF NOT EXISTS kb_articles_scope_status_idx ON kb_articles(scope, status, published_at);
CREATE INDEX IF NOT EXISTS kb_articles_tenant_idx ON kb_articles(tenant_id);
CREATE INDEX IF NOT EXISTS kb_articles_category_idx ON kb_articles(category_id);
CREATE INDEX IF NOT EXISTS kb_articles_slug_idx ON kb_articles(slug);
CREATE INDEX IF NOT EXISTS kb_articles_featured_idx ON kb_articles(featured, status);
CREATE INDEX IF NOT EXISTS kb_articles_updated_idx ON kb_articles(updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS kb_articles_scope_tenant_slug_language_idx
  ON kb_articles(scope, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), slug, language);
CREATE INDEX IF NOT EXISTS kb_articles_search_idx
  ON kb_articles USING gin (
    to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(content_text, ''))
  );

CREATE UNIQUE INDEX IF NOT EXISTS kb_article_audiences_unique_idx ON kb_article_audiences(article_id, audience_key);
CREATE INDEX IF NOT EXISTS kb_article_audiences_audience_idx ON kb_article_audiences(audience_key);
CREATE UNIQUE INDEX IF NOT EXISTS kb_article_modules_unique_idx ON kb_article_modules(article_id, module_key);
CREATE INDEX IF NOT EXISTS kb_article_modules_module_idx ON kb_article_modules(module_key);
CREATE UNIQUE INDEX IF NOT EXISTS kb_article_permissions_unique_idx ON kb_article_permissions(article_id, permission_key);
CREATE INDEX IF NOT EXISTS kb_article_permissions_permission_idx ON kb_article_permissions(permission_key);
CREATE INDEX IF NOT EXISTS kb_article_media_article_idx ON kb_article_media(article_id, sort_order);
CREATE INDEX IF NOT EXISTS kb_article_media_tenant_idx ON kb_article_media(tenant_id);
CREATE INDEX IF NOT EXISTS kb_article_media_scope_idx ON kb_article_media(scope);
CREATE UNIQUE INDEX IF NOT EXISTS kb_article_related_unique_idx ON kb_article_related(article_id, related_article_id);
CREATE INDEX IF NOT EXISTS kb_article_related_article_idx ON kb_article_related(article_id, sort_order);
CREATE INDEX IF NOT EXISTS kb_article_related_related_idx ON kb_article_related(related_article_id);
CREATE UNIQUE INDEX IF NOT EXISTS kb_article_versions_article_version_idx ON kb_article_versions(article_id, version_no);
CREATE INDEX IF NOT EXISTS kb_article_versions_article_created_idx ON kb_article_versions(article_id, created_at);
CREATE INDEX IF NOT EXISTS kb_article_feedback_article_idx ON kb_article_feedback(article_id, created_at);
CREATE INDEX IF NOT EXISTS kb_article_feedback_tenant_idx ON kb_article_feedback(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS kb_article_feedback_user_idx ON kb_article_feedback(user_id);
CREATE INDEX IF NOT EXISTS kb_article_feedback_personnel_idx ON kb_article_feedback(personnel_id);
CREATE INDEX IF NOT EXISTS kb_article_feedback_customer_idx ON kb_article_feedback(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS kb_search_terms_article_term_language_idx ON kb_search_terms(article_id, term, language);
CREATE INDEX IF NOT EXISTS kb_search_terms_term_idx ON kb_search_terms(term);
CREATE INDEX IF NOT EXISTS kb_search_events_tenant_created_idx ON kb_search_events(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS kb_search_events_audience_created_idx ON kb_search_events(audience_key, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS kb_tooltips_stable_key_idx ON kb_tooltips(stable_key);
CREATE INDEX IF NOT EXISTS kb_tooltips_article_idx ON kb_tooltips(article_id);
CREATE INDEX IF NOT EXISTS kb_tooltips_module_idx ON kb_tooltips(module_key);
CREATE INDEX IF NOT EXISTS kb_tooltips_status_idx ON kb_tooltips(status);
CREATE UNIQUE INDEX IF NOT EXISTS kb_tooltip_audiences_unique_idx ON kb_tooltip_audiences(tooltip_id, audience_key);
CREATE INDEX IF NOT EXISTS kb_tooltip_audiences_audience_idx ON kb_tooltip_audiences(audience_key);
CREATE UNIQUE INDEX IF NOT EXISTS kb_tooltip_related_articles_unique_idx ON kb_tooltip_related_articles(tooltip_id, article_id);
CREATE INDEX IF NOT EXISTS kb_tooltip_related_articles_tooltip_idx ON kb_tooltip_related_articles(tooltip_id, sort_order);

CREATE INDEX IF NOT EXISTS roadmap_items_tenant_idx ON roadmap_items(tenant_id);
CREATE INDEX IF NOT EXISTS roadmap_items_scope_status_idx ON roadmap_items(scope, status, priority);
CREATE INDEX IF NOT EXISTS roadmap_items_public_idx ON roadmap_items(public_visible, status);
CREATE INDEX IF NOT EXISTS roadmap_items_featured_idx ON roadmap_items(featured, status);
CREATE INDEX IF NOT EXISTS roadmap_items_updated_idx ON roadmap_items(updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS roadmap_items_scope_tenant_slug_idx
  ON roadmap_items(scope, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);
CREATE UNIQUE INDEX IF NOT EXISTS roadmap_item_audiences_unique_idx ON roadmap_item_audiences(roadmap_item_id, audience_key);
CREATE INDEX IF NOT EXISTS roadmap_item_audiences_audience_idx ON roadmap_item_audiences(audience_key);
CREATE UNIQUE INDEX IF NOT EXISTS roadmap_item_modules_unique_idx ON roadmap_item_modules(roadmap_item_id, module_key);
CREATE INDEX IF NOT EXISTS roadmap_item_modules_module_idx ON roadmap_item_modules(module_key);
CREATE UNIQUE INDEX IF NOT EXISTS roadmap_item_tenant_links_unique_idx ON roadmap_item_tenant_links(roadmap_item_id, tenant_id, relation_type);
CREATE INDEX IF NOT EXISTS roadmap_item_tenant_links_tenant_idx ON roadmap_item_tenant_links(tenant_id);
CREATE INDEX IF NOT EXISTS roadmap_item_comments_item_created_idx ON roadmap_item_comments(roadmap_item_id, created_at);
CREATE INDEX IF NOT EXISTS roadmap_item_comments_tenant_idx ON roadmap_item_comments(tenant_id);
CREATE INDEX IF NOT EXISTS roadmap_item_comments_author_idx ON roadmap_item_comments(author_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS roadmap_item_votes_item_user_idx ON roadmap_item_votes(roadmap_item_id, user_id);
CREATE INDEX IF NOT EXISTS roadmap_item_votes_tenant_idx ON roadmap_item_votes(tenant_id);
CREATE INDEX IF NOT EXISTS roadmap_item_status_history_item_created_idx ON roadmap_item_status_history(roadmap_item_id, created_at);
CREATE INDEX IF NOT EXISTS roadmap_item_status_history_to_status_idx ON roadmap_item_status_history(to_status);
CREATE UNIQUE INDEX IF NOT EXISTS roadmap_item_ticket_links_unique_idx ON roadmap_item_ticket_links(roadmap_item_id, ticket_type, ticket_id);
CREATE INDEX IF NOT EXISTS roadmap_item_ticket_links_ticket_idx ON roadmap_item_ticket_links(ticket_type, ticket_id);
CREATE INDEX IF NOT EXISTS roadmap_item_ticket_links_tenant_idx ON roadmap_item_ticket_links(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS release_categories_slug_idx ON release_categories(slug);
CREATE INDEX IF NOT EXISTS release_categories_module_idx ON release_categories(module_key);
CREATE INDEX IF NOT EXISTS release_categories_active_idx ON release_categories(is_active, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS releases_version_idx ON releases(version);
CREATE UNIQUE INDEX IF NOT EXISTS releases_slug_idx ON releases(slug);
CREATE INDEX IF NOT EXISTS releases_status_published_idx ON releases(status, published_at);
CREATE INDEX IF NOT EXISTS releases_featured_idx ON releases(featured, status);
CREATE INDEX IF NOT EXISTS releases_impact_idx ON releases(impact_level);
CREATE INDEX IF NOT EXISTS releases_search_idx
  ON releases USING gin (
    to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(content_text, ''))
  );
CREATE INDEX IF NOT EXISTS release_items_release_idx ON release_items(release_id, sort_order);
CREATE INDEX IF NOT EXISTS release_items_module_idx ON release_items(module_key);
CREATE INDEX IF NOT EXISTS release_items_category_idx ON release_items(category_id);
CREATE UNIQUE INDEX IF NOT EXISTS release_audiences_unique_idx ON release_audiences(release_id, audience_key);
CREATE INDEX IF NOT EXISTS release_audiences_audience_idx ON release_audiences(audience_key);
CREATE UNIQUE INDEX IF NOT EXISTS release_modules_unique_idx ON release_modules(release_id, module_key);
CREATE INDEX IF NOT EXISTS release_modules_module_idx ON release_modules(module_key);
CREATE INDEX IF NOT EXISTS release_media_release_idx ON release_media(release_id, sort_order);
CREATE INDEX IF NOT EXISTS release_highlights_release_idx ON release_highlights(release_id);
CREATE INDEX IF NOT EXISTS release_highlights_surface_audience_idx ON release_highlights(surface, audience_key, is_active);
CREATE INDEX IF NOT EXISTS release_highlights_module_idx ON release_highlights(module_key);
CREATE INDEX IF NOT EXISTS release_highlights_window_idx ON release_highlights(starts_at, ends_at);
CREATE INDEX IF NOT EXISTS release_dismissals_highlight_idx ON release_dismissals(highlight_id);
CREATE INDEX IF NOT EXISTS release_dismissals_user_idx ON release_dismissals(user_id);
CREATE INDEX IF NOT EXISTS release_dismissals_personnel_idx ON release_dismissals(personnel_id);
CREATE INDEX IF NOT EXISTS release_dismissals_customer_idx ON release_dismissals(customer_id);
CREATE INDEX IF NOT EXISTS release_dismissals_tenant_idx ON release_dismissals(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS release_dismissals_highlight_user_idx
  ON release_dismissals(highlight_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS release_dismissals_highlight_personnel_idx
  ON release_dismissals(highlight_id, personnel_id) WHERE personnel_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS release_dismissals_highlight_customer_idx
  ON release_dismissals(highlight_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS release_roadmap_links_unique_idx ON release_roadmap_links(release_id, roadmap_item_id);
CREATE INDEX IF NOT EXISTS release_roadmap_links_roadmap_idx ON release_roadmap_links(roadmap_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS release_ticket_links_unique_idx ON release_ticket_links(release_id, ticket_type, ticket_id);
CREATE INDEX IF NOT EXISTS release_ticket_links_ticket_idx ON release_ticket_links(ticket_type, ticket_id);
CREATE INDEX IF NOT EXISTS release_ticket_links_tenant_idx ON release_ticket_links(tenant_id);

-- ---------------------------------------------------------------------------
-- Seed global category catalogs
-- ---------------------------------------------------------------------------

INSERT INTO kb_categories (scope, tenant_id, name, slug, description, module_key, sort_order, is_active, language)
VALUES
  ('platform_global', NULL, 'Platformbeheer', 'platformbeheer', 'Platformbeheer en globale Fieldgrid-inrichting.', 'knowledgebase', 10, true, 'nl'),
  ('platform_global', NULL, 'Tenantbeheer', 'tenantbeheer', 'Tenantbeheer, modules en domeinen.', 'knowledgebase', 20, true, 'nl'),
  ('platform_global', NULL, 'Dashboard', 'dashboard', 'Dashboardgebruik en widgets.', 'knowledgebase', 30, true, 'nl'),
  ('platform_global', NULL, 'Klanten', 'klanten', 'Klantenbeheer.', 'customers', 40, true, 'nl'),
  ('platform_global', NULL, 'Objecten', 'objecten', 'Objecten en locaties.', 'objects', 50, true, 'nl'),
  ('platform_global', NULL, 'Werkbonnen en opdrachten', 'werkbonnen-opdrachten', 'Opdrachten, werkbonnen en uitvoering.', 'assignments', 60, true, 'nl'),
  ('platform_global', NULL, 'Planning', 'planning', 'Planning en inzet.', 'planning', 70, true, 'nl'),
  ('platform_global', NULL, 'Personeel', 'personeel', 'Personeelsbeheer.', 'personnel', 80, true, 'nl'),
  ('platform_global', NULL, 'Personeelsportaal', 'personeelsportaal', 'Personnel portal en PWA.', 'personnel_portal', 90, true, 'nl'),
  ('platform_global', NULL, 'Klantenportaal', 'klantenportaal', 'Customer portal en PWA.', 'customer_portal', 100, true, 'nl'),
  ('platform_global', NULL, 'Rapportages', 'rapportages', 'Rapportages en controles.', 'reporting', 110, true, 'nl'),
  ('platform_global', NULL, 'Facturen', 'facturen', 'Facturatie en facturen.', 'finance', 120, true, 'nl'),
  ('platform_global', NULL, 'Betalingen', 'betalingen', 'Betalingen en betaalflows.', 'finance', 130, true, 'nl'),
  ('platform_global', NULL, 'Tickets', 'tickets', 'Supporttickets en conversaties.', 'notifications', 140, true, 'nl'),
  ('platform_global', NULL, 'Documenten', 'documenten', 'Documentbeheer.', 'documents', 150, true, 'nl'),
  ('platform_global', NULL, 'Materiaalbeheer', 'materiaalbeheer', 'Materialen en voorraad.', 'materials', 160, true, 'nl'),
  ('platform_global', NULL, 'Inventarisbeheer', 'inventarisbeheer', 'Inventaris, QR-codes en onderhoud.', 'inventory', 170, true, 'nl'),
  ('platform_global', NULL, 'Instellingen', 'instellingen', 'Organisatie- en systeeminstellingen.', 'knowledgebase', 180, true, 'nl'),
  ('platform_global', NULL, 'Rollen en permissies', 'rollen-permissies', 'Rollen, rechten en toegang.', 'knowledgebase', 190, true, 'nl'),
  ('platform_global', NULL, 'Releasebeheer', 'releasebeheer', 'Release notes en highlights.', 'releases', 200, true, 'nl'),
  ('platform_global', NULL, 'Roadmap', 'roadmap', 'Roadmap en featurewensen.', 'roadmap', 210, true, 'nl')
ON CONFLICT DO NOTHING;

INSERT INTO release_categories (name, slug, module_key, sort_order, is_active)
VALUES
  ('Platform', 'platform', 'releases', 10, true),
  ('Backoffice', 'backoffice', 'knowledgebase', 20, true),
  ('Tenantbeheer', 'tenantbeheer', 'knowledgebase', 30, true),
  ('Planning', 'planning', 'planning', 40, true),
  ('Werkbonnen', 'werkbonnen', 'assignments', 50, true),
  ('Klanten', 'klanten', 'customers', 60, true),
  ('Objecten', 'objecten', 'objects', 70, true),
  ('Personeel', 'personeel', 'personnel', 80, true),
  ('Personeelsapp', 'personeelsapp', 'personnel_portal', 90, true),
  ('Klantportaal', 'klantportaal', 'customer_portal', 100, true),
  ('Rapportages', 'rapportages', 'reporting', 110, true),
  ('Facturatie', 'facturatie', 'finance', 120, true),
  ('Betalingen', 'betalingen', 'finance', 130, true),
  ('Tickets', 'tickets', 'notifications', 140, true),
  ('Documenten', 'documenten', 'documents', 150, true),
  ('Security', 'security', 'releases', 160, true),
  ('Performance', 'performance', 'releases', 170, true),
  ('Bugfixes', 'bugfixes', 'releases', 180, true),
  ('UI/UX', 'ui-ux', 'releases', 190, true),
  ('Database', 'database', 'releases', 200, true),
  ('API', 'api', 'releases', 210, true),
  ('Integraties', 'integraties', 'releases', 220, true)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS base policies
-- ---------------------------------------------------------------------------

ALTER TABLE kb_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_article_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_article_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_article_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_article_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_article_related ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_article_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_article_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_search_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_search_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_tooltips ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_tooltip_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_tooltip_related_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roadmap_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE roadmap_item_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE roadmap_item_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE roadmap_item_tenant_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE roadmap_item_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE roadmap_item_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE roadmap_item_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE roadmap_item_ticket_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_roadmap_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_ticket_links ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
  policy_name text;
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
    policy_name := table_name || '_management';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I TO authenticated USING (is_management()) WITH CHECK (is_management())',
        policy_name,
        table_name
      );
    END IF;
  END LOOP;
END $$;
