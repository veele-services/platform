-- Date-specific personnel availability for the mobile PWA.
-- Personnel can fill actual calendar days, optionally materialized from a
-- repeat rule up to the tenant-configured planning horizon.

ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS availability_advance_days integer DEFAULT 60 NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'organization_settings_availability_advance_days_check'
  ) THEN
    ALTER TABLE organization_settings
      ADD CONSTRAINT organization_settings_availability_advance_days_check
      CHECK (availability_advance_days BETWEEN 7 AND 365);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS availability_day_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  personnel_id uuid NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  date varchar(10) NOT NULL,
  start_time varchar(5) DEFAULT '09:00' NOT NULL,
  end_time varchar(5) DEFAULT '17:00' NOT NULL,
  is_emergency_available boolean DEFAULT false NOT NULL,
  repeat_type varchar(20) DEFAULT 'none' NOT NULL,
  repeat_group_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT availability_day_entries_date_check CHECK (date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  CONSTRAINT availability_day_entries_time_check CHECK (
    start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND start_time < end_time
  ),
  CONSTRAINT availability_day_entries_repeat_type_check CHECK (
    repeat_type IN ('none', 'daily', 'weekly', 'monthly')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS avail_day_entries_personnel_date_idx
  ON availability_day_entries(personnel_id, date);
CREATE INDEX IF NOT EXISTS avail_day_entries_date_idx
  ON availability_day_entries(date);
CREATE INDEX IF NOT EXISTS avail_day_entries_repeat_group_idx
  ON availability_day_entries(repeat_group_id);

ALTER TABLE availability_day_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'availability_day_entries'
      AND policyname = 'availability_day_entries_select_own'
  ) THEN
    CREATE POLICY availability_day_entries_select_own
      ON availability_day_entries
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM personnel p
          WHERE p.id = availability_day_entries.personnel_id
            AND p.user_id = (SELECT auth.uid())
        )
        OR is_management()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'availability_day_entries'
      AND policyname = 'availability_day_entries_insert_own'
  ) THEN
    CREATE POLICY availability_day_entries_insert_own
      ON availability_day_entries
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM personnel p
          WHERE p.id = availability_day_entries.personnel_id
            AND p.user_id = (SELECT auth.uid())
        )
        OR is_management()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'availability_day_entries'
      AND policyname = 'availability_day_entries_update_own'
  ) THEN
    CREATE POLICY availability_day_entries_update_own
      ON availability_day_entries
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM personnel p
          WHERE p.id = availability_day_entries.personnel_id
            AND p.user_id = (SELECT auth.uid())
        )
        OR is_management()
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM personnel p
          WHERE p.id = availability_day_entries.personnel_id
            AND p.user_id = (SELECT auth.uid())
        )
        OR is_management()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'availability_day_entries'
      AND policyname = 'availability_day_entries_delete_own'
  ) THEN
    CREATE POLICY availability_day_entries_delete_own
      ON availability_day_entries
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM personnel p
          WHERE p.id = availability_day_entries.personnel_id
            AND p.user_id = (SELECT auth.uid())
        )
        OR is_management()
      );
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON availability_day_entries TO authenticated;
