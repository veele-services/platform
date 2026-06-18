-- Migration: 024_personnel_extended.sql
-- Extends the personnel table with employment type, emergency availability,
-- preferred regions, and contract information.

ALTER TABLE personnel
  ADD COLUMN IF NOT EXISTS personnel_type  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS emergency_available BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS preferred_regions   JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS contract_info       JSONB;

CREATE INDEX IF NOT EXISTS idx_personnel_type ON personnel(personnel_type);

COMMENT ON COLUMN personnel.personnel_type        IS 'Employment type: vast, parttime, flex, oproep, zzp, tijdelijk';
COMMENT ON COLUMN personnel.emergency_available   IS 'Available for emergency/urgent assignments outside normal schedule';
COMMENT ON COLUMN personnel.preferred_regions     IS 'Additional preferred regions beyond the primary region field';
COMMENT ON COLUMN personnel.contract_info         IS 'Contract details JSON: { start_date, end_date, contract_type, hours_per_week }';
