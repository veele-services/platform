-- Fieldgrid sensitive tenant-data access controls.
-- Additive migration: introduces request/grant tables for approved sensitive access.

CREATE TABLE IF NOT EXISTS sensitive_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL,
  requested_role varchar(60) NOT NULL,
  data_scope varchar(120) NOT NULL,
  data_classification_level integer NOT NULL CHECK (data_classification_level BETWEEN 0 AND 6),
  reason text NOT NULL CHECK (char_length(trim(reason)) >= 12),
  support_ticket_reference varchar(160),
  approval_required_from varchar(40) NOT NULL CHECK (approval_required_from IN ('platform_owner', 'tenant_owner', 'dual', 'break_glass')),
  approved_by_user_id uuid,
  approved_at timestamptz,
  denied_by_user_id uuid,
  denied_at timestamptz,
  status varchar(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'revoked')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sensitive_access_requests_tenant_idx ON sensitive_access_requests(tenant_id);
CREATE INDEX IF NOT EXISTS sensitive_access_requests_requester_idx ON sensitive_access_requests(requested_by_user_id);
CREATE INDEX IF NOT EXISTS sensitive_access_requests_status_idx ON sensitive_access_requests(status, expires_at);

CREATE TABLE IF NOT EXISTS sensitive_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES sensitive_access_requests(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  scope varchar(120) NOT NULL,
  permission varchar(40) NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sensitive_access_grants_user_tenant_idx ON sensitive_access_grants(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS sensitive_access_grants_scope_idx ON sensitive_access_grants(tenant_id, scope, expires_at);

ALTER TABLE sensitive_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensitive_access_grants ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON sensitive_access_requests, sensitive_access_grants FROM anon, authenticated;

COMMENT ON TABLE sensitive_access_requests IS 'Approval workflow for platform access to Level 4+ tenant-owned data. Runtime access must be mediated by server-side authorization and fully audited.';
COMMENT ON TABLE sensitive_access_grants IS 'Short-lived sensitive access grants. Expired/revoked grants must not authorize access.';
