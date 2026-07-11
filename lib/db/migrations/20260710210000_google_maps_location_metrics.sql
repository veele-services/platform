-- Google Maps Platform Sprint 2: canonical location fields, travel mode normalization and tenant usage metrics.

BEGIN;

-- Canonical location fields for customer addresses. Existing legacy address
-- columns stay intact; these fields provide the Google Places/Routes contract.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS address_line_1 text,
  ADD COLUMN IF NOT EXISTS address_line_2 text,
  ADD COLUMN IF NOT EXISTS state_or_region varchar(120),
  ADD COLUMN IF NOT EXISTS country_code varchar(2) DEFAULT 'NL',
  ADD COLUMN IF NOT EXISTS formatted_address text,
  ADD COLUMN IF NOT EXISTS google_place_id varchar(255),
  ADD COLUMN IF NOT EXISTS location_source varchar(40),
  ADD COLUMN IF NOT EXISTS location_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;

UPDATE public.customers
SET
  address_line_1 = COALESCE(address_line_1, address),
  country_code = COALESCE(
    country_code,
    CASE
      WHEN country IS NULL OR btrim(country) = '' THEN 'NL'
      WHEN upper(btrim(country)) IN ('NL', 'NLD', 'NEDERLAND', 'NETHERLANDS', 'THE NETHERLANDS') THEN 'NL'
      ELSE left(upper(btrim(country)), 2)
    END
  ),
  formatted_address = COALESCE(
    formatted_address,
    NULLIF(
      concat_ws(
        ', ',
        NULLIF(btrim(address), ''),
        NULLIF(btrim(concat_ws(' ', NULLIF(btrim(postal_code), ''), NULLIF(btrim(city), ''))), ''),
        NULLIF(btrim(country), '')
      ),
      ''
    )
  ),
  location_source = COALESCE(
    location_source,
    CASE
      WHEN geocoding_provider IN ('google', 'google_places', 'places') THEN 'google_places'
      WHEN geocoding_provider IS NOT NULL THEN 'legacy'
      WHEN address IS NOT NULL OR city IS NOT NULL OR postal_code IS NOT NULL THEN 'manual'
      ELSE NULL
    END
  ),
  location_updated_at = COALESCE(location_updated_at, geocoded_at, updated_at, now())
WHERE
  address_line_1 IS NULL
  OR country_code IS NULL
  OR formatted_address IS NULL
  OR location_source IS NULL
  OR location_updated_at IS NULL;

-- Canonical location fields for service objects.
ALTER TABLE public.objects
  ADD COLUMN IF NOT EXISTS address_line_1 text,
  ADD COLUMN IF NOT EXISTS address_line_2 text,
  ADD COLUMN IF NOT EXISTS state_or_region varchar(120),
  ADD COLUMN IF NOT EXISTS country_code varchar(2) DEFAULT 'NL',
  ADD COLUMN IF NOT EXISTS formatted_address text,
  ADD COLUMN IF NOT EXISTS google_place_id varchar(255),
  ADD COLUMN IF NOT EXISTS location_source varchar(40),
  ADD COLUMN IF NOT EXISTS location_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;

UPDATE public.objects
SET
  address_line_1 = COALESCE(address_line_1, address),
  country_code = COALESCE(country_code, 'NL'),
  formatted_address = COALESCE(
    formatted_address,
    NULLIF(
      concat_ws(
        ', ',
        NULLIF(btrim(address), ''),
        NULLIF(btrim(concat_ws(' ', NULLIF(btrim(postal_code), ''), NULLIF(btrim(city), ''))), '')
      ),
      ''
    )
  ),
  location_source = COALESCE(
    location_source,
    CASE
      WHEN geocoding_provider IN ('google', 'google_places', 'places') THEN 'google_places'
      WHEN geocoding_provider IS NOT NULL THEN 'legacy'
      WHEN address IS NOT NULL OR city IS NOT NULL OR postal_code IS NOT NULL THEN 'manual'
      ELSE NULL
    END
  ),
  location_updated_at = COALESCE(location_updated_at, geocoded_at, updated_at, now())
