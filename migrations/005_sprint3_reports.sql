-- ============================================================
-- Sprint 3 — Rapportage module
-- Run this in the Supabase SQL Editor (project dashboard → SQL Editor)
-- ============================================================

-- ── 1. reports table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reports (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid         NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,

  submitted_by    uuid         NOT NULL,
  submitted_at    timestamptz  NOT NULL DEFAULT now(),

  -- draft: saved but not yet submitted; submitted: awaiting review; approved/rejected: reviewed
  status          varchar(20)  NOT NULL DEFAULT 'submitted'
                               CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),

  content         text         NOT NULL,
  hours_worked    numeric(5,2),
  notes           text,

  reviewed_by     uuid,
  reviewed_at     timestamptz,

  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
  -- No UNIQUE(assignment_id): multiple submissions allowed after rejection
);

-- ── 2. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS reports_assignment_id_idx ON reports(assignment_id);
CREATE INDEX IF NOT EXISTS reports_status_idx        ON reports(status);
CREATE INDEX IF NOT EXISTS reports_submitted_by_idx  ON reports(submitted_by);

-- ── 3. updated_at trigger ─────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'reports_updated_at'
  ) THEN
    CREATE TRIGGER reports_updated_at
      BEFORE UPDATE ON reports
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- ── 4. Row-Level Security ─────────────────────────────────────────────────────

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Management / Administration use service_role (no explicit policy needed).
-- Personnel: can read and insert reports for assignments they are assigned to.

CREATE POLICY "personnel_read_own_reports"
  ON reports FOR SELECT
  TO authenticated
  USING (
    assignment_id IN (
      SELECT ap.assignment_id
      FROM assignment_personnel ap
      JOIN personnel p ON p.id = ap.personnel_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "personnel_submit_own_reports"
  ON reports FOR INSERT
  TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND assignment_id IN (
      SELECT ap.assignment_id
      FROM assignment_personnel ap
      JOIN personnel p ON p.id = ap.personnel_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ── 5. Permissions ────────────────────────────────────────────────────────────

INSERT INTO permissions (resource, action, description) VALUES
  ('reports', 'read',  'View submitted reports'),
  ('reports', 'write', 'Approve or reject submitted reports')
ON CONFLICT (resource, action) DO NOTHING;

-- Grant reports:read + reports:write to Management, Administration.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('Management', 'Administration')
  AND p.resource = 'reports'
ON CONFLICT DO NOTHING;

-- Grant reports:read to Planning and Teamlead.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('Planning', 'Teamlead')
  AND p.resource = 'reports'
  AND p.action = 'read'
ON CONFLICT DO NOTHING;
