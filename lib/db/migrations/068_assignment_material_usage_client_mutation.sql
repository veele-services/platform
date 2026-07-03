-- ============================================================================
-- Assignment material usage client mutation id
--
-- Phase 3 PWA material registration can be queued offline. This nullable client
-- mutation id makes retries idempotent without touching existing rows.
-- ============================================================================

ALTER TABLE assignment_material_usage
  ADD COLUMN IF NOT EXISTS client_mutation_id varchar(80);

CREATE UNIQUE INDEX IF NOT EXISTS assignment_material_usage_client_mutation_idx
  ON assignment_material_usage (tenant_id, assignment_id, created_by, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;
