-- Explicit qualification catalog for certificates, diplomas and knowledge.
-- The legacy personnel/task-code JSON fields stay in sync so existing planning
-- and PWA flows keep working while management gets structured qualification data.

CREATE TABLE IF NOT EXISTS qualification_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010' NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type varchar(30) NOT NULL,
  code varchar(80) NOT NULL,
  name varchar(200) NOT NULL,
  description text,
  sector_id uuid REFERENCES sectors(id) ON DELETE SET NULL,
  validity_months integer,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT qualification_items_type_check CHECK (type IN ('certificate', 'diploma', 'knowledge')),
  CONSTRAINT qualification_items_validity_check CHECK (validity_months IS NULL OR validity_months BETWEEN 1 AND 240)
);

CREATE UNIQUE INDEX IF NOT EXISTS qualification_items_tenant_type_code_idx
  ON qualification_items(tenant_id, type, code);
CREATE INDEX IF NOT EXISTS qualification_items_tenant_type_active_idx
  ON qualification_items(tenant_id, type, is_active);
CREATE INDEX IF NOT EXISTS qualification_items_sector_idx
  ON qualification_items(sector_id);

CREATE TABLE IF NOT EXISTS personnel_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010' NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  personnel_id uuid NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  qualification_id uuid NOT NULL REFERENCES qualification_items(id) ON DELETE CASCADE,
  issued_at varchar(10),
  expires_at varchar(10),
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT personnel_qualifications_issued_at_check CHECK (issued_at IS NULL OR issued_at ~ '^\d{4}-\d{2}-\d{2}$'),
  CONSTRAINT personnel_qualifications_expires_at_check CHECK (expires_at IS NULL OR expires_at ~ '^\d{4}-\d{2}-\d{2}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS personnel_qualifications_person_qualification_idx
  ON personnel_qualifications(personnel_id, qualification_id);
CREATE INDEX IF NOT EXISTS personnel_qualifications_tenant_expiry_idx
  ON personnel_qualifications(tenant_id, expires_at);
CREATE INDEX IF NOT EXISTS personnel_qualifications_qualification_idx
  ON personnel_qualifications(qualification_id);

CREATE TABLE IF NOT EXISTS role_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010' NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  qualification_id uuid NOT NULL REFERENCES qualification_items(id) ON DELETE CASCADE,
  required boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS role_qualifications_role_qualification_idx
  ON role_qualifications(role_id, qualification_id);
CREATE INDEX IF NOT EXISTS role_qualifications_qualification_idx
  ON role_qualifications(qualification_id);

CREATE TABLE IF NOT EXISTS task_code_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010' NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_code_id uuid NOT NULL REFERENCES task_codes(id) ON DELETE CASCADE,
  qualification_id uuid NOT NULL REFERENCES qualification_items(id) ON DELETE CASCADE,
  required boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS task_code_qualifications_task_qualification_idx
  ON task_code_qualifications(task_code_id, qualification_id);
CREATE INDEX IF NOT EXISTS task_code_qualifications_qualification_idx
  ON task_code_qualifications(qualification_id);

ALTER TABLE qualification_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE personnel_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_code_qualifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qualification_items_authenticated_read ON qualification_items;
CREATE POLICY qualification_items_authenticated_read
  ON qualification_items
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS qualification_items_management ON qualification_items;
CREATE POLICY qualification_items_management
  ON qualification_items
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS personnel_qualifications_management ON personnel_qualifications;
CREATE POLICY personnel_qualifications_management
  ON personnel_qualifications
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS personnel_qualifications_own_select ON personnel_qualifications;
CREATE POLICY personnel_qualifications_own_select
  ON personnel_qualifications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM personnel p
      WHERE p.id = personnel_qualifications.personnel_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS role_qualifications_authenticated_read ON role_qualifications;
CREATE POLICY role_qualifications_authenticated_read
  ON role_qualifications
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS role_qualifications_management ON role_qualifications;
CREATE POLICY role_qualifications_management
  ON role_qualifications
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

DROP POLICY IF EXISTS task_code_qualifications_authenticated_read ON task_code_qualifications;
CREATE POLICY task_code_qualifications_authenticated_read
  ON task_code_qualifications
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS task_code_qualifications_management ON task_code_qualifications;
CREATE POLICY task_code_qualifications_management
  ON task_code_qualifications
  TO authenticated
  USING (is_management())
  WITH CHECK (is_management());

GRANT SELECT, INSERT, UPDATE, DELETE ON qualification_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON personnel_qualifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON role_qualifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON task_code_qualifications TO authenticated;

WITH sector_map AS (
  SELECT id, lower(name) AS name FROM sectors
),
seed(type, code, name, description, sector_hint, validity_months) AS (
  VALUES
    ('certificate', 'VOG', 'VOG', 'Verklaring Omtrent het Gedrag voor klant- en objecttoegang.', 'schoon', 36),
    ('certificate', 'VCA', 'VCA', 'Veilig werken op locatie en basisveiligheid.', 'facilit', 120),
    ('certificate', 'BHV', 'BHV', 'Bedrijfshulpverlening voor object- en calamiteitensituaties.', 'beveilig', 24),
    ('certificate', 'HOOGWERKER', 'Hoogwerker', 'Veilig bedienen van hoogwerker of vergelijkbaar materieel.', 'facilit', 60),
    ('diploma', 'SVS_BASIS_SCHOONMAAK', 'SVS Basis schoonmaak', 'Basisopleiding professionele schoonmaak.', 'schoon', NULL),
    ('diploma', 'SVS_GLASBEWASSING', 'SVS Glasbewassing', 'Vakdiploma glasbewassing en werken op hoogte.', 'schoon', NULL),
    ('diploma', 'BEVEILIGER_2', 'Beveiliger 2', 'MBO beveiligingsdiploma voor beveiligingswerkzaamheden.', 'beveilig', NULL),
    ('diploma', 'BEVEILIGING_NIVEAU_2', 'Beveiliging niveau 2', 'Legacy naam voor Beveiliger 2 in bestaande testdata.', 'beveilig', NULL),
    ('diploma', 'MBO_FACILITAIR', 'MBO Facilitair', 'Facilitaire vakopleiding voor operationele dienstverlening.', 'facilit', NULL),
    ('knowledge', 'SCHOONMAAKPROTOCOL', 'Schoonmaakprotocol', 'Werken volgens Veele schoonmaakprotocollen.', 'schoon', NULL),
    ('knowledge', 'CALAMITEITENREINIGING', 'Calamiteitenreiniging', 'Spoed- en incidentreiniging op locatie.', 'schoon', NULL),
    ('knowledge', 'VEILIG_WERKEN_OP_HOOGTE', 'Veilig werken op hoogte', 'Werkvoorbereiding en uitvoering voor hoogtewerk.', 'schoon', NULL),
    ('knowledge', 'GASTVRIJ_WERKEN', 'Gastvrij werken', 'Gastvrij en representatief werken bij klanten.', 'schoon', NULL),
    ('knowledge', 'SLEUTELBEHEER', 'Sleutelbeheer', 'Veilige omgang met sleutels, codes en objecttoegang.', 'beveilig', NULL),
    ('knowledge', 'OBJECTBEVEILIGING', 'Objectbeveiliging', 'Basiskennis objectbeveiliging en toegangscontrole.', 'beveilig', NULL),
    ('knowledge', 'RAPPORTAGE', 'Rapportage', 'Heldere rapportage en vastlegging in het platform.', 'facilit', NULL),
    ('knowledge', 'BASIS_TECHNIEK', 'Basis techniek', 'Kleine technische en facilitaire werkzaamheden.', 'facilit', NULL)
)
INSERT INTO qualification_items (tenant_id, type, code, name, description, sector_id, validity_months, is_active)
SELECT
  '00000000-0000-0000-0000-000000000010'::uuid,
  seed.type,
  seed.code,
  seed.name,
  seed.description,
  (
    SELECT sm.id
    FROM sector_map sm
    WHERE sm.name LIKE '%' || seed.sector_hint || '%'
    LIMIT 1
  ),
  seed.validity_months,
  true
FROM seed
ON CONFLICT (tenant_id, type, code) DO UPDATE
  SET name = excluded.name,
      description = excluded.description,
      sector_id = COALESCE(qualification_items.sector_id, excluded.sector_id),
      validity_months = excluded.validity_months,
      is_active = true,
      updated_at = now();

INSERT INTO personnel_qualifications (tenant_id, personnel_id, qualification_id, issued_at, expires_at)
SELECT DISTINCT
  p.tenant_id,
  p.id,
  qi.id,
  NULL,
  NULLIF(cert.value->>'expires_at', '')
FROM personnel p
CROSS JOIN LATERAL jsonb_array_elements(p.certificates) AS cert(value)
JOIN qualification_items qi
  ON qi.tenant_id = p.tenant_id
 AND qi.type = 'certificate'
 AND lower(qi.name) = lower(COALESCE(cert.value->>'name', cert.value #>> '{}'))
WHERE jsonb_typeof(p.certificates) = 'array'
ON CONFLICT (personnel_id, qualification_id) DO UPDATE
  SET expires_at = COALESCE(excluded.expires_at, personnel_qualifications.expires_at),
      updated_at = now();

INSERT INTO personnel_qualifications (tenant_id, personnel_id, qualification_id)
SELECT DISTINCT p.tenant_id, p.id, qi.id
FROM personnel p
CROSS JOIN LATERAL jsonb_array_elements_text(p.diplomas) AS diploma(name)
JOIN qualification_items qi
  ON qi.tenant_id = p.tenant_id
 AND qi.type = 'diploma'
 AND lower(qi.name) = lower(diploma.name)
WHERE jsonb_typeof(p.diplomas) = 'array'
ON CONFLICT (personnel_id, qualification_id) DO NOTHING;

INSERT INTO personnel_qualifications (tenant_id, personnel_id, qualification_id)
SELECT DISTINCT p.tenant_id, p.id, qi.id
FROM personnel p
CROSS JOIN LATERAL jsonb_array_elements_text(p.knowledge) AS knowledge(name)
JOIN qualification_items qi
  ON qi.tenant_id = p.tenant_id
 AND qi.type = 'knowledge'
 AND lower(qi.name) = lower(knowledge.name)
WHERE jsonb_typeof(p.knowledge) = 'array'
ON CONFLICT (personnel_id, qualification_id) DO NOTHING;

INSERT INTO task_code_qualifications (tenant_id, task_code_id, qualification_id, required)
SELECT DISTINCT '00000000-0000-0000-0000-000000000010'::uuid, tc.id, qi.id, true
FROM task_codes tc
CROSS JOIN LATERAL jsonb_array_elements_text(tc.required_certificates) AS cert(name)
JOIN qualification_items qi
  ON qi.type = 'certificate'
 AND lower(qi.name) = lower(cert.name)
WHERE jsonb_typeof(tc.required_certificates) = 'array'
ON CONFLICT (task_code_id, qualification_id) DO NOTHING;

INSERT INTO task_code_qualifications (tenant_id, task_code_id, qualification_id, required)
SELECT DISTINCT '00000000-0000-0000-0000-000000000010'::uuid, tc.id, qi.id, true
FROM task_codes tc
JOIN qualification_items qi
  ON qi.type = 'diploma'
 AND lower(qi.name) = lower(tc.required_diploma)
WHERE tc.required_diploma IS NOT NULL
ON CONFLICT (task_code_id, qualification_id) DO NOTHING;

INSERT INTO task_code_qualifications (tenant_id, task_code_id, qualification_id, required)
SELECT DISTINCT '00000000-0000-0000-0000-000000000010'::uuid, tc.id, qi.id, true
FROM task_codes tc
CROSS JOIN LATERAL jsonb_array_elements_text(tc.required_knowledge) AS knowledge(name)
JOIN qualification_items qi
  ON qi.type = 'knowledge'
 AND lower(qi.name) = lower(knowledge.name)
WHERE jsonb_typeof(tc.required_knowledge) = 'array'
ON CONFLICT (task_code_id, qualification_id) DO NOTHING;

INSERT INTO role_qualifications (tenant_id, role_id, qualification_id, required)
SELECT '00000000-0000-0000-0000-000000000010'::uuid, r.id, qi.id, true
FROM roles r
JOIN qualification_items qi
  ON (
    (lower(r.name) LIKE '%team%' AND qi.code IN ('BHV', 'VCA'))
    OR (lower(r.name) LIKE '%beveilig%' AND qi.code IN ('VOG', 'BEVEILIGER_2'))
    OR (lower(r.name) LIKE '%employee%' AND qi.code IN ('VOG'))
    OR (lower(r.name) LIKE '%flex%' AND qi.code IN ('VOG'))
  )
ON CONFLICT (role_id, qualification_id) DO NOTHING;
