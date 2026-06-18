-- ============================================================
-- Migration 009: Sprint 3 — Instellingen module
-- Run this manually in the Supabase SQL Editor.
-- ============================================================

-- ── 1. organization_settings (singleton table) ───────────────────────────────

CREATE TABLE IF NOT EXISTS organization_settings (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  naam                varchar(200) NOT NULL DEFAULT '',
  adres               text,
  kvk_nummer          varchar(20),
  btw_nummer          varchar(30),
  logo_url            text,
  betaaltermijn_dagen integer     NOT NULL DEFAULT 30,
  email_afzender      varchar(200),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid
);

-- Singleton enforcement: unique index on constant TRUE permits at most one row
CREATE UNIQUE INDEX IF NOT EXISTS org_settings_singleton_idx
  ON organization_settings ((TRUE));

-- Seed the single row (idempotent)
INSERT INTO organization_settings (naam)
VALUES ('')
ON CONFLICT DO NOTHING;

-- ── 2. updated_at trigger ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_set_org_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_settings_updated_at ON organization_settings;
CREATE TRIGGER trg_org_settings_updated_at
  BEFORE UPDATE ON organization_settings
  FOR EACH ROW EXECUTE FUNCTION trg_set_org_settings_updated_at();

-- ── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated sessions to SELECT (used by SSR).
-- All write operations go through the service-role admin client (bypasses RLS).
DROP POLICY IF EXISTS "org_settings_authenticated_read" ON organization_settings;
CREATE POLICY "org_settings_authenticated_read"
  ON organization_settings
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- ── 4. Add permissions ───────────────────────────────────────────────────────

INSERT INTO permissions (resource, action, description)
VALUES
  ('settings', 'read',   'Instellingen bekijken'),
  ('settings', 'write',  'Instellingen wijzigen'),
  ('roles',    'read',   'Rollen en rechten bekijken'),
  ('roles',    'write',  'Rollen aanmaken en bewerken'),
  ('roles',    'delete', 'Rollen verwijderen'),
  ('users',    'read',   'Gebruikersaccounts bekijken'),
  ('users',    'write',  'Gebruikers uitnodigen, bewerken en deactiveren')
ON CONFLICT (resource, action) DO NOTHING;

-- ── 5. Grant permissions to Management only ───────────────────────────────────
-- Management is the only role with settings, roles, and users admin access.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Management'
  AND p.resource IN ('settings', 'roles', 'users')
ON CONFLICT DO NOTHING;
