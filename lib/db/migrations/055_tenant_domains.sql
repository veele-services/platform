CREATE TABLE IF NOT EXISTS tenant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain varchar(255) NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_domains_domain_idx ON tenant_domains(domain);
CREATE INDEX IF NOT EXISTS tenant_domains_tenant_idx ON tenant_domains(tenant_id);

ALTER TABLE tenant_domains ENABLE ROW LEVEL SECURITY;
