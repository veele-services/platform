-- ============================================================================
-- Smart planning interest rounds: anti-spam controls, reminder metadata and
-- explicit round history counters. Existing rounds remain valid.
-- ============================================================================

ALTER TABLE assignment_interest_rounds
  ADD COLUMN IF NOT EXISTS reminder_after_minutes integer DEFAULT 15 NOT NULL,
  ADD COLUMN IF NOT EXISTS reminder_due_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS invite_policy jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS skipped_count integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS blocked_count integer DEFAULT 0 NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assignment_interest_rounds_reminder_after_check'
  ) THEN
    ALTER TABLE assignment_interest_rounds
      ADD CONSTRAINT assignment_interest_rounds_reminder_after_check
      CHECK (reminder_after_minutes BETWEEN 1 AND 1440);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assignment_interest_rounds_skipped_count_check'
  ) THEN
    ALTER TABLE assignment_interest_rounds
      ADD CONSTRAINT assignment_interest_rounds_skipped_count_check
      CHECK (skipped_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assignment_interest_rounds_blocked_count_check'
  ) THEN
    ALTER TABLE assignment_interest_rounds
      ADD CONSTRAINT assignment_interest_rounds_blocked_count_check
      CHECK (blocked_count >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS assignment_interest_rounds_reminder_due_idx
  ON assignment_interest_rounds(status, reminder_due_at)
  WHERE reminder_due_at IS NOT NULL
    AND reminder_sent_at IS NULL;

ALTER TABLE planning_sector_rules
  ADD COLUMN IF NOT EXISTS reminder_after_minutes integer DEFAULT 15 NOT NULL,
  ADD COLUMN IF NOT EXISTS invite_cooldown_minutes integer DEFAULT 120 NOT NULL,
  ADD COLUMN IF NOT EXISTS allow_emergency_override boolean DEFAULT true NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'planning_sector_rules_reminder_after_check'
  ) THEN
    ALTER TABLE planning_sector_rules
      ADD CONSTRAINT planning_sector_rules_reminder_after_check
      CHECK (reminder_after_minutes BETWEEN 1 AND 1440);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'planning_sector_rules_invite_cooldown_check'
  ) THEN
    ALTER TABLE planning_sector_rules
      ADD CONSTRAINT planning_sector_rules_invite_cooldown_check
      CHECK (invite_cooldown_minutes BETWEEN 0 AND 10080);
  END IF;
END $$;

UPDATE planning_sector_rules
SET
  reminder_after_minutes = COALESCE(reminder_after_minutes, 15),
  invite_cooldown_minutes = COALESCE(invite_cooldown_minutes, 120),
  allow_emergency_override = COALESCE(allow_emergency_override, true);
