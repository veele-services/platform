-- Knowledgebase media privacy hardening.
-- Phase 7 requires article media to be loaded only after article visibility checks.

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    UPDATE storage.buckets
       SET public = false
     WHERE id = 'knowledgebase-media';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS knowledgebase_media_public_read ON storage.objects;
  END IF;
END $$;

UPDATE kb_article_media
   SET public_url = NULL
 WHERE public_url IS NOT NULL;
