-- Migration 012: Documenten module
--
-- BEFORE RUNNING THIS MIGRATION:
-- 1. Create the 'documents' Storage bucket in the Supabase dashboard (Storage → New bucket)
--    - Name: documents
--    - Public: FALSE (private, signed URLs only)
-- 2. Add the following Storage bucket policies in the Supabase dashboard:
--    - SELECT (download): authenticated users can select objects in 'documents' bucket
--    - INSERT (upload): authenticated users can insert objects in 'documents' bucket
--    - DELETE: authenticated users can delete objects they own (uploaded_by = auth.uid())

-- ── Documents table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name         varchar(200) NOT NULL,
  filename     varchar(500) NOT NULL,
  mime_type    varchar(200) NOT NULL,
  storage_path text         NOT NULL UNIQUE,
  size_bytes   integer      NOT NULL CHECK (size_bytes > 0),
  entity_type  varchar(20)  NOT NULL DEFAULT 'general'
    CHECK (entity_type IN ('assignment', 'customer', 'personnel', 'object', 'general')),
  entity_id    uuid,
  uploaded_by  uuid         NOT NULL,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_entity_type_idx ON documents (entity_type);
CREATE INDEX IF NOT EXISTS documents_entity_id_idx   ON documents (entity_id)   WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_uploaded_by_idx ON documents (uploaded_by);
CREATE INDEX IF NOT EXISTS documents_created_at_idx  ON documents (created_at DESC);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all documents
DROP POLICY IF EXISTS "documents_authenticated_read" ON documents;
CREATE POLICY "documents_authenticated_read"
  ON documents FOR SELECT
  TO authenticated
  USING (TRUE);

-- Allow authenticated users to insert documents
DROP POLICY IF EXISTS "documents_authenticated_insert" ON documents;
CREATE POLICY "documents_authenticated_insert"
  ON documents FOR INSERT
  TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

-- Allow users to delete their own documents (and management to delete any)
DROP POLICY IF EXISTS "documents_delete" ON documents;
CREATE POLICY "documents_delete"
  ON documents FOR DELETE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = auth.uid()
        AND p.resource = 'documents' AND p.action = 'write'
    )
  );

-- ── Permissions ─────────────────────────────────────────────────────────────

INSERT INTO permissions (resource, action, description) VALUES
  ('documents', 'read',  'Documenten bekijken en downloaden'),
  ('documents', 'write', 'Documenten uploaden en verwijderen')
ON CONFLICT (resource, action) DO NOTHING;

-- Grant documents:read and documents:write to Management and Administration
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('Management', 'Administration')
  AND p.resource = 'documents'
ON CONFLICT DO NOTHING;

-- Grant documents:read to Planning (field planning team needs to see documents)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Planning'
  AND p.resource = 'documents'
  AND p.action = 'read'
ON CONFLICT DO NOTHING;
