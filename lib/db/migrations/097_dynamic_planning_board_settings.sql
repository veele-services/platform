ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS planning_workday_start varchar(5) NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS planning_time_slot_minutes integer NOT NULL DEFAULT 90;

UPDATE organization_settings
SET planning_workday_start = COALESCE(NULLIF(planning_workday_start, ''), '08:00'),
    planning_time_slot_minutes = CASE
      WHEN planning_time_slot_minutes < 15 THEN 15
      WHEN planning_time_slot_minutes > 240 THEN 240
      ELSE planning_time_slot_minutes
    END;
