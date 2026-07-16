-- Fieldgrid Phase 2 W02: canonical availability integrity and optimistic versioning.
ALTER TABLE public.availability_windows
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.availability_windows
  DROP CONSTRAINT IF EXISTS availability_windows_day_of_week_check,
  ADD CONSTRAINT availability_windows_day_of_week_check CHECK (day_of_week BETWEEN 0 AND 6),
  DROP CONSTRAINT IF EXISTS availability_windows_time_check,
  ADD CONSTRAINT availability_windows_time_check CHECK (
    start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND start_time < end_time
  );

ALTER TABLE public.availability_day_entries
  DROP CONSTRAINT IF EXISTS availability_day_entries_valid_calendar_date_check,
  ADD CONSTRAINT availability_day_entries_valid_calendar_date_check CHECK (to_char(to_date(date, 'YYYY-MM-DD'), 'YYYY-MM-DD') = date),
  DROP CONSTRAINT IF EXISTS availability_day_entries_time_check,
  ADD CONSTRAINT availability_day_entries_time_check CHECK (
    start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND start_time < end_time
  );

CREATE OR REPLACE FUNCTION public.touch_availability_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS availability_windows_touch_updated_at ON public.availability_windows;
CREATE TRIGGER availability_windows_touch_updated_at
  BEFORE UPDATE ON public.availability_windows
  FOR EACH ROW EXECUTE FUNCTION public.touch_availability_updated_at();

DROP TRIGGER IF EXISTS availability_day_entries_touch_updated_at ON public.availability_day_entries;
CREATE TRIGGER availability_day_entries_touch_updated_at
  BEFORE UPDATE ON public.availability_day_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_availability_updated_at();

ALTER TABLE public.availability_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_day_entries ENABLE ROW LEVEL SECURITY;
