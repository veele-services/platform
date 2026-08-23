\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$$;

CREATE TABLE public.tenants (id uuid PRIMARY KEY);
CREATE TABLE public.tenant_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  user_id uuid NOT NULL,
  UNIQUE (tenant_id, user_id)
);
CREATE TABLE public.personnel (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  code text NOT NULL,
  UNIQUE (tenant_id, id)
);
CREATE TABLE public.customers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  code text NOT NULL,
  UNIQUE (tenant_id, id)
);
CREATE TABLE public.objects (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  code text NOT NULL,
  UNIQUE (tenant_id, id)
);
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource text NOT NULL,
  action text NOT NULL,
  description text,
  UNIQUE (resource, action)
);

INSERT INTO public.tenants(id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
INSERT INTO public.tenant_users(tenant_id, user_id) VALUES
  ('11111111-1111-4111-8111-111111111111', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  ('22222222-2222-4222-8222-222222222222', 'ffffffff-ffff-4fff-8fff-ffffffffffff');
INSERT INTO public.personnel(id, tenant_id, code) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', '0001');
INSERT INTO public.customers(id, tenant_id, code) VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', '0001');
INSERT INTO public.objects(id, tenant_id, code) VALUES
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', '0001');

\i /tmp/dossier360-common-migration.sql

DO $$
DECLARE profile_count integer;
BEGIN
  SELECT count(*) INTO profile_count FROM public.dossier_profiles
  WHERE tenant_id = '11111111-1111-4111-8111-111111111111';
  IF profile_count <> 3 THEN RAISE EXCEPTION 'expected three backfilled profiles, found %', profile_count; END IF;
END;
$$;

INSERT INTO public.personnel(id, tenant_id, code) VALUES
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '22222222-2222-4222-8222-222222222222', '0002');

DO $$
DECLARE profile_count integer;
BEGIN
  SELECT count(*) INTO profile_count FROM public.dossier_profiles
  WHERE personnel_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  IF profile_count <> 1 THEN RAISE EXCEPTION 'insert trigger did not create exactly one profile'; END IF;
END;
$$;

DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.dossier_profiles(
      tenant_id, subject_type, personnel_id, customer_id, dossier_number
    ) VALUES (
      '11111111-1111-4111-8111-111111111111', 'personnel',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'INVALID-1'
    );
  EXCEPTION WHEN check_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'multiple subjects were not blocked'; END IF;
END;
$$;

DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.dossier_profiles
    SET manager_user_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    WHERE personnel_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  EXCEPTION WHEN foreign_key_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'cross-tenant manager was not blocked'; END IF;
END;
$$;

INSERT INTO public.dossier_notes(
  tenant_id, dossier_profile_id, content, created_by
)
SELECT tenant_id, id, 'Immutable test note', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
FROM public.dossier_profiles
WHERE personnel_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.dossier_notes SET content = 'tampered';
  EXCEPTION WHEN others THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'note mutation was not blocked'; END IF;
END;
$$;

UPDATE public.dossier_profiles
SET legal_hold_at = now(),
    legal_hold_by = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    legal_hold_reason = 'Test hold'
WHERE customer_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    DELETE FROM public.dossier_profiles
    WHERE customer_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  EXCEPTION WHEN others THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'legal hold deletion was not blocked'; END IF;
END;
$$;

DO $$
DECLARE rls_count integer;
BEGIN
  SELECT count(*) INTO rls_count
  FROM pg_class
  WHERE oid IN (
    'public.dossier_profiles'::regclass,
    'public.dossier_notes'::regclass,
    'public.dossier_tasks'::regclass,
    'public.dossier_events'::regclass
  ) AND relrowsecurity;
  IF rls_count <> 4 THEN RAISE EXCEPTION 'RLS missing from common dossier tables'; END IF;
END;
$$;

DO $$
DECLARE profile_id uuid;
DECLARE affected integer;
DECLARE current_version integer;
BEGIN
  SELECT id INTO profile_id FROM public.dossier_profiles
  WHERE object_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  UPDATE public.dossier_profiles SET status = 'attention'
  WHERE id = profile_id AND record_version = 1;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'first optimistic update failed'; END IF;
  SELECT record_version INTO current_version FROM public.dossier_profiles WHERE id = profile_id;
  IF current_version <> 2 THEN RAISE EXCEPTION 'record version was not bumped'; END IF;
  UPDATE public.dossier_profiles SET status = 'active'
  WHERE id = profile_id AND record_version = 1;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'stale optimistic update was not blocked'; END IF;
END;
$$;
