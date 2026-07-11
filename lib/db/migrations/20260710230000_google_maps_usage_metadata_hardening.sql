-- Google Maps Platform Sprint 10: harden usage metadata against address, credential and route payload storage.

BEGIN;

ALTER TABLE public.google_maps_usage_events
  DROP CONSTRAINT IF EXISTS google_maps_usage_events_metadata_safe_check;

UPDATE public.google_maps_usage_events
SET metadata = (metadata - 'hasCoordinates') || jsonb_build_object('locationResolved', metadata->'hasCoordinates')
WHERE metadata ? 'hasCoordinates';

UPDATE public.google_maps_usage_events
SET metadata = (metadata - 'hasPlaceId') || jsonb_build_object('selected', metadata->'hasPlaceId')
WHERE metadata ? 'hasPlaceId';

ALTER TABLE public.google_maps_usage_events
  ADD CONSTRAINT google_maps_usage_events_metadata_safe_check CHECK (
    NOT jsonb_path_exists(
      metadata,
      '$.keyvalue().key ? (@ like_regex "(address|api.?key|secret|token|polyline|payload|place.?id|query|input|origin|destination|coordinate|lat|lng|postal|city|street)" flag "i")'
    )
  );

COMMENT ON CONSTRAINT google_maps_usage_events_metadata_safe_check
  ON public.google_maps_usage_events IS
  'Google Maps usage metadata may contain only non-PII cost and diagnostics fields; address, coordinate, token, API key and route payload keys are rejected.';

COMMIT;
