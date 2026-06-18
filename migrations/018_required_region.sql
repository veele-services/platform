-- Migration 018: add required_region to assignments
-- Run manually via Supabase SQL Editor

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS required_region VARCHAR(100);

COMMENT ON COLUMN assignments.required_region IS
  'Optional free-text region requirement (matches personnel.region). NULL means no restriction.';
