-- ============================================================================
-- Phase 3 assignment media, news scope and storage proof foundation
--
-- Staging-safe migration:
-- - keeps existing staging media and storage objects intact;
-- - adds direct tenant_id to assignment media and backfills from assignments;
-- - uses triggers so existing upload flows still receive tenant_id from assignment_id;
-- - keeps legacy storage paths readable while preparing canonical tenant paths;
-- - makes news explicitly platform-only until tenant-scoped news is designed;
-- - updates assignment photo storage policies to accept legacy and canonical paths.
--
-- Do not move or delete storage objects here. Physical storage backfill remains
-- copy-first, verify-second, switch-third, cleanup-last.
-- ============================================================================

CREATE OR REPLACE FUNCTION pg_temp.fieldgrid_add_tenant_fk(table_name text, constraint_name text)
RETURNS void AS $$
BEGIN
  IF to_regclass('public.' || table_name) IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = fieldgrid_add_tenant_fk.table_name
      AND column_name = 'tenant_id'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    JOIN pg_attribute attribute_row
      ON attribute_row.attrelid = constraint_row.conrelid
     AND attribute_row.attnum = ANY(constraint_row.conkey)
    WHERE constraint_row.conrelid = to_regclass('public.' || table_name)
      AND constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'public.tenants'::regclass
      AND attribute_row.attname = 'tenant_id'
  ) THEN
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID',
    table_name,
    constraint_name
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.fieldgrid_add_required_check(table_name text, constraint_name text)
RETURNS void AS $$
BEGIN
  IF to_regclass('public.' || table_name) IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.' || table_name)
      AND conname = constraint_name
  ) THEN
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER TABLE %I ADD CONSTRAINT %I CHECK (tenant_id IS NOT NULL) NOT VALID',
    table_name,
    constraint_name
  );
END;
$$ LANGUAGE plpgsql;

ALTER TABLE IF EXISTS assignment_photos
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

ALTER TABLE IF EXISTS assignment_report_note_attachments
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

SELECT pg_temp.fieldgrid_add_tenant_fk('assignment_photos', 'assignment_photos_tenant_id_fkey');
SELECT pg_temp.fieldgrid_add_tenant_fk('assignment_report_note_attachments', 'assignment_report_note_attachments_tenant_id_fkey');

UPDATE assignment_photos photo
SET tenant_id = assignment.tenant_id
FROM assignments assignment
WHERE photo.tenant_id IS NULL
  AND photo.assignment_id = assignment.id;

UPDATE assignment_report_note_attachments attachment
SET tenant_id = assignment.tenant_id
FROM assignments assignment
WHERE attachment.tenant_id IS NULL
  AND attachment.assignment_id = assignment.id;

CREATE INDEX IF NOT EXISTS assignment_photos_tenant_idx
  ON assignment_photos (tenant_id);

CREATE INDEX IF NOT EXISTS assignment_photos_tenant_assignment_idx
  ON assignment_photos (tenant_id, assignment_id);

CREATE INDEX IF NOT EXISTS assignment_photos_storage_path_idx
  ON assignment_photos (storage_path);

CREATE INDEX IF NOT EXISTS assignment_report_note_attachments_tenant_idx
  ON assignment_report_note_attachments (tenant_id);

CREATE INDEX IF NOT EXISTS assignment_report_note_attachments_tenant_assignment_idx
  ON assignment_report_note_attachments (tenant_id, assignment_id);

CREATE INDEX IF NOT EXISTS assignment_report_note_attachments_storage_path_idx
  ON assignment_report_note_attachments (storage_path);

CREATE OR REPLACE FUNCTION public.fieldgrid_set_assignment_media_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  assignment_tenant_id uuid;
  note_assignment_id uuid;
