-- ============================================================================
-- Module entitlement foundation
--
-- Staging-safe migration: creates the module catalog and tenant module override
-- tables without changing existing tenant behavior. Runtime enforcement is added
-- in follow-up PRs per route/domain.
-- ============================================================================

CREATE TABLE IF NOT EXISTS modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key varchar(80) NOT NULL,
  name varchar(120) NOT NULL,
  description text,
  category varchar(60) NOT NULL DEFAULT 'core',
  is_system boolean NOT NULL DEFAULT true,
  is_enabled_by_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS modules_key_idx
  ON modules (key);

CREATE INDEX IF NOT EXISTS modules_category_idx
  ON modules (category);

CREATE TABLE IF NOT EXISTS module_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  depends_on_module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS module_dependencies_unique_idx
  ON module_dependencies (module_id, depends_on_module_id);

CREATE INDEX IF NOT EXISTS module_dependencies_depends_on_idx
  ON module_dependencies (depends_on_module_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'module_dependencies_no_self_check'
      AND conrelid = 'module_dependencies'::regclass
  ) THEN
    ALTER TABLE module_dependencies
      ADD CONSTRAINT module_dependencies_no_self_check
      CHECK (module_id <> depends_on_module_id);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS tenant_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  source varchar(40) NOT NULL DEFAULT 'manual',
  configured_by uuid,
  enabled_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_modules_tenant_module_idx
  ON tenant_modules (tenant_id, module_id);

CREATE INDEX IF NOT EXISTS tenant_modules_tenant_idx
  ON tenant_modules (tenant_id);

CREATE INDEX IF NOT EXISTS tenant_modules_module_idx
  ON tenant_modules (module_id);

CREATE INDEX IF NOT EXISTS tenant_modules_enabled_idx
  ON tenant_modules (tenant_id, is_enabled);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_modules_source_check'
      AND conrelid = 'tenant_modules'::regclass
  ) THEN
    ALTER TABLE tenant_modules
      ADD CONSTRAINT tenant_modules_source_check
      CHECK (source IN ('system', 'plan', 'manual', 'trial', 'support'));
  END IF;
END;
$$;

ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_modules ENABLE ROW LEVEL SECURITY;

INSERT INTO modules (key, name, description, category, is_system, is_enabled_by_default)
VALUES
  ('customers', 'Klanten', 'Klantbeheer en klantrelaties.', 'core', true, true),
  ('objects', 'Objecten en locaties', 'Objecten, locaties en objectcontacten.', 'core', true, true),
  ('personnel', 'Personeel', 'Personeelsprofielen, kwalificaties en beschikbaarheid.', 'core', true, true),
  ('assignments', 'Opdrachten', 'Opdrachtplanning, uitvoering en taakregistratie.', 'core', true, true),
  ('planning', 'Planning', 'Operationele planning en inzetoverzicht.', 'operations', true, true),
  ('reporting', 'Rapportages', 'Rapporten, PDF-output en rapportageflows.', 'operations', true, true),
  ('documents', 'Documenten', 'Documentbeheer, uploads en downloads.', 'data', true, true),
  ('finance', 'Financieel', 'Offertes, facturen, betalingen en batches.', 'finance', true, true),
  ('customer_portal', 'Klantportaal', 'Klantportaaltoegang en klantselfservice.', 'portal', true, true),
  ('personnel_portal', 'Personeelsapp', 'Personeels-PWA, eigen planning en profiel.', 'portal', true, true),
  ('notifications', 'Notificaties', 'Notificaties, e-mailtemplates en dispatch.', 'communications', true, true),
  ('smart_planning', 'Slimme planning', 'Capaciteitschecks, kandidaten en intelligente planningssuggesties.', 'operations', true, false)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    is_system = EXCLUDED.is_system,
    is_enabled_by_default = EXCLUDED.is_enabled_by_default,
    updated_at = now();

INSERT INTO module_dependencies (module_id, depends_on_module_id)
SELECT child.id, parent.id
FROM modules child
JOIN modules parent ON parent.key = dependency.depends_on_key
JOIN (VALUES
  ('objects', 'customers'),
  ('assignments', 'customers'),
  ('assignments', 'objects'),
  ('assignments', 'personnel'),
  ('planning', 'assignments'),
  ('reporting', 'assignments'),
  ('documents', 'customers'),
  ('documents', 'assignments'),
  ('finance', 'customers'),
  ('finance', 'assignments'),
  ('customer_portal', 'customers'),
  ('personnel_portal', 'personnel'),
  ('notifications', 'customers'),
  ('notifications', 'personnel'),
  ('smart_planning', 'planning')
) AS dependency(module_key, depends_on_key) ON child.key = dependency.module_key
ON CONFLICT DO NOTHING;
