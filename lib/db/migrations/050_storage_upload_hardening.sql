-- TAAK-23: Storage policies and upload-surface hardening.
-- This migration removes legacy broad document policies and makes the intended
-- server-side upload/download model explicit. Customer/personnel portals receive
-- signed URLs only after application-level ownership checks.

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documents_authenticated_read" ON documents;
DROP POLICY IF EXISTS "documents_authenticated_insert" ON documents;
DROP POLICY IF EXISTS "documents_delete" ON documents;
DROP POLICY IF EXISTS documents_management_all ON documents;
DROP POLICY IF EXISTS documents_customer_own_select ON documents;
DROP POLICY IF EXISTS documents_personnel_own_select ON documents;

CREATE POLICY documents_management_all
  ON documents
  FOR ALL
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

CREATE POLICY documents_customer_own_select
  ON documents
  FOR SELECT
  TO authenticated
  USING (
    entity_type = 'customer'
    AND EXISTS (
      SELECT 1
      FROM customer_users cu
      WHERE cu.customer_id = documents.entity_id
        AND cu.user_id = (SELECT auth.uid())
        AND cu.status = 'active'
    )
  );

CREATE POLICY documents_personnel_own_select
  ON documents
  FOR SELECT
  TO authenticated
  USING (
    entity_type = 'personnel'
    AND EXISTS (
      SELECT 1
      FROM personnel p
      WHERE p.id = documents.entity_id
        AND p.user_id = (SELECT auth.uid())
        AND p.is_active = true
    )
  );

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES
      (
        'documents',
        'documents',
        false,
        52428800,
        ARRAY[
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp'
        ]::text[]
      ),
      (
        'assignment-photos',
        'assignment-photos',
        false,
        26214400,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']::text[]
      ),
      (
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
    EXECUTE 'DROP POLICY IF EXISTS authenticated_upload ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS owner_select ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS owner_delete ON storage.objects';

    EXECUTE 'DROP POLICY IF EXISTS documents_management_all ON storage.objects';
    EXECUTE '
      CREATE POLICY documents_management_all ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id = ''documents'' AND is_management())
      WITH CHECK (bucket_id = ''documents'' AND is_management())
    ';

    EXECUTE 'DROP POLICY IF EXISTS assignment_photos_management_all ON storage.objects';
    EXECUTE '
      CREATE POLICY assignment_photos_management_all ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id = ''assignment-photos'' AND is_management())
      WITH CHECK (bucket_id = ''assignment-photos'' AND is_management())
    ';

    EXECUTE 'DROP POLICY IF EXISTS assignment_photos_assigned_personnel ON storage.objects';
    EXECUTE '
      CREATE POLICY assignment_photos_assigned_personnel ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = ''assignment-photos''
        AND EXISTS (
          SELECT 1
          FROM assignment_personnel ap
          JOIN assignments a ON a.id = ap.assignment_id
          JOIN personnel p ON p.id = ap.personnel_id
          WHERE ap.assignment_id::text = (storage.foldername(name))[1]
            AND ap.status = ''assigned''
            AND p.user_id = (SELECT auth.uid())
            AND p.is_active = true
            AND a.tenant_id = p.tenant_id
        )
      )
    ';

    EXECUTE 'DROP POLICY IF EXISTS assignment_photos_assigned_personnel_insert ON storage.objects';
    EXECUTE '
      CREATE POLICY assignment_photos_assigned_personnel_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = ''assignment-photos''
        AND EXISTS (
          SELECT 1
          FROM assignment_personnel ap
          JOIN assignments a ON a.id = ap.assignment_id
          JOIN personnel p ON p.id = ap.personnel_id
          WHERE ap.assignment_id::text = (storage.foldername(name))[1]
            AND ap.status = ''assigned''
            AND p.user_id = (SELECT auth.uid())
            AND p.is_active = true
            AND a.tenant_id = p.tenant_id
        )
      )
    ';

    EXECUTE 'DROP POLICY IF EXISTS assignment_photos_assigned_personnel_delete ON storage.objects';
    EXECUTE '
      CREATE POLICY assignment_photos_assigned_personnel_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = ''assignment-photos''
        AND EXISTS (
          SELECT 1
          FROM assignment_personnel ap
          JOIN assignments a ON a.id = ap.assignment_id
          JOIN personnel p ON p.id = ap.personnel_id
          WHERE ap.assignment_id::text = (storage.foldername(name))[1]
            AND ap.status = ''assigned''
            AND p.user_id = (SELECT auth.uid())
            AND p.is_active = true
            AND a.tenant_id = p.tenant_id
        )
      )
    ';

    EXECUTE 'DROP POLICY IF EXISTS personnel_avatars_public_read ON storage.objects';
    EXECUTE '
      CREATE POLICY personnel_avatars_public_read ON storage.objects
      FOR SELECT TO anon, authenticated
      USING (bucket_id = ''personnel-avatars'')
    ';
  END IF;
END $$;
