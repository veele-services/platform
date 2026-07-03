-- ============================================================================
-- Material usage RLS foundation
--
-- Follow-up to 066_material_inventory_foundation.sql. The existing
-- assignment_material_usage table becomes part of the materials module and
-- therefore needs the same defense-in-depth RLS posture as assignment workflow
-- tables.
-- ============================================================================

ALTER TABLE assignment_material_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assignment_material_usage_management_all ON assignment_material_usage;
CREATE POLICY assignment_material_usage_management_all
  ON assignment_material_usage
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS assignment_material_usage_personnel_assigned_select ON assignment_material_usage;
CREATE POLICY assignment_material_usage_personnel_assigned_select
  ON assignment_material_usage
  FOR SELECT
  TO authenticated
  USING (public.personnel_assigned_to_assignment(assignment_id));

DROP POLICY IF EXISTS assignment_material_usage_personnel_assigned_insert ON assignment_material_usage;
CREATE POLICY assignment_material_usage_personnel_assigned_insert
  ON assignment_material_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (public.personnel_assigned_to_assignment(assignment_id));

DROP POLICY IF EXISTS assignment_material_usage_personnel_own_update ON assignment_material_usage;
CREATE POLICY assignment_material_usage_personnel_own_update
  ON assignment_material_usage
  FOR UPDATE
  TO authenticated
  USING (
    public.personnel_assigned_to_assignment(assignment_id)
    AND created_by = (SELECT auth.uid())
    AND approval_status = 'pending'
  )
  WITH CHECK (
    public.personnel_assigned_to_assignment(assignment_id)
    AND created_by = (SELECT auth.uid())
    AND approval_status = 'pending'
  );

DROP POLICY IF EXISTS assignment_material_usage_personnel_own_delete ON assignment_material_usage;
CREATE POLICY assignment_material_usage_personnel_own_delete
  ON assignment_material_usage
  FOR DELETE
  TO authenticated
  USING (
    public.personnel_assigned_to_assignment(assignment_id)
    AND created_by = (SELECT auth.uid())
    AND approval_status = 'pending'
  );
