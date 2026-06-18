-- ============================================================
-- Migration 010: Sprint 4 — Beschikbaarheid & verlofbeheer
-- Run this manually in the Supabase SQL Editor.
-- ============================================================

-- ── 1. availability_windows ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS availability_windows (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id uuid        NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  day_of_week  integer     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   varchar(5)  NOT NULL DEFAULT '08:00',
  end_time     varchar(5)  NOT NULL DEFAULT '17:00',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (personnel_id, day_of_week)
);

-- ── 2. leave_periods ─────────────────────────────────────────────────────────
-- end_date is nullable: ziekte (sick leave) may have no known end date.

CREATE TABLE IF NOT EXISTS leave_periods (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id uuid        NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  start_date   varchar(10) NOT NULL,     -- YYYY-MM-DD
  end_date     varchar(10),              -- YYYY-MM-DD; NULL = open-ended (ziekte)
  leave_type   varchar(20) NOT NULL DEFAULT 'vakantie'
    CHECK (leave_type IN ('vakantie', 'ziekte', 'overig')),
  reason       text,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leave_periods_personnel_idx ON leave_periods (personnel_id);
CREATE INDEX IF NOT EXISTS leave_periods_dates_idx     ON leave_periods (start_date);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE availability_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_periods         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avail_windows_authenticated_read" ON availability_windows;
CREATE POLICY "avail_windows_authenticated_read"
  ON availability_windows FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "leave_periods_authenticated_read" ON leave_periods;
CREATE POLICY "leave_periods_authenticated_read"
  ON leave_periods FOR SELECT TO authenticated USING (TRUE);
