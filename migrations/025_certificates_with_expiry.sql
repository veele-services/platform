-- Migration 025: Convert certificates from string[] to {name, expires_at?}[] format
-- Must be applied via Supabase SQL Editor (TCP port is blocked in Replit)

-- Convert any existing rows where certificates is a non-empty plain-string array
-- (i.e. the first element is a JSON string, not an object).
-- Rows already in the new format (object array) are left untouched.
UPDATE personnel
SET certificates = (
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('name', elem::text)),
    '[]'::jsonb
  )
  FROM jsonb_array_elements_text(certificates) AS elem
)
WHERE jsonb_typeof(certificates) = 'array'
  AND jsonb_array_length(certificates) > 0
  AND jsonb_typeof(certificates -> 0) = 'string';