WHERE
  address_line_1 IS NULL
  OR country_code IS NULL
  OR formatted_address IS NULL
  OR location_source IS NULL
  OR location_updated_at IS NULL;

-- Canonical home location fields for personnel. Legacy address_* columns remain
-- the current form fields and are mapped into the canonical set.
ALTER TABLE public.personnel
  ADD COLUMN IF NOT EXISTS address_line_1 text,
  ADD COLUMN IF NOT EXISTS address_line_2 text,
  ADD COLUMN IF NOT EXISTS state_or_region varchar(120),
  ADD COLUMN IF NOT EXISTS country_code varchar(2) DEFAULT 'NL',
  ADD COLUMN IF NOT EXISTS formatted_address text,
  ADD COLUMN IF NOT EXISTS google_place_id varchar(255),
  ADD COLUMN IF NOT EXISTS location_source varchar(40),
  ADD COLUMN IF NOT EXISTS location_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS legacy_vehicle_type varchar(40);

UPDATE public.personnel
SET
  address_line_1 = COALESCE(address_line_1, address_street),
  country_code = COALESCE(
    country_code,
    CASE
      WHEN address_country IS NULL OR btrim(address_country) = '' THEN 'NL'
      WHEN upper(btrim(address_country)) IN ('NL', 'NLD', 'NEDERLAND', 'NETHERLANDS', 'THE NETHERLANDS') THEN 'NL'
      ELSE left(upper(btrim(address_country)), 2)
    END
  ),
  formatted_address = COALESCE(
    formatted_address,
    NULLIF(
      concat_ws(
        ', ',
        NULLIF(btrim(address_street), ''),
        NULLIF(btrim(concat_ws(' ', NULLIF(btrim(address_postal_code), ''), NULLIF(btrim(address_city), ''))), ''),
        NULLIF(btrim(address_country), '')
      ),
      ''
    )
  ),
  location_source = COALESCE(
    location_source,
    CASE
      WHEN address_geocoding_provider IN ('google', 'google_places', 'places') THEN 'google_places'
      WHEN address_geocoding_provider IS NOT NULL THEN 'legacy'
      WHEN address_street IS NOT NULL OR address_city IS NOT NULL OR address_postal_code IS NOT NULL THEN 'manual'
      ELSE NULL
    END
  ),
  location_updated_at = COALESCE(location_updated_at, address_geocoded_at, updated_at, now())
WHERE
  address_line_1 IS NULL
  OR country_code IS NULL
  OR formatted_address IS NULL
  OR location_source IS NULL
  OR location_updated_at IS NULL;

-- Historical execution location snapshot for assignments. It is filled from the
-- linked object first and then customer fallback, without mutating historical
-- work order address data later when object/customer addresses change.
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS execution_address_line_1 text,
  ADD COLUMN IF NOT EXISTS execution_address_line_2 text,
  ADD COLUMN IF NOT EXISTS execution_postal_code varchar(20),
  ADD COLUMN IF NOT EXISTS execution_city varchar(120),
  ADD COLUMN IF NOT EXISTS execution_state_or_region varchar(120),
  ADD COLUMN IF NOT EXISTS execution_country_code varchar(2),
  ADD COLUMN IF NOT EXISTS execution_formatted_address text,
  ADD COLUMN IF NOT EXISTS execution_latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS execution_longitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS execution_google_place_id varchar(255),
  ADD COLUMN IF NOT EXISTS execution_location_source varchar(40),
  ADD COLUMN IF NOT EXISTS execution_location_snapshot_at timestamptz,
  ADD COLUMN IF NOT EXISTS execution_location_updated_at timestamptz;

