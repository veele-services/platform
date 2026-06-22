-- ============================================================================
-- Smart planning sector rules v2: explicit role, qualification and fixed-team
-- weighting. Existing rows are migrated conservatively; the matching engine also
-- tolerates old JSON snapshots.
-- ============================================================================

ALTER TABLE planning_sector_rules
  ALTER COLUMN weights
  SET DEFAULT '{"availability":25,"role":12,"qualifications":20,"region":15,"objectExperience":10,"workload":8,"emergency":4,"fixedTeams":3,"preferences":3}'::jsonb;

WITH sector_defaults AS (
  SELECT
    s.id AS sector_id,
    CASE
      WHEN lower(s.name) LIKE '%beveilig%' THEN
        '{"availability":18,"role":16,"qualifications":26,"region":8,"objectExperience":8,"workload":8,"emergency":4,"fixedTeams":6,"preferences":6}'::jsonb
      WHEN lower(s.name) LIKE '%facilit%' THEN
        '{"availability":28,"role":12,"qualifications":18,"region":10,"objectExperience":8,"workload":10,"emergency":8,"fixedTeams":3,"preferences":3}'::jsonb
      ELSE
        '{"availability":25,"role":12,"qualifications":20,"region":15,"objectExperience":10,"workload":8,"emergency":4,"fixedTeams":3,"preferences":3}'::jsonb
    END AS weights
  FROM sectors s
  WHERE s.is_active = true
)
UPDATE planning_sector_rules psr
SET
  weights = sector_defaults.weights,
  updated_at = now()
FROM sector_defaults
WHERE psr.sector_id = sector_defaults.sector_id
  AND (
    NOT (psr.weights ? 'role')
    OR NOT (psr.weights ? 'fixedTeams')
    OR psr.weights ? 'reliability'
  );

WITH sector_defaults AS (
  SELECT
    s.id AS sector_id,
    CASE
      WHEN lower(s.name) LIKE '%beveilig%' THEN
        '{"availability":18,"role":16,"qualifications":26,"region":8,"objectExperience":8,"workload":8,"emergency":4,"fixedTeams":6,"preferences":6}'::jsonb
      WHEN lower(s.name) LIKE '%facilit%' THEN
        '{"availability":28,"role":12,"qualifications":18,"region":10,"objectExperience":8,"workload":10,"emergency":8,"fixedTeams":3,"preferences":3}'::jsonb
      ELSE
        '{"availability":25,"role":12,"qualifications":20,"region":15,"objectExperience":10,"workload":8,"emergency":4,"fixedTeams":3,"preferences":3}'::jsonb
    END AS weights
  FROM sectors s
  WHERE s.is_active = true
)
INSERT INTO planning_sector_rules (
  tenant_id,
  sector_id,
  weights,
  top_match_threshold,
  default_round_size,
  round_interval_minutes,
  max_daily_invites
)
SELECT
  '00000000-0000-0000-0000-000000000010'::uuid,
  sector_defaults.sector_id,
  sector_defaults.weights,
  85,
  5,
  30,
  6
FROM sector_defaults
ON CONFLICT (tenant_id, sector_id) DO NOTHING;
