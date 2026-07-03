-- ============================================================================
-- Enable all tenant modules by default
--
-- Emergency-safe migration:
-- - keeps tenant data intact;
-- - turns every current module on by default;
-- - ensures every plan includes every module;
-- - backfills every existing tenant so portal modules, including the personnel
--   app, are enabled unless another tenant/status guard blocks access.
-- ============================================================================

ALTER TABLE modules
  ALTER COLUMN is_enabled_by_default SET DEFAULT true;

UPDATE modules
SET is_enabled_by_default = true,
    updated_at = now()
WHERE is_enabled_by_default IS DISTINCT FROM true;

INSERT INTO plan_modules (plan_id, module_id, is_included)
SELECT plans.id, modules.id, true
FROM plans
CROSS JOIN modules
ON CONFLICT (plan_id, module_id) DO UPDATE
SET is_included = true,
    updated_at = now();

INSERT INTO tenant_modules (
  tenant_id,
  module_id,
  is_enabled,
  source,
  enabled_at,
  disabled_at
)
SELECT tenants.id,
       modules.id,
       true,
       'system',
       now(),
       NULL::timestamptz
FROM tenants
CROSS JOIN modules
ON CONFLICT (tenant_id, module_id) DO UPDATE
SET is_enabled = true,
    source = CASE
      WHEN tenant_modules.is_enabled = true THEN tenant_modules.source
      ELSE 'system'
    END,
    enabled_at = COALESCE(tenant_modules.enabled_at, now()),
    disabled_at = NULL,
    updated_at = now();
