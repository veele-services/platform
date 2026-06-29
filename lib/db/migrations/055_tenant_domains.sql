-- ============================================================================
-- Tenant domains
-- Maps hostnames to tenants and reserves platform-owned hosts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain text NOT NULL,
  type text NOT NULL,
  is_primary boolean DEFAULT false NOT NULL,
  verification_status text DEFAULT 'pending' NOT NULL,
  verified_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone,
  CONSTRAINT tenant_domains_type_check CHECK (type IN ('fieldgrid_subdomain', 'custom_domain', 'platform_reserved')),
  CONSTRAINT tenant_domains_verification_status_check CHECK (verification_status IN ('pending', 'verified', 'failed', 'disabled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_domains_domain_unique
  ON tenant_domains(domain);

CREATE INDEX IF NOT EXISTS tenant_domains_tenant_idx
  ON tenant_domains(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_domains_tenant_primary_idx
  ON tenant_domains(tenant_id)
  WHERE is_primary = true;

INSERT INTO tenant_domains (tenant_id, domain, type, is_primary, verification_status, verified_at)
VALUES
  ('00000000-0000-0000-0000-000000000010', 'veele.fieldgrid.nl', 'fieldgrid_subdomain', true, 'verified', now()),
  ('00000000-0000-0000-0000-000000000010', 'platform.fieldgrid.nl', 'platform_reserved', false, 'verified', now())
ON CONFLICT (domain) DO UPDATE
  SET tenant_id = excluded.tenant_id,
      type = excluded.type,
      is_primary = excluded.is_primary,
      verification_status = excluded.verification_status,
      verified_at = COALESCE(tenant_domains.verified_at, excluded.verified_at),
      updated_at = now();
