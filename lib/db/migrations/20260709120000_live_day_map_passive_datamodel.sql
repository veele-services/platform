-- Fieldgrid live day map passive datamodel.
--
-- Phase 2 only adds passive schema needed for future map/ETA work:
-- - geocoding fields on customers and objects;
-- - vehicle_type on personnel;
-- - route provider/buffer settings on organization_settings;
-- - tenant-scoped route cache and per-personnel route contexts.
--
-- No existing planning, assignment status or notification flow is changed here.
-- Runtime route access remains server-mediated; direct anon/authenticated table
-- privileges are revoked for the new route tables.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS latitude numeric(9, 6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9, 6),
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz,
  ADD COLUMN IF NOT EXISTS geocoding_provider varchar(40),
  ADD COLUMN IF NOT EXISTS geocoding_status varchar(30) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS geocoding_confidence numeric(5, 2),
  ADD COLUMN IF NOT EXISTS geocoding_error text;

ALTER TABLE public.objects
  ADD COLUMN IF NOT EXISTS latitude numeric(9, 6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9, 6),
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz,
  ADD COLUMN IF NOT EXISTS geocoding_provider varchar(40),
  ADD COLUMN IF NOT EXISTS geocoding_status varchar(30) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS geocoding_confidence numeric(5, 2),
  ADD COLUMN IF NOT EXISTS geocoding_error text;

UPDATE public.customers
SET geocoding_status = 'pending'
WHERE geocoding_status IS NULL;

UPDATE public.objects
SET geocoding_status = 'pending'
WHERE geocoding_status IS NULL;

ALTER TABLE public.customers
  ALTER COLUMN geocoding_status SET DEFAULT 'pending',
  ALTER COLUMN geocoding_status SET NOT NULL;

ALTER TABLE public.objects
  ALTER COLUMN geocoding_status SET DEFAULT 'pending',
  ALTER COLUMN geocoding_status SET NOT NULL;

ALTER TABLE public.personnel
  ADD COLUMN IF NOT EXISTS vehicle_type varchar(40) NOT NULL DEFAULT 'car';

UPDATE public.personnel
SET vehicle_type = 'car'
WHERE vehicle_type IS NULL OR trim(vehicle_type) = '';

ALTER TABLE public.personnel
  ALTER COLUMN vehicle_type SET DEFAULT 'car',
  ALTER COLUMN vehicle_type SET NOT NULL;

ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS route_provider varchar(40) NOT NULL DEFAULT 'google',
  ADD COLUMN IF NOT EXISTS route_buffer_minutes_car integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS route_buffer_minutes_bicycle integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS route_buffer_minutes_walking integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS route_buffer_minutes_moped_or_scooter integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS route_buffer_minutes_public_transport integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS route_cache_ttl_hours integer NOT NULL DEFAULT 24;

UPDATE public.organization_settings
SET route_provider = COALESCE(NULLIF(route_provider, ''), 'google'),
    route_buffer_minutes_car = GREATEST(0, LEAST(COALESCE(route_buffer_minutes_car, 10), 240)),
    route_buffer_minutes_bicycle = GREATEST(0, LEAST(COALESCE(route_buffer_minutes_bicycle, 5), 240)),
    route_buffer_minutes_walking = GREATEST(0, LEAST(COALESCE(route_buffer_minutes_walking, 5), 240)),
    route_buffer_minutes_moped_or_scooter = GREATEST(0, LEAST(COALESCE(route_buffer_minutes_moped_or_scooter, 8), 240)),
    route_buffer_minutes_public_transport = GREATEST(0, LEAST(COALESCE(route_buffer_minutes_public_transport, 15), 240)),
    route_cache_ttl_hours = GREATEST(1, LEAST(COALESCE(route_cache_ttl_hours, 24), 720));

