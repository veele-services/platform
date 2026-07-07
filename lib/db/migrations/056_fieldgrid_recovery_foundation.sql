-- ============================================================================
-- Fieldgrid recovery foundation
--
-- Staging-safe follow-up migration. Do not rewrite the duplicate 055_* files;
-- repair the live shape by adding missing canonical columns/tables and by
-- backfilling tenant-role runtime links from legacy role_id tables when present.
-- ============================================================================

INSERT INTO tenants (id, slug, name)
VALUES ('00000000-0000-0000-0000-000000000010'::uuid, 'veele-services', 'Fieldgrid Default')
ON CONFLICT (id) DO UPDATE
  SET slug = excluded.slug,
      name = excluded.name,
      is_active = true,
      updated_at = now();

-- Tenant domains: keep existing rows, add the richer Fieldgrid domain metadata.
CREATE TABLE IF NOT EXISTS tenant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain text NOT NULL,
  type text NOT NULL DEFAULT 'fieldgrid_subdomain',
  is_primary boolean DEFAULT false NOT NULL,
  verification_status text DEFAULT 'verified' NOT NULL,
  verified_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone
);

ALTER TABLE tenant_domains ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE tenant_domains ADD COLUMN IF NOT EXISTS verification_status text;
ALTER TABLE tenant_domains ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone;
ALTER TABLE tenant_domains ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;

UPDATE tenant_domains
SET type = CASE
    WHEN domain IN ('platform.fieldgrid.nl', 'staging.fieldgrid.nl') THEN 'platform_reserved'
    ELSE 'fieldgrid_subdomain'
  END
WHERE type IS NULL;

UPDATE tenant_domains
SET verification_status = 'verified',
    verified_at = COALESCE(verified_at, now())
WHERE verification_status IS NULL;