BEGIN
  SELECT tenant_id INTO assignment_tenant_id
  FROM assignments
  WHERE id = NEW.assignment_id;

  IF assignment_tenant_id IS NULL THEN
    RAISE EXCEPTION 'assignment media requires an assignment with tenant_id'
      USING ERRCODE = '23503';
  END IF;

  IF TG_TABLE_NAME = 'assignment_report_note_attachments' THEN
    SELECT assignment_id INTO note_assignment_id
    FROM assignment_report_notes
    WHERE id = NEW.note_id;

    IF note_assignment_id IS NULL THEN
      RAISE EXCEPTION 'assignment report note attachment requires an existing note'
        USING ERRCODE = '23503';
    END IF;

    IF note_assignment_id <> NEW.assignment_id THEN
      RAISE EXCEPTION 'assignment report note attachment must use the same assignment as its note'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := assignment_tenant_id;
  ELSIF NEW.tenant_id <> assignment_tenant_id THEN
    RAISE EXCEPTION 'assignment media tenant_id must match assignment.tenant_id'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_photos_set_tenant_id ON assignment_photos;
CREATE TRIGGER trg_assignment_photos_set_tenant_id
  BEFORE INSERT OR UPDATE OF assignment_id, tenant_id
  ON assignment_photos
  FOR EACH ROW
  EXECUTE FUNCTION public.fieldgrid_set_assignment_media_tenant_id();

DROP TRIGGER IF EXISTS trg_assignment_report_note_attachments_set_tenant_id ON assignment_report_note_attachments;
CREATE TRIGGER trg_assignment_report_note_attachments_set_tenant_id
  BEFORE INSERT OR UPDATE OF assignment_id, note_id, tenant_id
  ON assignment_report_note_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.fieldgrid_set_assignment_media_tenant_id();

SELECT pg_temp.fieldgrid_add_required_check('assignment_photos', 'assignment_photos_tenant_id_required_check');
SELECT pg_temp.fieldgrid_add_required_check('assignment_report_note_attachments', 'assignment_report_note_attachments_tenant_id_required_check');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'assignment_photos'::regclass
      AND conname = 'assignment_photos_storage_path_tenant_context_check'
  ) THEN
    ALTER TABLE assignment_photos
      ADD CONSTRAINT assignment_photos_storage_path_tenant_context_check
      CHECK (
        tenant_id IS NULL
        OR storage_path LIKE 'tenant/' || tenant_id::text || '/assignments/' || assignment_id::text || '/%'
        OR storage_path LIKE assignment_id::text || '/%'
        OR storage_path LIKE 'assignments/' || assignment_id::text || '/%'
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'assignment_report_note_attachments'::regclass
      AND conname = 'assignment_report_note_attachments_storage_path_tenant_context_check'
  ) THEN
    ALTER TABLE assignment_report_note_attachments
      ADD CONSTRAINT assignment_report_note_attachments_storage_path_tenant_context_check
      CHECK (
        tenant_id IS NULL
        OR storage_path LIKE 'tenant/' || tenant_id::text || '/assignments/' || assignment_id::text || '/%'
        OR storage_path LIKE assignment_id::text || '/%'
        OR storage_path LIKE 'assignments/' || assignment_id::text || '/%'
      ) NOT VALID;
  END IF;
END;
$$;

COMMENT ON COLUMN assignment_photos.tenant_id IS
  'Direct tenant context for assignment media. Backfilled and maintained from assignments.tenant_id.';

COMMENT ON COLUMN assignment_report_note_attachments.tenant_id IS
  'Direct tenant context for report note attachments. Backfilled and maintained from assignments.tenant_id.';

ALTER TABLE IF EXISTS news_posts
  ADD COLUMN IF NOT EXISTS scope varchar(20) DEFAULT 'platform' NOT NULL;

ALTER TABLE IF EXISTS news_posts
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

SELECT pg_temp.fieldgrid_add_tenant_fk('news_posts', 'news_posts_tenant_id_fkey');

UPDATE news_posts
SET scope = 'platform'
WHERE scope IS DISTINCT FROM 'platform';

UPDATE news_posts
SET tenant_id = NULL
WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS news_posts_scope_idx
  ON news_posts (scope);

CREATE INDEX IF NOT EXISTS news_posts_tenant_idx
  ON news_posts (tenant_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'news_posts'::regclass
      AND conname = 'news_posts_platform_only_scope_check'
  ) THEN
    ALTER TABLE news_posts
      ADD CONSTRAINT news_posts_platform_only_scope_check
      CHECK (scope = 'platform' AND tenant_id IS NULL)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'news_post_targets'::regclass
      AND conname = 'news_post_targets_platform_only_check'
  ) THEN
    ALTER TABLE news_post_targets
      ADD CONSTRAINT news_post_targets_platform_only_check
      CHECK (target_type IN ('all_personnel', 'all_customers') AND target_id IS NULL)
      NOT VALID;
  END IF;
