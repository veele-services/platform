-- Give every tenant one stable six-character routing code for the generic
-- Fieldgrid Personnel app. The code selects tenant context; it is not an
-- authentication credential and never replaces user authentication.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS personnel_login_code varchar(6);

CREATE OR REPLACE FUNCTION public.fieldgrid_generate_personnel_login_code()
RETURNS varchar
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, public
AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  entropy bytea;
  candidate text;
  character_index integer;
BEGIN
  LOOP
    entropy := uuid_send(gen_random_uuid());
    candidate := '';

    FOR character_index IN 0..5 LOOP
      candidate := candidate || substr(
        alphabet,
        1 + (get_byte(entropy, character_index) % length(alphabet)),
        1
      );
    END LOOP;

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.tenants
      WHERE personnel_login_code = candidate
    );
  END LOOP;

  RETURN candidate::varchar;
END
$$;

REVOKE ALL ON FUNCTION public.fieldgrid_generate_personnel_login_code()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fieldgrid_generate_personnel_login_code()
  TO service_role;

DO $$
DECLARE
  tenant_record record;
BEGIN
  FOR tenant_record IN
    SELECT id
    FROM public.tenants
    WHERE personnel_login_code IS NULL
    ORDER BY id
  LOOP
    UPDATE public.tenants
    SET personnel_login_code =
      public.fieldgrid_generate_personnel_login_code()
    WHERE id = tenant_record.id;
  END LOOP;
END
$$;

ALTER TABLE public.tenants
  ALTER COLUMN personnel_login_code
    SET DEFAULT public.fieldgrid_generate_personnel_login_code(),
  ALTER COLUMN personnel_login_code SET NOT NULL;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_personnel_login_code_format_check;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_personnel_login_code_format_check
  CHECK (personnel_login_code ~ '^[A-HJ-NP-Z2-9]{6}$');

CREATE UNIQUE INDEX IF NOT EXISTS tenants_personnel_login_code_idx
  ON public.tenants (personnel_login_code);

COMMENT ON COLUMN public.tenants.personnel_login_code IS
  'Stable unique six-character tenant routing code for the generic personnel app; not an authentication credential.';
