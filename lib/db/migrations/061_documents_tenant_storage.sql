-- ============================================================================
-- Documents tenant scope and storage hardening wave 1
--
-- Staging-safe migration:
-- - adds documents.tenant_id without dropping or rewriting existing data;
-- - backfills tenant_id from strong parent entities and unambiguous memberships;
-- - keeps unresolved legacy rows nullable so staging can be inspected instead of reset;
-- - requires canonical tenant/{tenant_id}/... paths for new tenant-scoped rows while
--   leaving existing storage objects in place until the storage backfill is run.
-- ============================================================================

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'documents_tenant_id_fkey'
      AND conrelid = 'documents'::regclass
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END;
$$;

UPDATE documents document
SET tenant_id = assignment.tenant_id
FROM assignments assignment
WHERE document.tenant_id IS NULL
  AND document.entity_type = 'assignment'
  AND document.entity_id = assignment.id;

UPDATE documents document
SET tenant_id = customer.tenant_id
FROM customers customer
WHERE document.tenant_id IS NULL
  AND document.entity_type = 'customer'
  AND document.entity_id = customer.id;

UPDATE documents document
SET tenant_id = person.tenant_id
FROM personnel person
WHERE document.tenant_id IS NULL
  AND document.entity_type = 'personnel'
  AND document.entity_id = person.id;

UPDATE documents document
SET tenant_id = object_record.tenant_id
FROM objects object_record
WHERE document.tenant_id IS NULL
  AND document.entity_type = 'object'
  AND document.entity_id = object_record.id;

WITH unambiguous_active_uploader AS (
  SELECT
    user_id,
    min(tenant_id) AS tenant_id,
    count(DISTINCT tenant_id) AS tenant_count
  FROM tenant_users
  WHERE status = 'active'
  GROUP BY user_id
)
UPDATE documents document
SET tenant_id = uploader.tenant_id
FROM unambiguous_active_uploader uploader
WHERE document.tenant_id IS NULL
  AND document.entity_type = 'general'
  AND document.uploaded_by = uploader.user_id
  AND uploader.tenant_count = 1;

WITH unambiguous_uploader AS (
  SELECT
    user_id,
    min(tenant_id) AS tenant_id,
    count(DISTINCT tenant_id) AS tenant_count
  FROM tenant_users
  GROUP BY user_id
)
UPDATE documents document
SET tenant_id = uploader.tenant_id
FROM unambiguous_uploader uploader
WHERE document.tenant_id IS NULL
  AND document.uploaded_by = uploader.user_id
  AND uploader.tenant_count = 1;

WITH path_tenant AS (
  SELECT
    document.id,
    CASE
      WHEN document.storage_path ~* '^tenant/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
        THEN substring(document.storage_path FROM '^tenant/([0-9a-fA-F-]{36})/')::uuid
      WHEN document.storage_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
        THEN substring(document.storage_path FROM '^([0-9a-fA-F-]{36})/')::uuid
      ELSE NULL
    END AS tenant_id
  FROM documents document
  WHERE document.tenant_id IS NULL
)
UPDATE documents document
SET tenant_id = path_tenant.tenant_id
FROM path_tenant
JOIN tenants tenant ON tenant.id = path_tenant.tenant_id
WHERE document.id = path_tenant.id
  AND path_tenant.tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS documents_tenant_idx
  ON documents (tenant_id);

CREATE INDEX IF NOT EXISTS documents_tenant_entity_idx
  ON documents (tenant_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS documents_storage_path_idx
  ON documents (storage_path);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'documents_storage_canonical_tenant_path_check'
      AND conrelid = 'documents'::regclass
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_storage_canonical_tenant_path_check
      CHECK (
        tenant_id IS NULL
        OR storage_path LIKE 'tenant/' || tenant_id::text || '/%'
      ) NOT VALID;
  END IF;
END;
$$;

DO $$
DECLARE
  unresolved_count integer;
BEGIN
  SELECT count(*) INTO unresolved_count
  FROM documents
  WHERE tenant_id IS NULL;

  IF unresolved_count = 0 THEN
    ALTER TABLE documents
      ALTER COLUMN tenant_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'documents.tenant_id backfill left % unresolved legacy rows; resolve before enforcing NOT NULL.', unresolved_count;
  END IF;
END;
$$;
