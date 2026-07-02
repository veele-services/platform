-- ============================================================================
-- Plan entitlement foundation
--
-- Staging-safe migration: creates plan/subscription tables, seeds the first
-- Starter/Professional/Enterprise plans, and backfills active tenant
-- subscriptions from tenants.plan_key without resetting existing tenant data.
-- ============================================================================

CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key varchar(40) NOT NULL,
  name varchar(120) NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS plans_key_idx
  ON plans (key);

CREATE INDEX IF NOT EXISTS plans_active_idx
  ON plans (is_active);

CREATE INDEX IF NOT EXISTS plans_sort_order_idx
  ON plans (sort_order);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plans_key_check'
      AND conrelid = 'plans'::regclass
  ) THEN
    ALTER TABLE plans
      ADD CONSTRAINT plans_key_check
      CHECK (key IN ('starter', 'professional', 'enterprise'));
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS plan_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  is_included boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_modules_plan_module_idx
  ON plan_modules (plan_id, module_id);

CREATE INDEX IF NOT EXISTS plan_modules_module_idx
  ON plan_modules (module_id);

CREATE TABLE IF NOT EXISTS plan_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  key varchar(80) NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT true,
  limit_value integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS plan_limits_plan_key_idx
  ON plan_limits (plan_id, key);

CREATE INDEX IF NOT EXISTS plan_limits_key_idx
  ON plan_limits (key);

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status varchar(30) NOT NULL DEFAULT 'active',
  source varchar(40) NOT NULL DEFAULT 'manual',
  starts_at timestamptz NOT NULL DEFAULT now(),
  current_period_starts_at timestamptz,
  current_period_ends_at timestamptz,
  canceled_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_subscriptions_tenant_idx
  ON tenant_subscriptions (tenant_id);

CREATE INDEX IF NOT EXISTS tenant_subscriptions_plan_idx
  ON tenant_subscriptions (plan_id);

CREATE INDEX IF NOT EXISTS tenant_subscriptions_status_idx
  ON tenant_subscriptions (status);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_subscriptions_tenant_active_idx
  ON tenant_subscriptions (tenant_id)
  WHERE status IN ('trial', 'active');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_subscriptions_status_check'
      AND conrelid = 'tenant_subscriptions'::regclass
  ) THEN
    ALTER TABLE tenant_subscriptions
      ADD CONSTRAINT tenant_subscriptions_status_check
      CHECK (status IN ('trial', 'active', 'past_due', 'canceled', 'expired'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_subscriptions_source_check'
      AND conrelid = 'tenant_subscriptions'::regclass
  ) THEN
    ALTER TABLE tenant_subscriptions
      ADD CONSTRAINT tenant_subscriptions_source_check
      CHECK (source IN ('system', 'migration', 'manual', 'support'));
  END IF;
END;
$$;

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;

INSERT INTO plans (key, name, description, is_active, is_public, sort_order)
VALUES
  ('starter', 'Starter', 'Basisplan zonder custom role management.', true, true, 10),
  ('professional', 'Professional', 'Plan met custom role management.', true, true, 20),
  ('enterprise', 'Enterprise', 'Enterprise-plan met custom role management en maatwerkbeheer.', true, true, 30)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    is_public = EXCLUDED.is_public,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO plan_modules (plan_id, module_id, is_included)
SELECT plans.id, modules.id, true
FROM plans
CROSS JOIN modules
WHERE plans.key IN ('starter', 'professional', 'enterprise')
ON CONFLICT (plan_id, module_id) DO UPDATE
SET is_included = EXCLUDED.is_included,
    updated_at = now();

WITH plan_limit_seed(plan_key, key, description, is_enabled, limit_value) AS (
  VALUES
    ('starter', 'custom_roles', 'Custom role management is beschikbaar vanaf Professional.', false, NULL::integer),
    ('professional', 'custom_roles', 'Custom role management is inbegrepen.', true, NULL::integer),
    ('enterprise', 'custom_roles', 'Custom role management is inbegrepen.', true, NULL::integer)
)
INSERT INTO plan_limits (plan_id, key, description, is_enabled, limit_value)
SELECT plans.id, seed.key, seed.description, seed.is_enabled, seed.limit_value
FROM plan_limit_seed seed
JOIN plans ON plans.key = seed.plan_key
ON CONFLICT (plan_id, key) DO UPDATE
SET description = EXCLUDED.description,
    is_enabled = EXCLUDED.is_enabled,
    limit_value = EXCLUDED.limit_value,
    updated_at = now();

INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, source, starts_at, current_period_starts_at)
SELECT tenants.id, plans.id, 'active', 'migration', now(), now()
FROM tenants
JOIN plans ON plans.key = tenants.plan_key
WHERE NOT EXISTS (
  SELECT 1
  FROM tenant_subscriptions existing
  WHERE existing.tenant_id = tenants.id
    AND existing.status IN ('trial', 'active')
);