END;
$$;

COMMENT ON COLUMN news_posts.scope IS
  'Phase 3 decision: news is platform-only. Tenant-scoped news requires a later explicit model.';

COMMENT ON COLUMN news_posts.tenant_id IS
  'Reserved for a future tenant-scoped news model. Must remain NULL while scope is platform.';

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
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
          WHERE ap.assignment_id = CASE
              WHEN (storage.foldername(name))[1] = ''tenant''
                AND (storage.foldername(name))[2] ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
                AND (storage.foldername(name))[3] = ''assignments''
                AND (storage.foldername(name))[4] ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
                THEN (storage.foldername(name))[4]::uuid
              WHEN (storage.foldername(name))[1] ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
                THEN (storage.foldername(name))[1]::uuid
              ELSE NULL
            END
            AND ap.status = ''assigned''
            AND p.user_id = (SELECT auth.uid())
            AND p.is_active = true
            AND a.tenant_id = p.tenant_id
            AND (
              (storage.foldername(name))[1] <> ''tenant''
              OR (storage.foldername(name))[2]::uuid = a.tenant_id
            )
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
          WHERE ap.assignment_id = CASE
              WHEN (storage.foldername(name))[1] = ''tenant''
                AND (storage.foldername(name))[2] ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
                AND (storage.foldername(name))[3] = ''assignments''
                AND (storage.foldername(name))[4] ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
                THEN (storage.foldername(name))[4]::uuid
              WHEN (storage.foldername(name))[1] ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
                THEN (storage.foldername(name))[1]::uuid
              ELSE NULL
            END
            AND ap.status = ''assigned''
            AND p.user_id = (SELECT auth.uid())
            AND p.is_active = true
            AND a.tenant_id = p.tenant_id
            AND (
              (storage.foldername(name))[1] <> ''tenant''
              OR (storage.foldername(name))[2]::uuid = a.tenant_id
            )
        )
      )
    ';

    EXECUTE 'DROP POLICY IF EXISTS assignment_photos_assigned_personnel_update ON storage.objects';
    EXECUTE '
      CREATE POLICY assignment_photos_assigned_personnel_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = ''assignment-photos''
        AND EXISTS (
          SELECT 1
          FROM assignment_personnel ap
          JOIN assignments a ON a.id = ap.assignment_id
          JOIN personnel p ON p.id = ap.personnel_id
          WHERE ap.assignment_id = CASE
              WHEN (storage.foldername(name))[1] = ''tenant''
                AND (storage.foldername(name))[2] ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
                AND (storage.foldername(name))[3] = ''assignments''
                AND (storage.foldername(name))[4] ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
                THEN (storage.foldername(name))[4]::uuid
              WHEN (storage.foldername(name))[1] ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
                THEN (storage.foldername(name))[1]::uuid
              ELSE NULL
            END
            AND ap.status = ''assigned''
            AND p.user_id = (SELECT auth.uid())
            AND p.is_active = true
            AND a.tenant_id = p.tenant_id
            AND (
              (storage.foldername(name))[1] <> ''tenant''
              OR (storage.foldername(name))[2]::uuid = a.tenant_id
            )
        )
      )
      WITH CHECK (
        bucket_id = ''assignment-photos''
        AND EXISTS (
          SELECT 1
          FROM assignment_personnel ap
          JOIN assignments a ON a.id = ap.assignment_id
          JOIN personnel p ON p.id = ap.personnel_id
          WHERE ap.assignment_id = CASE
              WHEN (storage.foldername(name))[1] = ''tenant''
                AND (storage.foldername(name))[2] ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
                AND (storage.foldername(name))[3] = ''assignments''
                AND (storage.foldername(name))[4] ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
                THEN (storage.foldername(name))[4]::uuid
              WHEN (storage.foldername(name))[1] ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
                THEN (storage.foldername(name))[1]::uuid
              ELSE NULL
            END
            AND ap.status = ''assigned''
            AND p.user_id = (SELECT auth.uid())
            AND p.is_active = true
            AND a.tenant_id = p.tenant_id
            AND (
              (storage.foldername(name))[1] <> ''tenant''
              OR (storage.foldername(name))[2]::uuid = a.tenant_id
            )
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
          WHERE ap.assignment_id = CASE
              WHEN (storage.foldername(name))[1] = ''tenant''
                AND (storage.foldername(name))[2] ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
                AND (storage.foldername(name))[3] = ''assignments''
                AND (storage.foldername(name))[4] ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
                THEN (storage.foldername(name))[4]::uuid
              WHEN (storage.foldername(name))[1] ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
                THEN (storage.foldername(name))[1]::uuid
              ELSE NULL
            END
            AND ap.status = ''assigned''
            AND p.user_id = (SELECT auth.uid())
            AND p.is_active = true
            AND a.tenant_id = p.tenant_id
            AND (
              (storage.foldername(name))[1] <> ''tenant''
              OR (storage.foldername(name))[2]::uuid = a.tenant_id
            )
        )
      )
    ';
  END IF;
