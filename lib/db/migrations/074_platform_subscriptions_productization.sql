-- ============================================================================
-- Platform subscriptions productization
--
-- Adds support metadata, optional seat limits and manual billing notes so
-- platform-admin can manage plans/subscriptions without introducing a payment
-- provider yet.
-- ============================================================================

ALTER TABLE plans ADD COLUMN IF NOT EXISTS support_level varchar(40) NOT NULL DEFAULT 'standard';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS support_description text;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_seats integer;

ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS billing_reference varchar(160);
ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS manual_billing_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plans_support_level_check'
      AND conrelid = 'plans'::regclass
  ) THEN
    ALTER TABLE plans
      ADD CONSTRAINT plans_support_level_check
      CHECK (support_level IN ('standard', 'priority', 'dedicated'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tenant_subscriptions_period_end_idx
  ON tenant_subscriptions (current_period_ends_at)
  WHERE current_period_ends_at IS NOT NULL;

UPDATE plans
SET support_level = seed.support_level,
    support_description = seed.support_description,
    max_seats = seed.max_seats,
    updated_at = now()
FROM (
  VALUES
    ('starter', 'standard', 'Standaard platformondersteuning voor basisgebruik.', 5::integer),
    ('professional', 'priority', 'Prioriteitssupport voor groeiende teams.', 25::integer),
    ('enterprise', 'dedicated', 'Dedicated support en maatwerkafspraken.', NULL::integer)
) AS seed(plan_key, support_level, support_description, max_seats)
WHERE plans.key = seed.plan_key;

WITH plan_limit_seed(plan_key, key, description, is_enabled, limit_value) AS (
  VALUES
    ('starter', 'max_seats', 'Aanbevolen maximum aantal actieve seats voor Starter.', true, 5::integer),
    ('professional', 'max_seats', 'Aanbevolen maximum aantal actieve seats voor Professional.', true, 25::integer),
    ('enterprise', 'max_seats', 'Enterprise seats worden contractueel afgestemd.', true, NULL::integer)
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
