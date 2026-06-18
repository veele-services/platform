-- Migration 006: Add reports:submit and reports:write permissions
-- Must be run manually via Supabase SQL Editor.
--
-- Purpose:
--   - Adds two new permission rows: reports:submit and reports:write
--   - reports:submit → granted to Employee, Flex Employee, Teamlead, Planning, Administration, Management
--   - reports:write  → granted to Administration and Management (approve/reject)
--
-- Safe to run multiple times (INSERT ... ON CONFLICT DO NOTHING).

-- ── 1. Insert new permissions ────────────────────────────────────────────────

INSERT INTO permissions (resource, action, description)
VALUES
  ('reports', 'submit', 'Submit a report for a completed assignment'),
  ('reports', 'write',  'Approve or reject submitted reports')
ON CONFLICT (resource, action) DO NOTHING;

-- ── 2. Grant reports:submit to field-facing roles ────────────────────────────

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.resource = 'reports' AND p.action = 'submit'
  AND r.name IN ('Management', 'Administration', 'Planning', 'Teamlead', 'Employee', 'Flex Employee')
ON CONFLICT DO NOTHING;

-- ── 3. Grant reports:write to management roles ───────────────────────────────

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.resource = 'reports' AND p.action = 'write'
  AND r.name IN ('Management', 'Administration')
ON CONFLICT DO NOTHING;