ALTER TABLE tenant_domains ALTER COLUMN type SET DEFAULT 'fieldgrid_subdomain';
ALTER TABLE tenant_domains ALTER COLUMN verification_status SET DEFAULT 'verified';
ALTER TABLE tenant_domains ALTER COLUMN type SET NOT NULL;
ALTER TABLE tenant_domains ALTER COLUMN verification_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_domains_type_check'
  ) THEN
    ALTER TABLE tenant_domains
      ADD CONSTRAINT tenant_domains_type_check
      CHECK (type IN ('fieldgrid_subdomain', 'custom_domain', 'platform_reserved'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_domains_verification_status_check'
  ) THEN
    ALTER TABLE tenant_domains
      ADD CONSTRAINT tenant_domains_verification_status_check
      CHECK (verification_status IN ('pending', 'verified', 'failed', 'disabled'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_domains_domain_unique ON tenant_domains(domain);
CREATE INDEX IF NOT EXISTS tenant_domains_tenant_idx ON tenant_domains(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_domains_tenant_primary_idx
  ON tenant_domains(tenant_id)
  WHERE is_primary = true;

INSERT INTO tenant_domains (tenant_id, domain, type, is_primary, verification_status, verified_at)
VALUES
  ('00000000-0000-0000-0000-000000000010'::uuid, 'platform.fieldgrid.nl', 'platform_reserved', false, 'verified', now()),
  ('00000000-0000-0000-0000-000000000010'::uuid, 'staging.fieldgrid.nl', 'platform_reserved', false, 'verified', now())
ON CONFLICT (domain) DO UPDATE
  SET type = excluded.type,
      is_primary = excluded.is_primary,
      verification_status = excluded.verification_status,
      verified_at = COALESCE(tenant_domains.verified_at, excluded.verified_at),
      updated_at = now();

-- Canonical tenant RBAC: global roles are templates, tenant_roles are runtime.
CREATE TABLE IF NOT EXISTS tenant_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010'::uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_role_id uuid REFERENCES roles(id) ON DELETE SET NULL,
  name varchar(100) NOT NULL,
  description text,
  is_system boolean DEFAULT false NOT NULL,
  is_custom boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Existing staging databases may already have a tenant_roles table from an older
-- tenant-RBAC attempt. Normalize the technical id before any new FK references it.
ALTER TABLE tenant_roles ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
UPDATE tenant_roles SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE tenant_roles ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE tenant_roles ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tenant_roles_id_unique_idx ON tenant_roles(id);

ALTER TABLE tenant_roles ADD COLUMN IF NOT EXISTS template_role_id uuid REFERENCES roles(id) ON DELETE SET NULL;
ALTER TABLE tenant_roles ADD COLUMN IF NOT EXISTS is_custom boolean DEFAULT false NOT NULL;
ALTER TABLE tenant_roles ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE tenant_roles ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE tenant_roles ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000010'::uuid;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_roles_tenant_name_idx ON tenant_roles(tenant_id, name);
CREATE INDEX IF NOT EXISTS tenant_roles_tenant_idx ON tenant_roles(tenant_id);
CREATE INDEX IF NOT EXISTS tenant_roles_template_idx ON tenant_roles(template_role_id);

INSERT INTO tenant_roles (tenant_id, template_role_id, name, description, is_system, is_custom, created_at, updated_at)
SELECT
  t.id,
  r.id,
  r.name,
  r.description,
  r.is_system,
  false,
  now(),
  now()
FROM tenants t
CROSS JOIN roles r
WHERE t.is_active = true
ON CONFLICT (tenant_id, name) DO UPDATE
  SET template_role_id = COALESCE(tenant_roles.template_role_id, excluded.template_role_id),
      description = COALESCE(tenant_roles.description, excluded.description),
      is_system = tenant_roles.is_system OR excluded.is_system,
      updated_at = now();

CREATE TABLE IF NOT EXISTS tenant_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_role_id uuid REFERENCES tenant_roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE tenant_role_permissions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE tenant_role_permissions ADD COLUMN IF NOT EXISTS tenant_role_id uuid REFERENCES tenant_roles(id) ON DELETE CASCADE;
ALTER TABLE tenant_role_permissions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_role_permissions' AND column_name = 'role_id'
  ) THEN
    ALTER TABLE tenant_role_permissions ALTER COLUMN role_id DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_role_permissions' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE tenant_role_permissions ALTER COLUMN tenant_id DROP NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_role_permissions' AND column_name = 'role_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_role_permissions' AND column_name = 'tenant_id'
  ) THEN
    EXECUTE '
      UPDATE tenant_role_permissions trp
      SET tenant_role_id = tr.id
      FROM tenant_roles tr
      WHERE trp.tenant_role_id IS NULL
        AND tr.tenant_id = trp.tenant_id
        AND tr.template_role_id = trp.role_id
    ';
  END IF;
END $$;

INSERT INTO tenant_role_permissions (tenant_role_id, permission_id, created_at)
SELECT tr.id, rp.permission_id, now()
FROM tenant_roles tr
JOIN role_permissions rp ON rp.role_id = tr.template_role_id
ON CONFLICT DO NOTHING;

DELETE FROM tenant_role_permissions a
USING tenant_role_permissions b
WHERE a.ctid < b.ctid
  AND a.tenant_role_id IS NOT NULL
  AND b.tenant_role_id IS NOT NULL
  AND a.tenant_role_id = b.tenant_role_id
  AND a.permission_id = b.permission_id;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_role_permissions_tenant_role_permission_idx
  ON tenant_role_permissions(tenant_role_id, permission_id)
  WHERE tenant_role_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tenant_role_permissions_permission_idx ON tenant_role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS tenant_role_permissions_tenant_role_idx ON tenant_role_permissions(tenant_role_id);

CREATE TABLE IF NOT EXISTS tenant_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000010'::uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tenant_role_id uuid REFERENCES tenant_roles(id) ON DELETE CASCADE,
  source_user_role_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE tenant_user_roles ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE tenant_user_roles ADD COLUMN IF NOT EXISTS tenant_role_id uuid REFERENCES tenant_roles(id) ON DELETE CASCADE;
ALTER TABLE tenant_user_roles ADD COLUMN IF NOT EXISTS source_user_role_id uuid;
ALTER TABLE tenant_user_roles ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE tenant_user_roles ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000010'::uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_user_roles' AND column_name = 'role_id'
  ) THEN
    ALTER TABLE tenant_user_roles ALTER COLUMN role_id DROP NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_user_roles' AND column_name = 'role_id'
  ) THEN
    EXECUTE '
      UPDATE tenant_user_roles tur
      SET tenant_role_id = tr.id
      FROM tenant_roles tr
      WHERE tur.tenant_role_id IS NULL
        AND tr.tenant_id = tur.tenant_id
        AND tr.template_role_id = tur.role_id
    ';
  END IF;