UPDATE public.assignments AS a
SET
  execution_address_line_1 = COALESCE(a.execution_address_line_1, o.address_line_1, o.address, c.address_line_1, c.address),
  execution_address_line_2 = COALESCE(a.execution_address_line_2, o.address_line_2, c.address_line_2),
  execution_postal_code = COALESCE(a.execution_postal_code, o.postal_code, c.postal_code),
  execution_city = COALESCE(a.execution_city, o.city, c.city),
  execution_state_or_region = COALESCE(a.execution_state_or_region, o.state_or_region, c.state_or_region),
  execution_country_code = COALESCE(a.execution_country_code, o.country_code, c.country_code, 'NL'),
  execution_formatted_address = COALESCE(a.execution_formatted_address, o.formatted_address, c.formatted_address),
  execution_latitude = COALESCE(a.execution_latitude, o.latitude, c.latitude),
  execution_longitude = COALESCE(a.execution_longitude, o.longitude, c.longitude),
  execution_google_place_id = COALESCE(a.execution_google_place_id, o.google_place_id, c.google_place_id),
  execution_location_source = COALESCE(a.execution_location_source, o.location_source, c.location_source, 'legacy'),
  execution_location_snapshot_at = COALESCE(a.execution_location_snapshot_at, now()),
  execution_location_updated_at = COALESCE(a.execution_location_updated_at, o.location_updated_at, c.location_updated_at, a.updated_at, now())
FROM public.objects AS o, public.customers AS c
WHERE
  o.id = a.object_id
  AND o.tenant_id = a.tenant_id
  AND c.id = a.customer_id
  AND c.tenant_id = a.tenant_id
  AND a.execution_location_snapshot_at IS NULL;

UPDATE public.assignments AS a
SET
  execution_address_line_1 = COALESCE(a.execution_address_line_1, c.address_line_1, c.address),
  execution_address_line_2 = COALESCE(a.execution_address_line_2, c.address_line_2),
  execution_postal_code = COALESCE(a.execution_postal_code, c.postal_code),
  execution_city = COALESCE(a.execution_city, c.city),
  execution_state_or_region = COALESCE(a.execution_state_or_region, c.state_or_region),
  execution_country_code = COALESCE(a.execution_country_code, c.country_code, 'NL'),
  execution_formatted_address = COALESCE(a.execution_formatted_address, c.formatted_address),
  execution_latitude = COALESCE(a.execution_latitude, c.latitude),
  execution_longitude = COALESCE(a.execution_longitude, c.longitude),
  execution_google_place_id = COALESCE(a.execution_google_place_id, c.google_place_id),
  execution_location_source = COALESCE(a.execution_location_source, c.location_source, 'legacy'),
  execution_location_snapshot_at = COALESCE(a.execution_location_snapshot_at, now()),
  execution_location_updated_at = COALESCE(a.execution_location_updated_at, c.location_updated_at, a.updated_at, now())
FROM public.customers AS c
WHERE
  c.id = a.customer_id
  AND c.tenant_id = a.tenant_id
  AND a.execution_location_snapshot_at IS NULL;

-- Normalize personnel and route vehicle types to the canonical Google Routes
-- mapping. moped_or_scooter is explicitly preserved in legacy_vehicle_type /
-- provider_meta and mapped to DRIVE because TWO_WHEELER is out of scope.
ALTER TABLE public.personnel
  ALTER COLUMN vehicle_type SET DEFAULT 'DRIVE';

UPDATE public.personnel
SET legacy_vehicle_type = COALESCE(legacy_vehicle_type, vehicle_type)
WHERE vehicle_type IN ('car', 'bicycle', 'walking', 'moped_or_scooter', 'public_transport');

UPDATE public.personnel
SET vehicle_type = CASE vehicle_type
  WHEN 'bicycle' THEN 'BICYCLE'
  WHEN 'walking' THEN 'WALK'
  WHEN 'public_transport' THEN 'TRANSIT'
  WHEN 'moped_or_scooter' THEN 'DRIVE'
  WHEN 'car' THEN 'DRIVE'
  ELSE vehicle_type
