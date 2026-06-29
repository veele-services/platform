-- Platform administrator access list.
-- Users in this table are global platform operators, separate from tenant_users.

CREATE TABLE IF NOT EXISTS platform_users (
  user_id uuid PRIMARY KEY,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  CONSTRAINT platform_users_role_check CHECK (role IN ('super_admin', 'support', 'billing_admin'))
);

CREATE INDEX IF NOT EXISTS platform_users_status_idx
  ON platform_users(status);

CREATE INDEX IF NOT EXISTS platform_users_role_idx
  ON platform_users(role);
