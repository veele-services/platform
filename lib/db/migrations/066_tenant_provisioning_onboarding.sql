-- Sprint 11: tenant provisioning and onboarding foundation.
-- Additive only: existing tenants and staging data are not modified.

CREATE TABLE IF NOT EXISTS tenant_provisioning_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  requested_by uuid NOT NULL,
  name varchar(200) NOT NULL,
  slug varchar(80) NOT NULL,
  plan_key varchar(40) NOT NULL DEFAULT 'starter',
  primary_domain text,
  owner_email text,
  owner_user_id uuid,
  owner_invite_status varchar(30) NOT NULL DEFAULT 'not_requested',
  status varchar(30) NOT NULL DEFAULT 'started',
  current_step varchar(80) NOT NULL DEFAULT 'started',
  error_message text,
  metadata jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_provisioning_runs_tenant_idx
  ON tenant_provisioning_runs(tenant_id);
CREATE INDEX IF NOT EXISTS tenant_provisioning_runs_status_idx
  ON tenant_provisioning_runs(status);
CREATE INDEX IF NOT EXISTS tenant_provisioning_runs_requested_by_idx
  ON tenant_provisioning_runs(requested_by);
CREATE INDEX IF NOT EXISTS tenant_provisioning_runs_slug_idx
  ON tenant_provisioning_runs(slug);

CREATE TABLE IF NOT EXISTS tenant_owner_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  user_id uuid,
  status varchar(30) NOT NULL DEFAULT 'pending',
  invited_by uuid NOT NULL,
  invite_sent_at timestamptz,
  rollback_at timestamptz,
  error_message text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_owner_invites_tenant_email_idx
  ON tenant_owner_invites(tenant_id, email);
CREATE INDEX IF NOT EXISTS tenant_owner_invites_email_idx
  ON tenant_owner_invites(email);
CREATE INDEX IF NOT EXISTS tenant_owner_invites_status_idx
  ON tenant_owner_invites(status);

CREATE TABLE IF NOT EXISTS tenant_first_run_state (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  status varchar(30) NOT NULL DEFAULT 'pending',
  required_steps jsonb NOT NULL DEFAULT '["branding", "users", "sectors", "modules"]'::jsonb,
  completed_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_first_run_state_status_idx
  ON tenant_first_run_state(status);
