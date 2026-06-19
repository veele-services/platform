-- Assignment report timeline notes and media attachments.

CREATE TABLE IF NOT EXISTS assignment_report_notes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid        NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  body          text        NOT NULL,
  created_by    uuid        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assignment_report_note_attachments (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id       uuid         NOT NULL REFERENCES assignment_report_notes(id) ON DELETE CASCADE,
  assignment_id uuid         NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  storage_path  text         NOT NULL,
  file_name     text         NOT NULL,
  mime_type     varchar(120),
  file_size     bigint,
  uploaded_by   uuid         NOT NULL,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignment_report_notes_assignment
  ON assignment_report_notes(assignment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignment_report_notes_created_by
  ON assignment_report_notes(created_by);

CREATE INDEX IF NOT EXISTS idx_assignment_report_note_attachments_note
  ON assignment_report_note_attachments(note_id);

CREATE INDEX IF NOT EXISTS idx_assignment_report_note_attachments_assignment
  ON assignment_report_note_attachments(assignment_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'assignment_report_notes_updated_at'
  ) THEN
    CREATE TRIGGER assignment_report_notes_updated_at
      BEFORE UPDATE ON assignment_report_notes
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

ALTER TABLE assignment_report_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_report_note_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assignment_report_notes_personnel_read ON assignment_report_notes;
CREATE POLICY assignment_report_notes_personnel_read
  ON assignment_report_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM assignment_personnel ap
        JOIN personnel p ON p.id = ap.personnel_id
       WHERE ap.assignment_id = assignment_report_notes.assignment_id
         AND p.user_id = (select auth.uid())
         AND ap.status = 'assigned'
    )
  );

DROP POLICY IF EXISTS assignment_report_notes_personnel_insert ON assignment_report_notes;
CREATE POLICY assignment_report_notes_personnel_insert
  ON assignment_report_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (select auth.uid())
    AND EXISTS (
      SELECT 1
        FROM assignment_personnel ap
        JOIN personnel p ON p.id = ap.personnel_id
       WHERE ap.assignment_id = assignment_report_notes.assignment_id
         AND p.user_id = (select auth.uid())
         AND ap.status = 'assigned'
    )
  );

DROP POLICY IF EXISTS assignment_report_notes_personnel_delete ON assignment_report_notes;
CREATE POLICY assignment_report_notes_personnel_delete
  ON assignment_report_notes
  FOR DELETE
  TO authenticated
  USING (created_by = (select auth.uid()));

DROP POLICY IF EXISTS assignment_report_note_attachments_personnel_read ON assignment_report_note_attachments;
CREATE POLICY assignment_report_note_attachments_personnel_read
  ON assignment_report_note_attachments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM assignment_personnel ap
        JOIN personnel p ON p.id = ap.personnel_id
       WHERE ap.assignment_id = assignment_report_note_attachments.assignment_id
         AND p.user_id = (select auth.uid())
         AND ap.status = 'assigned'
    )
  );

DROP POLICY IF EXISTS assignment_report_note_attachments_personnel_insert ON assignment_report_note_attachments;
CREATE POLICY assignment_report_note_attachments_personnel_insert
  ON assignment_report_note_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = (select auth.uid())
    AND EXISTS (
      SELECT 1
        FROM assignment_personnel ap
        JOIN personnel p ON p.id = ap.personnel_id
       WHERE ap.assignment_id = assignment_report_note_attachments.assignment_id
         AND p.user_id = (select auth.uid())
         AND ap.status = 'assigned'
    )
  );

DROP POLICY IF EXISTS assignment_report_note_attachments_personnel_delete ON assignment_report_note_attachments;
CREATE POLICY assignment_report_note_attachments_personnel_delete
  ON assignment_report_note_attachments
  FOR DELETE
  TO authenticated
  USING (uploaded_by = (select auth.uid()));
