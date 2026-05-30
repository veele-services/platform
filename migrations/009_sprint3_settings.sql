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

-- Singleton enforcement: only one row allowed
CREATE UNIQUE INDEX IF NOT EXISTS org_settings_singleton_idx
  ON organization_settings ((TRUE));

-- Seed the single row (idempotent)
INSERT INTO organization_settings (naam)
VALUES ('')
ON CONFLICT DO NOTHING;

-- ── 2. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;

-- Backoffice uses service_role key which bypasses RLS.
-- Future: add policy for authenticated management users if needed.

-- ── 3. Add settings:write permission (settings:read already seeded in RBAC) ──

INSERT INTO permissions (resource, action, description)
VALUES
  ('settings', 'read',  'Instellingen bekijken'),
  ('settings', 'write', 'Instellingen wijzigen'),
  ('roles',    'read',  'Rollen en rechten bekijken'),
  ('roles',    'write', 'Rollen aanmaken en bewerken'),
  ('roles',    'delete','Rollen verwijderen'),
  ('users',    'read',  'Gebruikersaccounts bekijken'),
  ('users',    'write', 'Gebruikers uitnodigen, bewerken en deactiveren')
ON CONFLICT (resource, action) DO NOTHING;

-- ── 4. Grant settings/roles/users permissions to Management ──────────────────

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Management'
  AND p.resource IN ('settings', 'roles', 'users')
ON CONFLICT DO NOTHING;

-- Grant settings:read and users:read/write to Administration
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Administration'
  AND p.resource IN ('settings', 'users')
  AND p.action IN ('read', 'write')
ON CONFLICT DO NOTHING;