ALTER TABLE public.organization_settings
  ALTER COLUMN route_provider SET DEFAULT 'google',
  ALTER COLUMN route_provider SET NOT NULL,
  ALTER COLUMN route_buffer_minutes_car SET DEFAULT 10,
  ALTER COLUMN route_buffer_minutes_car SET NOT NULL,
  ALTER COLUMN route_buffer_minutes_bicycle SET DEFAULT 5,
  ALTER COLUMN route_buffer_minutes_bicycle SET NOT NULL,
  ALTER COLUMN route_buffer_minutes_walking SET DEFAULT 5,
  ALTER COLUMN route_buffer_minutes_walking SET NOT NULL,
  ALTER COLUMN route_buffer_minutes_moped_or_scooter SET DEFAULT 8,
  ALTER COLUMN route_buffer_minutes_moped_or_scooter SET NOT NULL,
  ALTER COLUMN route_buffer_minutes_public_transport SET DEFAULT 15,
  ALTER COLUMN route_buffer_minutes_public_transport SET NOT NULL,
  ALTER COLUMN route_cache_ttl_hours SET DEFAULT 24,
  ALTER COLUMN route_cache_ttl_hours SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_geocoding_status_check') THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_geocoding_status_check
      CHECK (geocoding_status IN ('pending', 'geocoded', 'failed', 'manual', 'not_required'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_latitude_longitude_check') THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_latitude_longitude_check
      CHECK (
        (latitude IS NULL OR (latitude >= -90 AND latitude <= 90))
        AND (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_geocoding_confidence_check') THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_geocoding_confidence_check
      CHECK (geocoding_confidence IS NULL OR (geocoding_confidence >= 0 AND geocoding_confidence <= 100));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objects_geocoding_status_check') THEN
    ALTER TABLE public.objects
      ADD CONSTRAINT objects_geocoding_status_check
      CHECK (geocoding_status IN ('pending', 'geocoded', 'failed', 'manual', 'not_required'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objects_latitude_longitude_check') THEN
    ALTER TABLE public.objects
      ADD CONSTRAINT objects_latitude_longitude_check
      CHECK (
        (latitude IS NULL OR (latitude >= -90 AND latitude <= 90))
        AND (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'objects_geocoding_confidence_check') THEN
    ALTER TABLE public.objects
      ADD CONSTRAINT objects_geocoding_confidence_check
      CHECK (geocoding_confidence IS NULL OR (geocoding_confidence >= 0 AND geocoding_confidence <= 100));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personnel_vehicle_type_check') THEN
    ALTER TABLE public.personnel
      ADD CONSTRAINT personnel_vehicle_type_check
      CHECK (vehicle_type IN ('car', 'bicycle', 'walking', 'moped_or_scooter', 'public_transport'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_settings_route_provider_check') THEN
    ALTER TABLE public.organization_settings
      ADD CONSTRAINT organization_settings_route_provider_check
      CHECK (route_provider IN ('google'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_settings_route_buffer_minutes_check') THEN
    ALTER TABLE public.organization_settings
      ADD CONSTRAINT organization_settings_route_buffer_minutes_check
      CHECK (
        route_buffer_minutes_car BETWEEN 0 AND 240
        AND route_buffer_minutes_bicycle BETWEEN 0 AND 240
        AND route_buffer_minutes_walking BETWEEN 0 AND 240
        AND route_buffer_minutes_moped_or_scooter BETWEEN 0 AND 240
        AND route_buffer_minutes_public_transport BETWEEN 0 AND 240
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_settings_route_cache_ttl_hours_check') THEN
    ALTER TABLE public.organization_settings
      ADD CONSTRAINT organization_settings_route_cache_ttl_hours_check
      CHECK (route_cache_ttl_hours BETWEEN 1 AND 720);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.assignment_route_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider varchar(40) NOT NULL,
  vehicle_type varchar(40) NOT NULL,
  origin_lat numeric(9, 6) NOT NULL,
  origin_lng numeric(9, 6) NOT NULL,
  destination_lat numeric(9, 6) NOT NULL,
  destination_lng numeric(9, 6) NOT NULL,
  origin_hash varchar(80) NOT NULL,
  destination_hash varchar(80) NOT NULL,
  duration_seconds integer NOT NULL,
  distance_meters integer,
  provider_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT assignment_route_cache_vehicle_type_check
    CHECK (vehicle_type IN ('car', 'bicycle', 'walking', 'moped_or_scooter', 'public_transport')),
  CONSTRAINT assignment_route_cache_coordinates_check
    CHECK (
      origin_lat BETWEEN -90 AND 90
      AND destination_lat BETWEEN -90 AND 90
      AND origin_lng BETWEEN -180 AND 180
      AND destination_lng BETWEEN -180 AND 180
    ),
  CONSTRAINT assignment_route_cache_duration_check CHECK (duration_seconds >= 0),
  CONSTRAINT assignment_route_cache_distance_check CHECK (distance_meters IS NULL OR distance_meters >= 0),
  CONSTRAINT assignment_route_cache_provider_meta_check CHECK (jsonb_typeof(provider_meta) = 'object')
);

CREATE TABLE IF NOT EXISTS public.assignment_route_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  personnel_id uuid NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  previous_assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  scheduled_date varchar(10) NOT NULL,
  sequence_index integer NOT NULL,
  origin_kind varchar(40),
  origin_assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  origin_lat numeric(9, 6),
  origin_lng numeric(9, 6),
  destination_lat numeric(9, 6),
  destination_lng numeric(9, 6),
  vehicle_type varchar(40) NOT NULL,
  travel_duration_seconds integer,
  travel_distance_meters integer,
  buffer_minutes integer NOT NULL DEFAULT 0,
  computed_earliest_start timestamptz,
  customer_window_start varchar(5),
  customer_window_end varchar(5),
  snap_status varchar(40),
  snap_suggested_start varchar(5),
  snap_suggested_end varchar(5),
  warning_code varchar(80),
  warning_message text,
  calculated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_route_contexts_vehicle_type_check
    CHECK (vehicle_type IN ('car', 'bicycle', 'walking', 'moped_or_scooter', 'public_transport')),
  CONSTRAINT assignment_route_contexts_sequence_index_check CHECK (sequence_index >= 0),
  CONSTRAINT assignment_route_contexts_buffer_minutes_check CHECK (buffer_minutes BETWEEN 0 AND 240),
  CONSTRAINT assignment_route_contexts_travel_duration_check CHECK (travel_duration_seconds IS NULL OR travel_duration_seconds >= 0),
  CONSTRAINT assignment_route_contexts_travel_distance_check CHECK (travel_distance_meters IS NULL OR travel_distance_meters >= 0),
  CONSTRAINT assignment_route_contexts_coordinates_check
    CHECK (
      (origin_lat IS NULL OR origin_lat BETWEEN -90 AND 90)
      AND (destination_lat IS NULL OR destination_lat BETWEEN -90 AND 90)
      AND (origin_lng IS NULL OR origin_lng BETWEEN -180 AND 180)
      AND (destination_lng IS NULL OR destination_lng BETWEEN -180 AND 180)
    ),
  CONSTRAINT assignment_route_contexts_snap_status_check
    CHECK (snap_status IS NULL OR snap_status IN ('ok', 'suggested', 'outside_window', 'missing_location', 'provider_error')),
  CONSTRAINT assignment_route_contexts_scheduled_date_check CHECK (scheduled_date ~ '^\d{4}-\d{2}-\d{2}$'),
  CONSTRAINT assignment_route_contexts_time_window_check
    CHECK (
      (customer_window_start IS NULL OR customer_window_start ~ '^([01]\d|2[0-3]):[0-5]\d$')
      AND (customer_window_end IS NULL OR customer_window_end ~ '^([01]\d|2[0-3]):[0-5]\d$')
      AND (snap_suggested_start IS NULL OR snap_suggested_start ~ '^([01]\d|2[0-3]):[0-5]\d$')
      AND (snap_suggested_end IS NULL OR snap_suggested_end ~ '^([01]\d|2[0-3]):[0-5]\d$')
    )
);

CREATE INDEX IF NOT EXISTS customers_geocoding_status_idx
  ON public.customers(tenant_id, geocoding_status);
CREATE INDEX IF NOT EXISTS objects_geocoding_status_idx
  ON public.objects(tenant_id, geocoding_status);
CREATE INDEX IF NOT EXISTS personnel_vehicle_type_idx
  ON public.personnel(tenant_id, vehicle_type);

CREATE UNIQUE INDEX IF NOT EXISTS assignment_route_cache_unique_idx
  ON public.assignment_route_cache(tenant_id, provider, vehicle_type, origin_hash, destination_hash);
CREATE INDEX IF NOT EXISTS assignment_route_cache_tenant_expires_idx
  ON public.assignment_route_cache(tenant_id, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS assignment_route_contexts_assignment_personnel_day_idx
  ON public.assignment_route_contexts(tenant_id, assignment_id, personnel_id, scheduled_date);
CREATE INDEX IF NOT EXISTS assignment_route_contexts_tenant_day_idx
  ON public.assignment_route_contexts(tenant_id, scheduled_date);
CREATE INDEX IF NOT EXISTS assignment_route_contexts_personnel_day_idx
  ON public.assignment_route_contexts(tenant_id, personnel_id, scheduled_date);
CREATE INDEX IF NOT EXISTS assignment_route_contexts_assignment_idx
  ON public.assignment_route_contexts(assignment_id);
CREATE INDEX IF NOT EXISTS assignment_route_contexts_warning_idx
  ON public.assignment_route_contexts(tenant_id, warning_code);

ALTER TABLE public.assignment_route_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_route_contexts ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.assignment_route_cache FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.assignment_route_contexts FROM anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'assignment_route_cache'
      AND policyname = 'assignment_route_cache_management'
  ) THEN
    CREATE POLICY assignment_route_cache_management
      ON public.assignment_route_cache
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'assignment_route_contexts'
      AND policyname = 'assignment_route_contexts_management'
  ) THEN
    CREATE POLICY assignment_route_contexts_management
      ON public.assignment_route_contexts
      TO authenticated
      USING (is_management())
      WITH CHECK (is_management());
  END IF;
END $$;

COMMENT ON COLUMN public.customers.latitude IS
  'Passive geocoding latitude for future planning day map. Runtime use is server-mediated.';
COMMENT ON COLUMN public.objects.latitude IS
  'Passive geocoding latitude for future planning day map. Object location takes precedence over customer location.';
COMMENT ON COLUMN public.personnel.vehicle_type IS
  'Default vehicle type for future route duration and travel buffer calculations.';
COMMENT ON TABLE public.assignment_route_cache IS
  'Tenant-scoped cached route durations for Fieldgrid planning day map. Direct anon/authenticated Data API privileges are revoked.';
COMMENT ON TABLE public.assignment_route_contexts IS
  'Tenant-scoped per-assignment, per-personnel route contexts for Fieldgrid planning day map. Direct anon/authenticated Data API privileges are revoked.';
