-- Personnel self-service profile fields and avatar storage.
-- Updates are handled by server actions scoped to the authenticated user's
-- personnel row, so this migration does not broaden the personnel RLS surface.

ALTER TABLE personnel
  ADD COLUMN IF NOT EXISTS address_street varchar(200),
  ADD COLUMN IF NOT EXISTS address_postal_code varchar(20),
  ADD COLUMN IF NOT EXISTS address_city varchar(120),
  ADD COLUMN IF NOT EXISTS address_country varchar(80) DEFAULT 'Nederland' NOT NULL,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS notification_email_enabled boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS notification_push_enabled boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS notification_planning_enabled boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS notification_news_enabled boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS notification_hours_enabled boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS profile_updated_at timestamp with time zone;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'personnel-avatars',
      'personnel-avatars',
      true,
      3145728,
      ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
    )
    ON CONFLICT (id) DO UPDATE
      SET public = excluded.public,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  END IF;

  IF to_regclass('storage.objects') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'personnel_avatars_public_read'
    ) THEN
      EXECUTE 'CREATE POLICY personnel_avatars_public_read ON storage.objects
        FOR SELECT TO anon, authenticated
        USING (bucket_id = ''personnel-avatars'')';
    END IF;
  END IF;
END $$;
