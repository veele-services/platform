-- ============================================================================
-- Tenant RBAC backfill
--
-- Creates tenant-scoped role tables, backfills the default Veele tenant from
-- existing global RBAC roles, migrates current user-role assignments, and seeds
-- the recommended starter role set with permissions copied from the current
-- RBAC templates where applicable.
-- ============================================================================

INSERT INTO tenants (id, slug, name)
VALUES ('00000000-0000-0000-0000-000000000010', 'veele-services', 'Veele Services')
ON CONFLICT (id) DO UPDATE
  SET slug = excluded.slug,
      name = excluded.name,
      is_active = true,
      updated_at = now();

CREATE TABLE IF NOT EXISTS tenant_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010' NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_role_id uuid REFERENCES roles(id) ON DELETE SET NULL,
  name varchar(100) NOT NULL,
  description text,
  is_system boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_roles_tenant_name_idx ON tenant_roles(tenant_id, name);
CREATE INDEX IF NOT EXISTS tenant_roles_tenant_idx ON tenant_roles(tenant_id);
CREATE INDEX IF NOT EXISTS tenant_roles_template_idx ON tenant_roles(template_role_id);

CREATE TABLE IF NOT EXISTS tenant_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_role_id uuid NOT NULL REFERENCES tenant_roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_role_permissions_unique_idx
  ON tenant_role_permissions(tenant_role_id, permission_id);
CREATE INDEX IF NOT EXISTS tenant_role_permissions_permission_idx ON tenant_role_permissions(permission_id);

CREATE TABLE IF NOT EXISTS tenant_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010' NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tenant_role_id uuid NOT NULL REFERENCES tenant_roles(id) ON DELETE CASCADE,
  source_user_role_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_user_roles_unique_idx
  ON tenant_user_roles(tenant_id, user_id, tenant_role_id);
CREATE INDEX IF NOT EXISTS tenant_user_roles_user_idx ON tenant_user_roles(user_id);
CREATE INDEX IF NOT EXISTS tenant_user_roles_role_idx ON tenant_user_roles(tenant_role_id);

-- 1/2. Use all existing global roles as templates and create matching tenant roles
-- for the existing/default Veele tenant.
INSERT INTO tenant_roles (tenant_id, template_role_id, name, description, is_system, created_at, updated_at)
SELECT
  '00000000-0000-0000-0000-000000000010',
  r.id,
  r.name,
  r.description,
  r.is_system,
  now(),
  now()
FROM roles r
ON CONFLICT (tenant_id, name) DO UPDATE
  SET template_role_id = COALESCE(tenant_roles.template_role_id, excluded.template_role_id),
      description = COALESCE(tenant_roles.description, excluded.description),
      is_system = tenant_roles.is_system OR excluded.is_system,
      updated_at = now();

-- 4. Seed the recommended Dutch starter set. Permissions are copied below via
-- template_role_id. Names intentionally coexist with legacy English template
-- roles where they differ.
WITH starter_roles(name, description, template_name, is_system) AS (
  VALUES
    ('Eigenaar', 'Tenant-eigenaar met volledig beheer over alle modules, gebruikers, rollen en instellingen.', 'Management', true),
    ('Management', 'Managementrol met volledige platformtoegang binnen de tenant.', 'Management', true),
    ('Administratie', 'Administratieve rol voor klanten, objecten, facturen, documenten en gebruikersbeheer.', 'Administration', true),
    ('Planning', 'Plant en beheert opdrachten, roosters en taakcodes.', 'Planning', true),
    ('Teamlead', 'Stuurt teams aan, bekijkt planning en verwerkt rapportages.', 'Teamlead', true),
    ('Medewerker', 'Operationele medewerker met toegang tot eigen opdrachten, documenten en rapportages.', 'Employee', true),
    ('Alleen-lezen', 'Read-only/support rol voor meekijken in klant- en operatiegegevens.', 'Support', true),
    ('Klantgebruiker', 'Klantportalrol voor eigen objecten, opdrachten, facturen en documenten.', 'Customer', true),
    ('Personeelsgebruiker', 'Personeelsportalrol voor veldgebruikers en flexmedewerkers.', 'Flex Employee', true)
), resolved AS (
  SELECT
    s.name,
    s.description,
    r.id AS template_role_id,
    s.is_system
  FROM starter_roles s
  LEFT JOIN roles r ON r.name = s.template_name
)
INSERT INTO tenant_roles (tenant_id, template_role_id, name, description, is_system, created_at, updated_at)
SELECT
  '00000000-0000-0000-0000-000000000010',
  template_role_id,
  name,
  description,
  is_system,
  now(),
  now()
FROM resolved
ON CONFLICT (tenant_id, name) DO UPDATE
  SET template_role_id = COALESCE(excluded.template_role_id, tenant_roles.template_role_id),
      description = excluded.description,
      is_system = tenant_roles.is_system OR excluded.is_system,
      updated_at = now();

-- 5. Copy permissions from each tenant role's global template role.
INSERT INTO tenant_role_permissions (tenant_role_id, permission_id, created_at)
SELECT tr.id, rp.permission_id, now()
FROM tenant_roles tr
JOIN role_permissions rp ON rp.role_id = tr.template_role_id
WHERE tr.tenant_id = '00000000-0000-0000-0000-000000000010'
ON CONFLICT (tenant_role_id, permission_id) DO NOTHING;

-- Ensure every user with a legacy global role is a member of the default tenant.
INSERT INTO tenant_users (tenant_id, user_id, role, status, created_at, updated_at)
SELECT DISTINCT
  '00000000-0000-0000-0000-000000000010',
  ur.user_id,
  CASE WHEN r.name = 'Management' THEN 'admin' ELSE 'member' END,
  'active',
  now(),
  now()
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- 3. Convert existing user-role links to tenant_user_roles using the matching
-- tenant role that was created from the same global role template.
INSERT INTO tenant_user_roles (tenant_id, user_id, tenant_role_id, source_user_role_id, created_at)
SELECT
  '00000000-0000-0000-0000-000000000010',
  ur.user_id,
  tr.id,
  ur.id,
  COALESCE(ur.created_at, now())
FROM user_roles ur
JOIN tenant_roles tr
  ON tr.tenant_id = '00000000-0000-0000-0000-000000000010'
 AND tr.template_role_id = ur.role_id
JOIN roles r
  ON r.id = ur.role_id
 AND tr.name = r.name
ON CONFLICT (tenant_id, user_id, tenant_role_id) DO NOTHING;
