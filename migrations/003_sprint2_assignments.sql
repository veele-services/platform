-- ============================================================
-- Sprint 2 — Assignments module
-- Run this in the Supabase SQL Editor (project dashboard → SQL Editor)
-- ============================================================

-- ── 1. assignments table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            varchar(255)  NOT NULL,
  description      text,

  customer_id      uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  object_id        uuid          REFERENCES objects(id)   ON DELETE SET NULL,

  status           varchar(50)   NOT NULL DEFAULT 'requested',
  priority         varchar(20)   NOT NULL DEFAULT 'normal',

  scheduled_date   varchar(10),   -- YYYY-MM-DD
  scheduled_start  varchar(5),    -- HH:MM
  scheduled_end    varchar(5),    -- HH:MM

  notes            text,
  is_active        boolean       NOT NULL DEFAULT true,

  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  created_by       uuid
);

-- ── 2. assignment_personnel junction ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assignment_personnel (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  personnel_id  uuid NOT NULL REFERENCES personnel(id)   ON DELETE CASCADE,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  assigned_by   uuid,
  UNIQUE (assignment_id, personnel_id)
);

-- ── 3. assignment_tasks junction ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assignment_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id)   ON DELETE CASCADE,
  task_code_id  uuid          REFERENCES task_codes(id)    ON DELETE SET NULL,
  notes         text,
  sort_order    integer NOT NULL DEFAULT 0
);

-- ── 4. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS assignments_customer_id_idx    ON assignments(customer_id);
CREATE INDEX IF NOT EXISTS assignments_object_id_idx      ON assignments(object_id);
CREATE INDEX IF NOT EXISTS assignments_status_idx         ON assignments(status);
CREATE INDEX IF NOT EXISTS assignments_scheduled_date_idx ON assignments(scheduled_date);
CREATE INDEX IF NOT EXISTS assignment_personnel_aid_idx   ON assignment_personnel(assignment_id);
CREATE INDEX IF NOT EXISTS assignment_tasks_aid_idx       ON assignment_tasks(assignment_id);

-- ── 5. Row-Level Security ─────────────────────────────────────────────────────
-- The backoffice uses the service_role key (bypasses RLS).
-- Personnel PWA and Customer PWA will enforce row-level access.

ALTER TABLE assignments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_tasks     ENABLE ROW LEVEL SECURITY;

-- Management / Administration: full access via service_role (no policy needed).
-- Personnel: can read assignments they are assigned to.
CREATE POLICY "personnel_read_own_assignments"
  ON assignments FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT assignment_id FROM assignment_personnel ap
      JOIN personnel p ON p.id = ap.personnel_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "personnel_read_own_assignment_personnel"
  ON assignment_personnel FOR SELECT
  TO authenticated
  USING (
    personnel_id IN (
      SELECT id FROM personnel WHERE user_id = auth.uid()
    )
    OR
    assignment_id IN (
      SELECT assignment_id FROM assignment_personnel ap2
      JOIN personnel p ON p.id = ap2.personnel_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "personnel_read_own_assignment_tasks"
  ON assignment_tasks FOR SELECT
  TO authenticated
  USING (
    assignment_id IN (
      SELECT ap.assignment_id FROM assignment_personnel ap
      JOIN personnel p ON p.id = ap.personnel_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ── 6. Permissions ────────────────────────────────────────────────────────────

INSERT INTO permissions (resource, action, description) VALUES
  ('assignments', 'read',  'View assignments list and detail pages'),
  ('assignments', 'write', 'Create, edit, and manage assignment lifecycle'),
  ('planning',    'read',  'View the planning week view'),
  ('planning',    'write', 'Assign personnel to assignments from planning view')
ON CONFLICT (resource, action) DO NOTHING;

-- ── 7. Grant permissions to roles ────────────────────────────────────────────
-- Grant assignments:read + assignments:write + planning:read + planning:write
-- to Management, Administration, and Planning roles.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('Management', 'Administration', 'Planning')
  AND p.resource IN ('assignments', 'planning')
ON CONFLICT DO NOTHING;

-- Grant assignments:read + planning:read to Teamlead and Employee roles.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('Teamlead', 'Employee', 'Flex Employee')
  AND p.resource IN ('assignments', 'planning')
  AND p.action = 'read'
ON CONFLICT DO NOTHING;

-- ── 8. updated_at trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'assignments_updated_at'
  ) THEN
    CREATE TRIGGER assignments_updated_at
      BEFORE UPDATE ON assignments
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;
