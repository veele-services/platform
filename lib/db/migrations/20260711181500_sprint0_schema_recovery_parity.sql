-- ============================================================================
-- Sprint 0 schema recovery parity
--
-- Makes a clean Fieldgrid database reconstruct the current runtime schema while
-- safely normalizing legacy staging objects. Existing business rows are kept.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Object primary-contact columns exist in the current Drizzle schema and live
-- staging database, but were never added by a forward migration.
-- ---------------------------------------------------------------------------

ALTER TABLE public.objects
  ADD COLUMN IF NOT EXISTS contact_name varchar(200),
  ADD COLUMN IF NOT EXISTS contact_function varchar(100),
  ADD COLUMN IF NOT EXISTS contact_phone varchar(50),
  ADD COLUMN IF NOT EXISTS contact_email varchar(255);

-- ---------------------------------------------------------------------------
-- Legacy generic code sequences still provide customer, personnel and quote
-- numbers. Keep the complete historical shape so an existing backup can be
-- restored without losing code sequence rows.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.code_sequences (
  entity text PRIMARY KEY,
  prefix text NOT NULL,
  last_value bigint NOT NULL DEFAULT 0,
  padding integer NOT NULL DEFAULT 4
);

ALTER TABLE public.code_sequences ENABLE ROW LEVEL SECURITY;

WITH sequence_seed (
  entity,
  prefix,
  padding,
  observed_last_value
) AS (
  SELECT
    'assignments',
    'OPD',
    3,
    COALESCE(
      max(
        CASE
          WHEN code ~ '^OPD-[0-9]+$'
            THEN substring(code FROM '([0-9]+)$')::bigint
          ELSE NULL
        END
      ),
      0
    )
  FROM public.assignments

  UNION ALL

  SELECT
    'customers',
    'KLA',
    3,
    COALESCE(
      max(
        CASE
          WHEN code ~ '^KLA-[0-9]+$'
            THEN substring(code FROM '([0-9]+)$')::bigint
          ELSE NULL
        END
      ),
      0
    )
  FROM public.customers

  UNION ALL

  SELECT
    'invoices',
    'FACT',
    4,
    COALESCE(
      max(
        CASE
          WHEN invoice_number ~ '^FACT-[0-9]{4}-[0-9]+$'
            THEN substring(invoice_number FROM '([0-9]+)$')::bigint
          ELSE NULL
        END
      ),
      0
    )
  FROM public.invoices

  UNION ALL

  SELECT
    'objects',
    'OBJ',
    3,
    COALESCE(
      max(
        CASE
          WHEN code ~ '^OBJ-[0-9]+$'
            THEN substring(code FROM '([0-9]+)$')::bigint
          ELSE NULL
        END
      ),
      0
    )
  FROM public.objects

  UNION ALL

  SELECT
    'personnel',
    'MED',
    3,
    COALESCE(
      max(
        CASE
          WHEN code ~ '^MED-[0-9]+$'
            THEN substring(code FROM '([0-9]+)$')::bigint
          ELSE NULL
        END
      ),
      0
    )
  FROM public.personnel

  UNION ALL

  SELECT
    'quotes',
    'OFF',
    4,
    COALESCE(
      max(
        CASE
          WHEN quote_number ~ '^OFF-[0-9]{4}-[0-9]+$'
            THEN substring(quote_number FROM '([0-9]+)$')::bigint
          ELSE NULL
        END
      ),
      0
    )
  FROM public.quotes
)
INSERT INTO public.code_sequences (
  entity,
  prefix,
  last_value,
  padding
)
SELECT
  entity,
  prefix,
  observed_last_value,
  padding
FROM sequence_seed
ON CONFLICT (entity) DO UPDATE
SET
  prefix = excluded.prefix,
  padding = excluded.padding,
  last_value = greatest(
    public.code_sequences.last_value,
    excluded.last_value
  );

CREATE OR REPLACE FUNCTION public.next_entity_code(
  p_entity text
)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
  v_prefix text;
  v_padding integer;
  v_next_value bigint;
BEGIN
  UPDATE public.code_sequences
  SET last_value = last_value + 1
  WHERE entity = p_entity
  RETURNING
    prefix,
    last_value,
    padding
  INTO
    v_prefix,
    v_next_value,
    v_padding;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Unknown code sequence entity: %',
      p_entity;
  END IF;

  RETURN
    v_prefix || '-' ||
    lpad(v_next_value::text, v_padding, '0');
END;
$function$;

-- ---------------------------------------------------------------------------
-- Customer codes.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_customers_set_code()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    NEW.code := public.next_entity_code('customers');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS customers_set_code
  ON public.customers;

CREATE TRIGGER customers_set_code
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_customers_set_code();

