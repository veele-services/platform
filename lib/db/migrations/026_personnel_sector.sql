-- ============================================================================
-- Personnel sector assignment.
--
-- Veele uses three operational sectors: Facilitair, Schoonmaak and Beveiliging.
-- Customers, objects and task codes already had a sector relation; personnel now
-- gets the same relation so the planning board can match people to work orders.
-- ============================================================================

INSERT INTO sectors (name, description, is_active)
VALUES
  ('Facilitair', 'Facilitaire dienstverlening, beheer en onderhoud.', true),
  ('Schoonmaak', 'Reguliere, specialistische en calamiteitenschoonmaak.', true),
  ('Beveiliging', 'Beveiliging, toezicht, surveillance en alarmopvolging.', true)
ON CONFLICT (name) DO UPDATE
SET
  description = EXCLUDED.description,
  is_active = true,
  updated_at = now();

ALTER TABLE personnel ADD COLUMN IF NOT EXISTS sector_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'personnel_sector_id_sectors_id_fk'
  ) THEN
    ALTER TABLE personnel
      ADD CONSTRAINT personnel_sector_id_sectors_id_fk
      FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_personnel_sector_id ON personnel(sector_id);
