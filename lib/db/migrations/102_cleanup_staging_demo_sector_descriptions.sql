-- Remove the visible staging demo marker from sector descriptions.
-- The marker is useful for seeded transactional demo rows, but it should never
-- appear in tenant-facing reference labels or settings screens.

UPDATE sectors
SET
  description = NULLIF(
    trim(
      replace(
        replace(description, ' (VEELE_STAGING_DEMO_DEN_HAAG)', ''),
        'VEELE_STAGING_DEMO_DEN_HAAG',
        ''
      )
    ),
    ''
  ),
  updated_at = now()
WHERE description ILIKE '%VEELE_STAGING_DEMO_DEN_HAAG%';
