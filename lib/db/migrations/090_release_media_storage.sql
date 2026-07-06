-- Release media storage.
-- Private screenshots, videos and attachments for audience-scoped release notes.

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'release-media',
      'release-media',
      false,
      52428800,
      ARRAY[
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'video/mp4',
        'video/webm',
        'application/pdf'
      ]
    )
    ON CONFLICT (id) DO UPDATE
      SET public = false,
          file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'release_media_management_write'
    ) THEN
      EXECUTE 'CREATE POLICY release_media_management_write
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (bucket_id = ''release-media'' AND is_management())';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'release_media_management_update'
    ) THEN
      EXECUTE 'CREATE POLICY release_media_management_update
        ON storage.objects
        FOR UPDATE
        TO authenticated
        USING (bucket_id = ''release-media'' AND is_management())
        WITH CHECK (bucket_id = ''release-media'' AND is_management())';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'release_media_management_delete'
    ) THEN
      EXECUTE 'CREATE POLICY release_media_management_delete
        ON storage.objects
        FOR DELETE
        TO authenticated
        USING (bucket_id = ''release-media'' AND is_management())';
    END IF;
  END IF;
END $$;

UPDATE release_media
   SET public_url = NULL
 WHERE public_url IS NOT NULL;
