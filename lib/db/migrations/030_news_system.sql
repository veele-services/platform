-- ============================================================================
-- Tenant news system: posts, targeting, hero images and RBAC permissions.
-- Idempotent for staging/production deploys.
-- ============================================================================

CREATE TABLE IF NOT EXISTS news_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  slug varchar(180) NOT NULL,
  title varchar(180) NOT NULL,
  excerpt text,
  content_html text NOT NULL,
  content_json jsonb,
  hero_image_url text,
  hero_image_path text,
  status varchar(20) DEFAULT 'draft' NOT NULL,
  publish_at timestamp with time zone,
  published_at timestamp with time zone,
  created_by uuid NOT NULL,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT news_posts_status_check CHECK (status IN ('draft', 'scheduled', 'published', 'archived'))
);

CREATE TABLE IF NOT EXISTS news_post_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  post_id uuid NOT NULL REFERENCES news_posts(id) ON DELETE CASCADE,
  target_type varchar(30) NOT NULL,
  target_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT news_post_targets_type_check CHECK (
    target_type IN ('all_personnel', 'all_customers', 'sector', 'personnel', 'customer', 'customer_type')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS news_posts_slug_idx ON news_posts(slug);
CREATE INDEX IF NOT EXISTS news_posts_status_publish_idx ON news_posts(status, publish_at);
CREATE INDEX IF NOT EXISTS news_posts_created_at_idx ON news_posts(created_at);
CREATE INDEX IF NOT EXISTS news_post_targets_post_id_idx ON news_post_targets(post_id);
CREATE INDEX IF NOT EXISTS news_post_targets_lookup_idx ON news_post_targets(target_type, target_id);
CREATE UNIQUE INDEX IF NOT EXISTS news_post_targets_unique_target_idx
  ON news_post_targets(post_id, target_type, target_id)
  WHERE target_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS news_post_targets_unique_global_idx
  ON news_post_targets(post_id, target_type)
  WHERE target_id IS NULL;

ALTER TABLE news_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_post_targets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'news_posts' AND policyname = 'news_posts_management'
  ) THEN
    CREATE POLICY news_posts_management ON news_posts
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'news_post_targets' AND policyname = 'news_post_targets_management'
  ) THEN
    CREATE POLICY news_post_targets_management ON news_post_targets
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;
END $$;

-- Public hero images. Upload/delete remains management-only via storage policy.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'news-hero',
      'news-hero',
      true,
      5242880,
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
    )
    ON CONFLICT (id) DO UPDATE
      SET public = excluded.public,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  END IF;

  IF to_regclass('storage.objects') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'news_hero_public_read'
    ) THEN
      EXECUTE 'CREATE POLICY news_hero_public_read ON storage.objects
        FOR SELECT TO anon, authenticated
        USING (bucket_id = ''news-hero'')';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'news_hero_insert_management'
    ) THEN
      EXECUTE 'CREATE POLICY news_hero_insert_management ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (bucket_id = ''news-hero'' AND is_management())';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'news_hero_update_management'
    ) THEN
      EXECUTE 'CREATE POLICY news_hero_update_management ON storage.objects
        FOR UPDATE TO authenticated
        USING (bucket_id = ''news-hero'' AND is_management())
        WITH CHECK (bucket_id = ''news-hero'' AND is_management())';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'news_hero_delete_management'
    ) THEN
      EXECUTE 'CREATE POLICY news_hero_delete_management ON storage.objects
        FOR DELETE TO authenticated
        USING (bucket_id = ''news-hero'' AND is_management())';
    END IF;
  END IF;
END $$;

-- RBAC permissions for the backoffice module.
INSERT INTO permissions (resource, action, description)
VALUES
  ('news', 'read',   'Nieuwsberichten bekijken'),
  ('news', 'write',  'Nieuwsberichten aanmaken en bewerken'),
  ('news', 'send',   'Nieuwsberichten publiceren naar doelgroepen'),
  ('news', 'delete', 'Nieuwsberichten archiveren of verwijderen')
ON CONFLICT (resource, action) DO UPDATE
  SET description = excluded.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.resource = 'news'
WHERE r.name = 'Management'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.resource = 'news' AND p.action IN ('read', 'write', 'send')
WHERE r.name IN ('Administration', 'Planning')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.resource = 'news' AND p.action = 'read'
WHERE r.name = 'Support'
ON CONFLICT DO NOTHING;