END $$;

INSERT INTO tenant_users (tenant_id, user_id, role, status, created_at, updated_at)
SELECT DISTINCT
  '00000000-0000-0000-0000-000000000010'::uuid,
  ur.user_id::uuid,
  CASE WHEN r.name = 'Management' THEN 'admin' ELSE 'member' END,
  'active',
  now(),
  now()
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
ON CONFLICT (tenant_id, user_id) DO NOTHING;

INSERT INTO tenant_user_roles (tenant_id, user_id, tenant_role_id, source_user_role_id, created_at)
SELECT
  '00000000-0000-0000-0000-000000000010'::uuid,
  ur.user_id::uuid,
  tr.id,
  ur.id::uuid,
  COALESCE(ur.created_at, now())
FROM user_roles ur
JOIN tenant_roles tr
  ON tr.tenant_id = '00000000-0000-0000-0000-000000000010'::uuid
 AND tr.template_role_id = ur.role_id
ON CONFLICT DO NOTHING;

DELETE FROM tenant_user_roles a
USING tenant_user_roles b
WHERE a.ctid < b.ctid
  AND a.tenant_role_id IS NOT NULL
  AND b.tenant_role_id IS NOT NULL
  AND a.tenant_id = b.tenant_id
  AND a.user_id = b.user_id
  AND a.tenant_role_id = b.tenant_role_id;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_user_roles_tenant_user_tenant_role_idx
  ON tenant_user_roles(tenant_id, user_id, tenant_role_id)
  WHERE tenant_role_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tenant_user_roles_user_idx ON tenant_user_roles(user_id);
CREATE INDEX IF NOT EXISTS tenant_user_roles_role_idx ON tenant_user_roles(tenant_role_id);

-- Platform-admin and support access foundation.
CREATE TABLE IF NOT EXISTS platform_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  role varchar(40) DEFAULT 'support' NOT NULL,
  status varchar(30) DEFAULT 'active' NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  last_seen_at timestamp with time zone
);

ALTER TABLE platform_users ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
UPDATE platform_users SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE platform_users ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE platform_users ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS platform_users_id_unique_idx ON platform_users(id);

CREATE UNIQUE INDEX IF NOT EXISTS platform_users_user_idx ON platform_users(user_id);
CREATE INDEX IF NOT EXISTS platform_users_status_idx ON platform_users(status);
CREATE INDEX IF NOT EXISTS platform_users_role_idx ON platform_users(role);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_users_role_check') THEN
    ALTER TABLE platform_users
      ADD CONSTRAINT platform_users_role_check CHECK (role IN ('owner', 'admin', 'support'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_users_status_check') THEN
    ALTER TABLE platform_users
      ADD CONSTRAINT platform_users_status_check CHECK (status IN ('active', 'inactive', 'suspended'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS support_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform_user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  starts_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  revoked_at timestamp with time zone,
  revoked_by uuid,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE support_access_grants ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
UPDATE support_access_grants SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE support_access_grants ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE support_access_grants ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS support_access_grants_id_unique_idx ON support_access_grants(id);

CREATE INDEX IF NOT EXISTS support_access_grants_tenant_idx ON support_access_grants(tenant_id);
CREATE INDEX IF NOT EXISTS support_access_grants_platform_user_idx ON support_access_grants(platform_user_id);
CREATE INDEX IF NOT EXISTS support_access_grants_active_idx
  ON support_access_grants(tenant_id, platform_user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS support_access_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  grant_id uuid REFERENCES support_access_grants(id) ON DELETE SET NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform_user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  action varchar(80) NOT NULL,
  resource varchar(120),
  resource_id text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS support_access_audit_tenant_idx ON support_access_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS support_access_audit_platform_user_idx ON support_access_audit_log(platform_user_id);
CREATE INDEX IF NOT EXISTS support_access_audit_grant_idx ON support_access_audit_log(grant_id);
