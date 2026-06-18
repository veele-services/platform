-- ============================================================
-- Migration 019: Werkbon — extra werk & foto's
-- Run manually via Supabase SQL Editor
--
-- STORAGE SETUP (manual, via Supabase dashboard or SQL below):
-- 1. Create bucket "assignment-photos" (Private, NOT public)
--
-- 2. Storage bucket RLS policies — least-privilege:
--    a) INSERT: authenticated users may upload into their own sub-path.
--       bucket_id = 'assignment-photos' AND auth.role() = 'authenticated'
--       (server-side savePhotoPath action enforces ownership + assignment link)
--
--    b) SELECT: only the uploader may read directly via the browser client.
--       bucket_id = 'assignment-photos' AND owner = auth.uid()
--       NOTE: All other reads go via server-side signed URLs (admin client),
--       so this policy is intentionally restrictive.
--
--    c) DELETE: only the owner via browser client (server actions use admin key).
--       bucket_id = 'assignment-photos' AND owner = auth.uid()
--
-- As SQL (run in Supabase SQL editor under Storage → Policies):
--   INSERT INTO storage.buckets (id, name, public) VALUES ('assignment-photos', 'assignment-photos', false)
--     ON CONFLICT DO NOTHING;
--
--   CREATE POLICY "authenticated_upload" ON storage.objects
--     FOR INSERT TO authenticated WITH CHECK (bucket_id = 'assignment-photos');
--
--   CREATE POLICY "owner_select" ON storage.objects
--     FOR SELECT TO authenticated USING (bucket_id = 'assignment-photos' AND owner = auth.uid());
--
--   CREATE POLICY "owner_delete" ON storage.objects
--     FOR DELETE TO authenticated USING (bucket_id = 'assignment-photos' AND owner = auth.uid());
--
-- Management (backoffice) reads photos via server-side admin client (service role key),
-- which bypasses RLS — no additional policy needed for backoffice access.
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
