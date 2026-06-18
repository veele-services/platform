-- Migration: add notification settings columns to organization_settings
-- Run this manually in the Supabase SQL Editor.

ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS notif_rapport_goedgekeurd  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_rapport_afgekeurd    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_offerte_verstuurd    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_offerte_verlopen     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_betaling_herinnering boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_herinnering_dagen    integer NOT NULL DEFAULT 7;
