-- ============================================================================
-- Organization settings tenant uniqueness
-- ============================================================================
-- Legacy single-tenant databases may still have org_settings_singleton_idx,
-- which allows only one organization_settings row globally. Fieldgrid is now
-- multi-tenant, so keep one settings row per tenant instead.

ALTER TABLE organization_settings
  DROP CONSTRAINT IF EXISTS org_settings_singleton_idx,
  DROP CONSTRAINT IF EXISTS organization_settings_singleton_idx;

DROP INDEX IF EXISTS org_settings_singleton_idx;
DROP INDEX IF EXISTS organization_settings_singleton_idx;

CREATE UNIQUE INDEX IF NOT EXISTS organization_settings_tenant_unique_idx
  ON organization_settings(tenant_id);