END $$;

DROP POLICY IF EXISTS assignment_photos_customer_approved_select ON assignment_photos;
CREATE POLICY assignment_photos_customer_approved_select
  ON assignment_photos
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND is_approved = true
    AND EXISTS (
      SELECT 1
      FROM assignments a
      WHERE a.id = assignment_photos.assignment_id
        AND a.tenant_id = assignment_photos.tenant_id
        AND public.customer_has_access(a.customer_id, a.tenant_id)
    )
  );

DROP POLICY IF EXISTS assignment_photos_personnel_assigned_select ON assignment_photos;
CREATE POLICY assignment_photos_personnel_assigned_select
  ON assignment_photos
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM assignments a
      WHERE a.id = assignment_photos.assignment_id
        AND a.tenant_id = assignment_photos.tenant_id
        AND public.personnel_assigned_to_assignment(a.id)
    )
  );

DROP POLICY IF EXISTS assignment_report_note_attachments_management_all ON assignment_report_note_attachments;
CREATE POLICY assignment_report_note_attachments_management_all
  ON assignment_report_note_attachments
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS assignment_report_note_attachments_personnel_assigned_select ON assignment_report_note_attachments;
CREATE POLICY assignment_report_note_attachments_personnel_assigned_select
  ON assignment_report_note_attachments
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM assignments a
      WHERE a.id = assignment_report_note_attachments.assignment_id
        AND a.tenant_id = assignment_report_note_attachments.tenant_id
        AND public.personnel_assigned_to_assignment(a.id)
    )
  );

DO $$
DECLARE
  row_result record;
BEGIN
  FOR row_result IN
    SELECT * FROM (
      SELECT 'assignment_photos_unresolved_tenant_id' AS check_name, count(*)::integer AS result_count
      FROM assignment_photos
      WHERE tenant_id IS NULL
      UNION ALL
      SELECT 'assignment_report_note_attachments_unresolved_tenant_id', count(*)::integer
      FROM assignment_report_note_attachments
      WHERE tenant_id IS NULL
      UNION ALL
      SELECT 'assignment_photos_legacy_storage_paths', count(*)::integer
      FROM assignment_photos
      WHERE tenant_id IS NOT NULL
        AND storage_path NOT LIKE 'tenant/' || tenant_id::text || '/assignments/' || assignment_id::text || '/%'
      UNION ALL
      SELECT 'assignment_report_note_attachments_legacy_storage_paths', count(*)::integer
      FROM assignment_report_note_attachments
      WHERE tenant_id IS NOT NULL
        AND storage_path NOT LIKE 'tenant/' || tenant_id::text || '/assignments/' || assignment_id::text || '/%'
      UNION ALL
      SELECT 'news_platform_only_invalid_targets', count(*)::integer
      FROM news_post_targets
      WHERE target_type NOT IN ('all_personnel', 'all_customers')
         OR target_id IS NOT NULL
    ) results
  LOOP
    IF row_result.result_count > 0 THEN
      RAISE NOTICE 'phase3 media/news/storage: % = %', row_result.check_name, row_result.result_count;
    END IF;
  END LOOP;
END;
$$;
