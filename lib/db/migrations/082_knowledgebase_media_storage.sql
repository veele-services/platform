-- Knowledgebase media storage.
-- Adds a dedicated bucket for article screenshots, videos and attachments.

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'knowledgebase-media',
      'knowledgebase-media',
      true,
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
      SET public = EXCLUDED.public,
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
        AND policyname = 'knowledgebase_media_public_read'
    ) THEN
      EXECUTE 'CREATE POLICY knowledgebase_media_public_read
        ON storage.objects
        FOR SELECT
        TO anon, authenticated
        USING (bucket_id = ''knowledgebase-media'')';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'knowledgebase_media_management_write'
    ) THEN
      EXECUTE 'CREATE POLICY knowledgebase_media_management_write
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (bucket_id = ''knowledgebase-media'' AND is_management())';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'knowledgebase_media_management_update'
    ) THEN
      EXECUTE 'CREATE POLICY knowledgebase_media_management_update
        ON storage.objects
        FOR UPDATE
        TO authenticated
        USING (bucket_id = ''knowledgebase-media'' AND is_management())
        WITH CHECK (bucket_id = ''knowledgebase-media'' AND is_management())';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'knowledgebase_media_management_delete'
    ) THEN
      EXECUTE 'CREATE POLICY knowledgebase_media_management_delete
        ON storage.objects
        FOR DELETE
        TO authenticated
        USING (bucket_id = ''knowledgebase-media'' AND is_management())';
    END IF;
  END IF;
END $$;
