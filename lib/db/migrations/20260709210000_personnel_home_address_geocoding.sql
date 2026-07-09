-- Personnel home address geocoding for planning route origins.
--
-- The existing address fields remain nullable. These columns store the
-- geocoded home coordinates used as the first route origin on the planning map.

ALTER TABLE public.personnel
  ADD COLUMN IF NOT EXISTS address_latitude numeric(9, 6),
  ADD COLUMN IF NOT EXISTS address_longitude numeric(9, 6),
  ADD COLUMN IF NOT EXISTS address_geocoded_at timestamptz,
  ADD COLUMN IF NOT EXISTS address_geocoding_provider varchar(40),
  ADD COLUMN IF NOT EXISTS address_geocoding_status varchar(30) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS address_geocoding_confidence numeric(5, 2),
  ADD COLUMN IF NOT EXISTS address_geocoding_error text;

UPDATE public.personnel
SET address_geocoding_status = CASE
  WHEN address_latitude IS NOT NULL AND address_longitude IS NOT NULL THEN 'geocoded'
  WHEN coalesce(nullif(trim(address_street), ''), nullif(trim(address_postal_code), ''), nullif(trim(address_city), '')) IS NULL THEN 'not_required'
  ELSE coalesce(address_geocoding_status, 'pending')
END
WHERE address_geocoding_status IS NULL
   OR address_geocoding_status = 'pending';

ALTER TABLE public.personnel
  ALTER COLUMN address_geocoding_status SET DEFAULT 'pending',
  ALTER COLUMN address_geocoding_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personnel_address_geocoding_status_check') THEN
    ALTER TABLE public.personnel
      ADD CONSTRAINT personnel_address_geocoding_status_check
      CHECK (address_geocoding_status IN ('pending', 'geocoded', 'failed', 'manual', 'not_required'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personnel_address_latitude_longitude_check') THEN
    ALTER TABLE public.personnel
      ADD CONSTRAINT personnel_address_latitude_longitude_check
      CHECK (
        (address_latitude IS NULL OR (address_latitude >= -90 AND address_latitude <= 90))
        AND (address_longitude IS NULL OR (address_longitude >= -180 AND address_longitude <= 180))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personnel_address_geocoding_confidence_check') THEN
    ALTER TABLE public.personnel
      ADD CONSTRAINT personnel_address_geocoding_confidence_check
      CHECK (
        address_geocoding_confidence IS NULL
        OR (address_geocoding_confidence >= 0 AND address_geocoding_confidence <= 100)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS personnel_home_location_idx
  ON public.personnel(tenant_id, address_latitude, address_longitude)
  WHERE address_latitude IS NOT NULL AND address_longitude IS NOT NULL;

COMMENT ON COLUMN public.personnel.address_latitude IS
  'Latitude of the personnel home address, used as the first planning route origin.';
COMMENT ON COLUMN public.personnel.address_longitude IS
  'Longitude of the personnel home address, used as the first planning route origin.';
