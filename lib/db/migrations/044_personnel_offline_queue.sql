-- Offline-ready execution data for the personnel PWA.
-- Adds explicit task completion and material usage so queued actions can sync
-- to durable workflow data instead of remaining UI-only state.

ALTER TABLE assignment_tasks
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by uuid;

CREATE INDEX IF NOT EXISTS assignment_tasks_completion_idx
  ON assignment_tasks(assignment_id, completed_at);

CREATE TABLE IF NOT EXISTS assignment_material_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric(10, 2) NOT NULL DEFAULT 1,
  unit_price numeric(10, 2) NOT NULL DEFAULT 0,
  unit_label varchar(40),
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assignment_material_usage_assignment_idx
  ON assignment_material_usage(assignment_id, created_at);

ALTER TABLE assignment_material_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assignment_material_usage_backoffice_all ON assignment_material_usage;
CREATE POLICY assignment_material_usage_backoffice_all
  ON assignment_material_usage
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = (SELECT auth.uid())
        AND r.name IN ('Super Admin', 'Management', 'Planning', 'Administratie')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = (SELECT auth.uid())
        AND r.name IN ('Super Admin', 'Management', 'Planning', 'Administratie')
    )
  );

DROP POLICY IF EXISTS assignment_material_usage_personnel_select ON assignment_material_usage;
CREATE POLICY assignment_material_usage_personnel_select
  ON assignment_material_usage
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM assignment_personnel ap
      JOIN personnel p ON p.id = ap.personnel_id
      WHERE ap.assignment_id = assignment_material_usage.assignment_id
        AND ap.status = 'assigned'
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS assignment_material_usage_personnel_insert ON assignment_material_usage;
CREATE POLICY assignment_material_usage_personnel_insert
  ON assignment_material_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM assignment_personnel ap
      JOIN personnel p ON p.id = ap.personnel_id
      WHERE ap.assignment_id = assignment_material_usage.assignment_id
        AND ap.status = 'assigned'
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS assignment_material_usage_personnel_update_own ON assignment_material_usage;
CREATE POLICY assignment_material_usage_personnel_update_own
  ON assignment_material_usage
  FOR UPDATE
  TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM assignment_personnel ap
      JOIN personnel p ON p.id = ap.personnel_id
      WHERE ap.assignment_id = assignment_material_usage.assignment_id
        AND ap.status = 'assigned'
        AND p.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM assignment_personnel ap
      JOIN personnel p ON p.id = ap.personnel_id
      WHERE ap.assignment_id = assignment_material_usage.assignment_id
        AND ap.status = 'assigned'
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS assignment_material_usage_personnel_delete_own ON assignment_material_usage;
CREATE POLICY assignment_material_usage_personnel_delete_own
  ON assignment_material_usage
  FOR DELETE
  TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM assignment_personnel ap
      JOIN personnel p ON p.id = ap.personnel_id
      WHERE ap.assignment_id = assignment_material_usage.assignment_id
        AND ap.status = 'assigned'
        AND p.user_id = (SELECT auth.uid())
    )
  );
