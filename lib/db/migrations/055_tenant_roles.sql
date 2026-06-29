CREATE TABLE IF NOT EXISTS tenant_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  is_custom boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_roles_tenant_name_unique UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS tenant_role_permissions (
  tenant_role_id uuid NOT NULL REFERENCES tenant_roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (tenant_role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS tenant_user_roles (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tenant_role_id uuid NOT NULL REFERENCES tenant_roles(id) ON DELETE CASCADE,
  PRIMARY KEY (tenant_id, user_id, tenant_role_id)
);
