CREATE TABLE IF NOT EXISTS tenant_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_user_roles_unique_idx
  ON tenant_user_roles (tenant_id, user_id, role_id);

CREATE INDEX IF NOT EXISTS tenant_user_roles_user_tenant_idx
  ON tenant_user_roles (user_id, tenant_id);

CREATE TABLE IF NOT EXISTS tenant_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_role_permissions_unique_idx
  ON tenant_role_permissions (tenant_id, role_id, permission_id);

CREATE INDEX IF NOT EXISTS tenant_role_permissions_role_tenant_idx
  ON tenant_role_permissions (role_id, tenant_id);

INSERT INTO tenant_user_roles (tenant_id, user_id, role_id, created_at)
SELECT tu.tenant_id, ur.user_id, ur.role_id, ur.created_at
FROM tenant_users tu
JOIN user_roles ur ON ur.user_id = tu.user_id
ON CONFLICT (tenant_id, user_id, role_id) DO NOTHING;

INSERT INTO tenant_role_permissions (tenant_id, role_id, permission_id, created_at)
SELECT t.id, rp.role_id, rp.permission_id, rp.created_at
FROM tenants t
CROSS JOIN role_permissions rp
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
