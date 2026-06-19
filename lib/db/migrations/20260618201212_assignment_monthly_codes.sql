-- Assignment work order numbers
-- Format: <sector>-<year>-<month><monthly-sequence>
-- Example: SCH-2026-0600001, BEV-2026-0600002, FAC-2026-0700001
--
-- The sequence is global per creation month, not per sector, and is based on
-- assignments.created_at. Existing assignment codes are intentionally kept
-- unchanged; this migration affects newly inserted assignments.

CREATE TABLE IF NOT EXISTS assignment_code_sequences (
  period     char(6) PRIMARY KEY,
  last_value bigint NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

WITH month_counts AS (
  SELECT
    to_char(created_at, 'YYYYMM')::char(6) AS period,
    count(*)::bigint AS last_value
  FROM assignments
  WHERE created_at IS NOT NULL
  GROUP BY to_char(created_at, 'YYYYMM')::char(6)
),
formatted_codes AS (
  SELECT regexp_match(code, '^[A-Z0-9]{3}-([0-9]{4})-([0-9]{2})([0-9]{5})$') AS code_match
  FROM assignments
  WHERE code IS NOT NULL
),
formatted_maxes AS (
  SELECT
    (code_match[1] || code_match[2])::char(6) AS period,
    max((code_match[3])::bigint) AS last_value
  FROM formatted_codes
  WHERE code_match IS NOT NULL
  GROUP BY (code_match[1] || code_match[2])::char(6)
),
initial_sequences AS (
  SELECT period, max(last_value) AS last_value
  FROM (
    SELECT period, last_value FROM month_counts
    UNION ALL
    SELECT period, last_value FROM formatted_maxes
  ) source
  GROUP BY period
)
INSERT INTO assignment_code_sequences (period, last_value)
SELECT period, last_value
FROM initial_sequences
ON CONFLICT (period) DO UPDATE
SET
  last_value = greatest(assignment_code_sequences.last_value, excluded.last_value),
  updated_at = now();

CREATE OR REPLACE FUNCTION assignment_sector_prefix(p_sector_name text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_normalized text := lower(coalesce(p_sector_name, ''));
  v_compact    text;
BEGIN
  IF v_normalized LIKE '%schoonmaak%' THEN
    RETURN 'SCH';
  END IF;

  IF v_normalized LIKE '%beveilig%' THEN
    RETURN 'BEV';
  END IF;

  IF v_normalized LIKE '%facilit%' THEN
    RETURN 'FAC';
  END IF;

  v_compact := regexp_replace(upper(coalesce(p_sector_name, '')), '[^A-Z0-9]', '', 'g');

  IF length(v_compact) >= 3 THEN
    RETURN left(v_compact, 3);
  END IF;

  IF length(v_compact) > 0 THEN
    RETURN rpad(v_compact, 3, 'X');
  END IF;

  RETURN 'ALG';
END;
$$;

CREATE OR REPLACE FUNCTION resolve_assignment_sector_prefix(
  p_object_id uuid,
  p_customer_id uuid
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_sector_name text;
BEGIN
  IF p_object_id IS NOT NULL THEN
    SELECT sectors.name
    INTO v_sector_name
    FROM objects
    INNER JOIN sectors ON sectors.id = objects.sector_id
    WHERE objects.id = p_object_id
    LIMIT 1;
  END IF;

  IF v_sector_name IS NULL AND p_customer_id IS NOT NULL THEN
    SELECT sectors.name
    INTO v_sector_name
    FROM customers
    INNER JOIN sectors ON sectors.id = customers.sector_id
    WHERE customers.id = p_customer_id
    LIMIT 1;
  END IF;

  RETURN assignment_sector_prefix(v_sector_name);
END;
$$;

CREATE OR REPLACE FUNCTION next_assignment_code(
  p_created_at timestamp with time zone,
  p_object_id uuid,
  p_customer_id uuid
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_created_at timestamp with time zone := coalesce(p_created_at, now());
  v_period     char(6) := to_char(coalesce(p_created_at, now()), 'YYYYMM')::char(6);
  v_prefix     text;
  v_next_value bigint;
BEGIN
  v_prefix := resolve_assignment_sector_prefix(p_object_id, p_customer_id);

  INSERT INTO assignment_code_sequences (period, last_value)
  VALUES (v_period, 0)
  ON CONFLICT (period) DO NOTHING;

  UPDATE assignment_code_sequences
  SET
    last_value = last_value + 1,
    updated_at = now()
  WHERE period = v_period
  RETURNING last_value INTO v_next_value;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Could not allocate assignment code sequence for period %', v_period;
  END IF;

  RETURN concat(
    v_prefix,
    '-',
    to_char(v_created_at, 'YYYY'),
    '-',
    to_char(v_created_at, 'MM'),
    lpad(v_next_value::text, 5, '0')
  );
END;
$$;

CREATE OR REPLACE FUNCTION trg_assignments_set_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;

  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    NEW.code := next_assignment_code(NEW.created_at, NEW.object_id, NEW.customer_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assignments_set_code ON assignments;

CREATE TRIGGER assignments_set_code
  BEFORE INSERT ON assignments
  FOR EACH ROW EXECUTE FUNCTION trg_assignments_set_code();