-- ---------------------------------------------------------------------------
-- Personnel codes.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_personnel_set_code()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    NEW.code := public.next_entity_code('personnel');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS personnel_set_code
  ON public.personnel;

CREATE TRIGGER personnel_set_code
  BEFORE INSERT ON public.personnel
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_personnel_set_code();

-- ---------------------------------------------------------------------------
-- Canonical object numbering.
--
-- Current object codes use objects_code_seq and trigger trg_objects_set_code.
-- Remove the older duplicate trigger that still calls next_entity_code.
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS public.objects_code_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1;

DO $block$
DECLARE
  observed_max bigint;
  sequence_value bigint;
  sequence_called boolean;
  safe_value bigint;
BEGIN
  SELECT
    COALESCE(
      max(
        CASE
          WHEN code ~ '^OBJ-[0-9]+$'
            THEN substring(code FROM '([0-9]+)$')::bigint
          ELSE NULL
        END
      ),
      0
    )
  INTO observed_max
  FROM public.objects;

  SELECT
    last_value,
    is_called
  INTO
    sequence_value,
    sequence_called
  FROM public.objects_code_seq;

  safe_value := greatest(
    observed_max,
    CASE
      WHEN sequence_called THEN sequence_value
      ELSE 0
    END
  );

  IF safe_value <= 0 THEN
    PERFORM setval(
      'public.objects_code_seq'::regclass,
      1,
      false
    );
  ELSE
    PERFORM setval(
      'public.objects_code_seq'::regclass,
      safe_value,
      true
    );
  END IF;
END;
$block$;

CREATE OR REPLACE FUNCTION public.set_object_code()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    NEW.code :=
      'OBJ-' ||
      lpad(
        nextval(
          'public.objects_code_seq'::regclass
        )::text,
        5,
        '0'
      );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS objects_set_code
  ON public.objects;

DROP TRIGGER IF EXISTS trg_objects_set_code
  ON public.objects;

DROP FUNCTION IF EXISTS public.trg_objects_set_code();

CREATE TRIGGER trg_objects_set_code
  BEFORE INSERT ON public.objects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_object_code();

-- ---------------------------------------------------------------------------
-- Quote numbering is still trigger-based in the current quote canon.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_quotes_set_number()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_year text;
  v_sequence bigint;
  v_padding integer;
BEGIN
  IF NEW.quote_number IS NULL
     OR btrim(NEW.quote_number) = '' THEN

    v_year := extract(year FROM now())::text;

    UPDATE public.code_sequences
    SET last_value = last_value + 1
    WHERE entity = 'quotes'
    RETURNING
      last_value,
      padding
    INTO
      v_sequence,
      v_padding;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Quote code sequence is missing';
    END IF;

    NEW.quote_number :=
      'OFF-' ||
      v_year ||
      '-' ||
      lpad(v_sequence::text, v_padding, '0');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS quotes_set_number
  ON public.quotes;

CREATE TRIGGER quotes_set_number
  BEFORE INSERT ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_quotes_set_number();

-- ---------------------------------------------------------------------------
-- Remove the legacy invoice trigger. Invoice numbers are now allocated by the
-- tenant-scoped invoice finalization and invoice_number_sequences engine.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS invoices_set_number
  ON public.invoices;

DROP TRIGGER IF EXISTS trg_invoices_set_number
  ON public.invoices;

DROP FUNCTION IF EXISTS public.trg_invoices_set_number();

-- ---------------------------------------------------------------------------
-- Normalize legacy platform_users columns to the current Drizzle canon.
-- ---------------------------------------------------------------------------

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.platform_users
    WHERE role IS NULL
       OR length(role) > 40
       OR role NOT IN (
         'owner',
         'admin',
         'support'
       )
  ) THEN
    RAISE EXCEPTION
      'platform_users.role contains values that cannot be canonicalized';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.platform_users
    WHERE status IS NULL
       OR length(status) > 30
       OR status NOT IN (
         'active',
         'inactive',
         'suspended'
       )
  ) THEN
    RAISE EXCEPTION
      'platform_users.status contains values that cannot be canonicalized';
  END IF;
END;
$block$;

ALTER TABLE public.platform_users
  ALTER COLUMN role TYPE varchar(40)
    USING role::varchar(40),
  ALTER COLUMN role SET DEFAULT 'support',
  ALTER COLUMN role SET NOT NULL,
  ALTER COLUMN status TYPE varchar(30)
    USING status::varchar(30),
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Remove defaults that no longer exist in the current application canon.
-- ---------------------------------------------------------------------------

ALTER TABLE public.leave_periods
  ALTER COLUMN leave_type DROP DEFAULT;

ALTER TABLE public.quotes
  ALTER COLUMN quote_number DROP DEFAULT;