END
WHERE vehicle_type IN ('car', 'bicycle', 'walking', 'moped_or_scooter', 'public_transport');

UPDATE public.assignment_route_cache
SET provider_meta = jsonb_set(
  COALESCE(provider_meta, '{}'::jsonb),
  '{legacyVehicleType}',
  to_jsonb(vehicle_type::text),
  true
)
WHERE vehicle_type IN ('car', 'bicycle', 'walking', 'moped_or_scooter', 'public_transport')
  AND COALESCE(provider_meta, '{}'::jsonb) ->> 'legacyVehicleType' IS NULL;

UPDATE public.assignment_route_cache
SET vehicle_type = CASE vehicle_type
  WHEN 'bicycle' THEN 'BICYCLE'
  WHEN 'walking' THEN 'WALK'
  WHEN 'public_transport' THEN 'TRANSIT'
  WHEN 'moped_or_scooter' THEN 'DRIVE'
  WHEN 'car' THEN 'DRIVE'
  ELSE vehicle_type
END
WHERE vehicle_type IN ('car', 'bicycle', 'walking', 'moped_or_scooter', 'public_transport');

UPDATE public.assignment_route_contexts
SET vehicle_type = CASE vehicle_type
  WHEN 'bicycle' THEN 'BICYCLE'
  WHEN 'walking' THEN 'WALK'
  WHEN 'public_transport' THEN 'TRANSIT'
  WHEN 'moped_or_scooter' THEN 'DRIVE'
  WHEN 'car' THEN 'DRIVE'
  ELSE vehicle_type
END
WHERE vehicle_type IN ('car', 'bicycle', 'walking', 'moped_or_scooter', 'public_transport');

