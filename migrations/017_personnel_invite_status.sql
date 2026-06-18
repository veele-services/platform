-- Migration 017: Add invite_sent_at to personnel
-- Tracks when an invite email was last sent to a medewerker.
-- user_id remains NULL until the employee activates their account (first login in the PWA).
-- Three-state invite status:
--   invite_sent_at NULL  + user_id NULL  => Geen uitnodiging
--   invite_sent_at NOT NULL + user_id NULL  => Uitnodiging verstuurd
--   user_id NOT NULL                     => Portaal actief

ALTER TABLE personnel
  ADD COLUMN IF NOT EXISTS invite_sent_at timestamptz;
