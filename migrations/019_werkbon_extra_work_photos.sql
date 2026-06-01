-- ============================================================
-- Migration 019: Werkbon — extra werk & foto's
-- Run manually via Supabase SQL Editor
--
-- BEFORE running this migration:
-- 1. Create a Supabase Storage bucket named "assignment-photos"
--    (Storage → New bucket → Name: assignment-photos, Public: OFF)
-- 2. Add a Storage policy so authenticated users can upload:
--    INSERT policy: bucket_id = 'assignment-photos' AND auth.role() = 'authenticated'
--    SELECT policy: bucket_id = 'assignment-photos' AND auth.role() = 'authenticated'
--    DELETE policy: bucket_id = 'assignment-photos' AND auth.uid() = owner
-- ============================================================

-- Meerwerk-regels die personeel toevoegt tijdens of na uitvoering
CREATE TABLE IF NOT EXISTS assignment_extra_work (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   UUID        NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  task_code_id    UUID        REFERENCES task_codes(id) ON DELETE SET NULL,
  -- Snapshot van taaknaam op moment van invoer (blijft bewaard als code hernoemd wordt)
  task_code_name  VARCHAR(200),
  description     TEXT        NOT NULL,
  hours           NUMERIC(5,2),
  price           NUMERIC(10,2),
  created_by      UUID        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Foto's gekoppeld aan een opdracht (optioneel aan een meerwerk-regel)
CREATE TABLE IF NOT EXISTS assignment_photos (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   UUID        NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  extra_work_id   UUID        REFERENCES assignment_extra_work(id) ON DELETE SET NULL,
  storage_path    TEXT        NOT NULL,
  uploaded_by     UUID        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indices ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_extra_work_assignment ON assignment_extra_work(assignment_id);
CREATE INDEX IF NOT EXISTS idx_photos_assignment      ON assignment_photos(assignment_id);
CREATE INDEX IF NOT EXISTS idx_photos_extra_work      ON assignment_photos(extra_work_id);

-- ─── RLS: assignment_extra_work ────────────────────────────
ALTER TABLE assignment_extra_work ENABLE ROW LEVEL SECURITY;

-- Personeel mag extra werk lezen van hun bevestigde opdrachten
CREATE POLICY "personnel_read_extra_work" ON assignment_extra_work
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM assignment_personnel ap
        JOIN personnel p ON p.id = ap.personnel_id
       WHERE ap.assignment_id = assignment_extra_work.assignment_id
         AND p.user_id        = auth.uid()
         AND ap.status        = 'assigned'
    )
  );

-- Personeel mag extra werk toevoegen aan hun bevestigde opdrachten
CREATE POLICY "personnel_insert_extra_work" ON assignment_extra_work
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM assignment_personnel ap
        JOIN personnel p ON p.id = ap.personnel_id
       WHERE ap.assignment_id = assignment_extra_work.assignment_id
         AND p.user_id        = auth.uid()
         AND ap.status        = 'assigned'
    )
  );

-- Personeel mag eigen extra werk verwijderen
CREATE POLICY "personnel_delete_extra_work" ON assignment_extra_work
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- ─── RLS: assignment_photos ────────────────────────────────
ALTER TABLE assignment_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personnel_read_photos" ON assignment_photos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM assignment_personnel ap
        JOIN personnel p ON p.id = ap.personnel_id
       WHERE ap.assignment_id = assignment_photos.assignment_id
         AND p.user_id        = auth.uid()
         AND ap.status        = 'assigned'
    )
  );

CREATE POLICY "personnel_insert_photos" ON assignment_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM assignment_personnel ap
        JOIN personnel p ON p.id = ap.personnel_id
       WHERE ap.assignment_id = assignment_photos.assignment_id
         AND p.user_id        = auth.uid()
         AND ap.status        = 'assigned'
    )
  );

CREATE POLICY "personnel_delete_photos" ON assignment_photos
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid());