DO $$
BEGIN
  ALTER TABLE public.personnel DROP CONSTRAINT IF EXISTS personnel_vehicle_type_check;
  ALTER TABLE public.assignment_route_cache DROP CONSTRAINT IF EXISTS assignment_route_cache_vehicle_type_check;
  ALTER TABLE public.assignment_route_contexts DROP CONSTRAINT IF EXISTS assignment_route_contexts_vehicle_type_check;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_location_source_check') THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_location_source_check
      CHECK (location_source IS NULL OR location_source IN ('google_places', 'manual', 'import', 'legacy'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objects_location_source_check') THEN
    ALTER TABLE public.objects
      ADD CONSTRAINT objects_location_source_check
      CHECK (location_source IS NULL OR location_source IN ('google_places', 'manual', 'import', 'legacy'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personnel_location_source_check') THEN
    ALTER TABLE public.personnel
      ADD CONSTRAINT personnel_location_source_check
      CHECK (location_source IS NULL OR location_source IN ('google_places', 'manual', 'import', 'legacy'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_execution_location_source_check') THEN
    ALTER TABLE public.assignments
      ADD CONSTRAINT assignments_execution_location_source_check
      CHECK (execution_location_source IS NULL OR execution_location_source IN ('google_places', 'manual', 'import', 'legacy'));
  END IF;

  ALTER TABLE public.personnel
    ADD CONSTRAINT personnel_vehicle_type_check
    CHECK (vehicle_type IN ('DRIVE', 'BICYCLE', 'WALK', 'TRANSIT'));

  ALTER TABLE public.assignment_route_cache
    ADD CONSTRAINT assignment_route_cache_vehicle_type_check
    CHECK (vehicle_type IN ('DRIVE', 'BICYCLE', 'WALK', 'TRANSIT'));

  ALTER TABLE public.assignment_route_contexts
    ADD CONSTRAINT assignment_route_contexts_vehicle_type_check
    CHECK (vehicle_type IN ('DRIVE', 'BICYCLE', 'WALK', 'TRANSIT'));
END $$;

CREATE INDEX IF NOT EXISTS customers_google_place_idx
  ON public.customers (tenant_id, google_place_id)
  WHERE google_place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS objects_google_place_idx
  ON public.objects (tenant_id, google_place_id)
  WHERE google_place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS personnel_google_place_idx
  ON public.personnel (tenant_id, google_place_id)
  WHERE google_place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS assignments_execution_google_place_idx
  ON public.assignments (tenant_id, execution_google_place_id)
  WHERE execution_google_place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS assignments_execution_location_idx
  ON public.assignments (tenant_id, execution_latitude, execution_longitude)
  WHERE execution_latitude IS NOT NULL AND execution_longitude IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.google_maps_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid,
  event_type varchar(80) NOT NULL,
  environment varchar(40) NOT NULL,
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  success boolean NOT NULL DEFAULT true,
  response_time_ms integer,
  cache_or_dedupe_status varchar(40) NOT NULL DEFAULT 'miss',
  provider varchar(40) NOT NULL DEFAULT 'google_maps',
  estimated_sku varchar(120),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_maps_usage_events_event_type_check CHECK (
    event_type IN (
      'maps_view_opened',
      'autocomplete_request',
      'autocomplete_session_started',
      'autocomplete_selection',
      'place_details_request',
      'route_request',
      'route_request_drive_traffic',
      'route_request_bicycle',
      'route_request_walk',
      'route_request_transit',
      'google_api_error',
      'google_api_rate_limited'
    )
  ),
  CONSTRAINT google_maps_usage_events_response_time_check CHECK (
    response_time_ms IS NULL OR response_time_ms >= 0
  ),
  CONSTRAINT google_maps_usage_events_provider_check CHECK (
    provider IN ('google_maps')
  ),
  CONSTRAINT google_maps_usage_events_cache_status_check CHECK (
    cache_or_dedupe_status IN (
      'miss',
      'in_flight',
      'hit',
      'deduped',
      'cache_hit',
      'cache_miss',
      'bypass',
      'negative_cache',
      'rate_limited'
    )
  ),
  CONSTRAINT google_maps_usage_events_metadata_object_check CHECK (
    jsonb_typeof(metadata) = 'object'
  ),
  CONSTRAINT google_maps_usage_events_metadata_safe_check CHECK (
    NOT (metadata ? 'address')
    AND NOT (metadata ? 'formattedAddress')
    AND NOT (metadata ? 'apiKey')
    AND NOT (metadata ? 'secret')
    AND NOT (metadata ? 'token')
    AND NOT (metadata ? 'polyline')
    AND NOT (metadata ? 'payload')
  )
);

CREATE INDEX IF NOT EXISTS google_maps_usage_events_tenant_date_idx
  ON public.google_maps_usage_events (tenant_id, request_date);
CREATE INDEX IF NOT EXISTS google_maps_usage_events_tenant_event_date_idx
  ON public.google_maps_usage_events (tenant_id, event_type, request_date);
CREATE INDEX IF NOT EXISTS google_maps_usage_events_tenant_success_created_idx
  ON public.google_maps_usage_events (tenant_id, success, created_at DESC);
CREATE INDEX IF NOT EXISTS google_maps_usage_events_monthly_provider_idx
  ON public.google_maps_usage_events (tenant_id, provider, request_date);

ALTER TABLE public.google_maps_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.google_maps_usage_events FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.google_maps_usage_events FROM authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'google_maps_usage_events' AND policyname = 'google_maps_usage_events_management_read') THEN
    CREATE POLICY google_maps_usage_events_management_read
      ON public.google_maps_usage_events
      FOR SELECT
      TO authenticated
      USING (is_management());
  END IF;
END $$;

COMMENT ON TABLE public.google_maps_usage_events IS
  'Provider-neutral Google Maps/Places/Routes usage events per tenant. Direct grants are revoked; writes are server-mediated and metadata must not contain addresses, API keys or route payloads.';

COMMIT;
