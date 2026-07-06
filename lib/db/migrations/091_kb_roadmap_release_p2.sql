-- P2 knowledgebase, roadmap and release maturity.
-- Adds tenant-configurable authoring/request switches and release read receipts.

ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS kb_tenant_authoring_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS roadmap_personnel_requests_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS roadmap_customer_requests_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS release_read_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid,
  personnel_id uuid,
  customer_id uuid,
  surface varchar(40) NOT NULL,
  audience_key varchar(40) NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS release_read_receipts_release_idx
  ON release_read_receipts(release_id, read_at);

CREATE INDEX IF NOT EXISTS release_read_receipts_tenant_idx
  ON release_read_receipts(tenant_id, read_at);

CREATE INDEX IF NOT EXISTS release_read_receipts_user_idx
  ON release_read_receipts(user_id);

CREATE INDEX IF NOT EXISTS release_read_receipts_personnel_idx
  ON release_read_receipts(personnel_id);

CREATE INDEX IF NOT EXISTS release_read_receipts_customer_idx
  ON release_read_receipts(customer_id);

CREATE INDEX IF NOT EXISTS release_read_receipts_surface_audience_idx
  ON release_read_receipts(surface, audience_key);

CREATE UNIQUE INDEX IF NOT EXISTS release_read_receipts_release_user_unique_idx
  ON release_read_receipts(release_id, user_id, surface)
  WHERE user_id IS NOT NULL AND personnel_id IS NULL AND customer_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS release_read_receipts_release_personnel_unique_idx
  ON release_read_receipts(release_id, personnel_id, surface)
  WHERE personnel_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS release_read_receipts_release_customer_unique_idx
  ON release_read_receipts(release_id, customer_id, surface)
  WHERE customer_id IS NOT NULL;

ALTER TABLE release_read_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE release_read_receipts FROM anon, authenticated;

COMMENT ON TABLE release_read_receipts IS
  'Fieldgrid release read receipts. Direct anon/authenticated Data API privileges are revoked; runtime access is mediated by server-side visibility helpers.';
