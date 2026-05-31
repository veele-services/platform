-- ============================================================
-- Migration 011: Cumulative RBAC seed
-- Ensures all permissions from sprints 1-4 exist and are
-- granted to the correct roles. Safe to re-run (idempotent).
-- Run this manually in the Supabase SQL Editor.
-- ============================================================

-- ── 1. All permissions ───────────────────────────────────────────────────────

INSERT INTO permissions (resource, action, description) VALUES
  -- Customers
  ('customers',   'read',    'Klanten bekijken'),
  ('customers',   'write',   'Klanten aanmaken en bewerken'),
  -- Objects
  ('objects',     'read',    'Objecten bekijken'),
  ('objects',     'write',   'Objecten aanmaken en bewerken'),
  -- Personnel
  ('personnel',   'read',    'Personeelsleden bekijken'),
  ('personnel',   'write',   'Personeelsleden aanmaken en bewerken'),
  -- Assignments
  ('assignments', 'read',    'Opdrachten bekijken'),
  ('assignments', 'write',   'Opdrachten aanmaken en beheren'),
  -- Planning
  ('planning',    'read',    'Planning bekijken'),
  ('planning',    'write',   'Medewerkers inplannen op opdrachten'),
  -- Reports
  ('reports',     'read',    'Rapporten bekijken'),
  ('reports',     'write',   'Rapporten goedkeuren of afwijzen'),
  ('reports',     'submit',  'Rapport indienen voor een afgeronde opdracht'),
  -- Invoices
  ('invoices',    'read',    'Facturen bekijken'),
  ('invoices',    'write',   'Facturen aanmaken en bewerken'),
  ('invoices',    'send',    'Facturen versturen naar klanten'),
  -- Quotes
  ('quotes',      'read',    'Offertes bekijken'),
  ('quotes',      'write',   'Offertes aanmaken en bewerken'),
  ('quotes',      'approve', 'Offertes goedkeuren of afwijzen'),
  -- Task codes
  ('task_codes',  'read',    'Taakcodes bekijken'),
  ('task_codes',  'write',   'Taakcodes aanmaken en bewerken'),
  -- Settings
  ('settings',    'read',    'Instellingen bekijken'),
  ('settings',    'write',   'Instellingen wijzigen'),
  -- Roles
  ('roles',       'read',    'Rollen en rechten bekijken'),
  ('roles',       'write',   'Rollen aanmaken en bewerken'),
  ('roles',       'delete',  'Rollen verwijderen'),
  -- Users
  ('users',       'read',    'Gebruikersaccounts bekijken'),
  ('users',       'write',   'Gebruikers uitnodigen, bewerken en deactiveren'),
  -- Dashboard
  ('dashboard',   'read',    'Dashboard bekijken'),
  -- Documents
  ('documents',   'read',    'Documenten bekijken')
ON CONFLICT (resource, action) DO NOTHING;

-- ── 2. Management — all permissions ─────────────────────────────────────────

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Management'
ON CONFLICT DO NOTHING;

-- ── 3. Administration ────────────────────────────────────────────────────────

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Administration'
  AND (p.resource, p.action) IN (
    ('customers',   'read'),    ('customers',   'write'),
    ('objects',     'read'),    ('objects',     'write'),
    ('personnel',   'read'),    ('personnel',   'write'),
    ('assignments', 'read'),    ('assignments', 'write'),
    ('planning',    'read'),    ('planning',    'write'),
    ('reports',     'read'),    ('reports',     'write'),    ('reports', 'submit'),
    ('invoices',    'read'),    ('invoices',    'write'),    ('invoices', 'send'),
    ('quotes',      'read'),    ('quotes',      'write'),    ('quotes',  'approve'),
    ('task_codes',  'read'),
    ('dashboard',   'read'),
    ('documents',   'read')
  )
ON CONFLICT DO NOTHING;

-- ── 4. Planning ──────────────────────────────────────────────────────────────

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Planning'
  AND (p.resource, p.action) IN (
    ('assignments', 'read'),    ('assignments', 'write'),
    ('planning',    'read'),    ('planning',    'write'),
    ('personnel',   'read'),
    ('reports',     'read'),    ('reports',     'submit'),
    ('quotes',      'read'),
    ('task_codes',  'read'),
    ('dashboard',   'read')
  )
ON CONFLICT DO NOTHING;

-- ── 5. Teamlead ──────────────────────────────────────────────────────────────

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'Teamlead'
  AND (p.resource, p.action) IN (
    ('assignments', 'read'),
    ('planning',    'read'),
    ('reports',     'read'),    ('reports', 'submit'),
    ('quotes',      'read'),
    ('dashboard',   'read')
  )
ON CONFLICT DO NOTHING;

-- ── 6. Employee & Flex Employee ──────────────────────────────────────────────

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('Employee', 'Flex Employee')
  AND (p.resource, p.action) IN (
    ('assignments', 'read'),
    ('planning',    'read'),
    ('reports',     'submit'),
    ('dashboard',   'read')
  )
ON CONFLICT DO NOTHING;
