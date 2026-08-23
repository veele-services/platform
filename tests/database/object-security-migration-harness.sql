\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$$;

CREATE TABLE public.tenants (id uuid PRIMARY KEY);
CREATE TABLE public.objects (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  is_active boolean NOT NULL DEFAULT true,
  access_info text,
  key_info text,
  alarm_info text
);
CREATE TABLE public.personnel (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id)
);
CREATE TABLE public.customers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id)
);
CREATE TABLE public.assignments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id)
);
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource text NOT NULL,
  action text NOT NULL,
  description text,
  UNIQUE (resource, action)
);

\i /tmp/object-security-migration.sql

INSERT INTO public.tenants(id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
INSERT INTO public.objects(id, tenant_id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111');
INSERT INTO public.personnel(id, tenant_id) VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222');
INSERT INTO public.assignments(id, tenant_id) VALUES
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111');

INSERT INTO public.object_security_records (
  id, tenant_id, object_id, category, title, encrypted_payload,
  version, generation, status, change_reason, created_by
) VALUES (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'access_instructions', 'Test', 'ciphertext', 1, 1, 'active', 'test',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
);

DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.object_security_records (
      tenant_id, object_id, category, title, encrypted_payload,
      version, generation, status, change_reason, created_by
    ) VALUES (
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'key_code', 'Test 2', 'ciphertext', 1, 1, 'draft', 'test',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    );
  EXCEPTION WHEN others THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'same-generation write was not blocked';
  END IF;
END;
$$;

DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.objects
    SET access_info = 'plaintext'
    WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  EXCEPTION WHEN others THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'legacy plaintext write was not blocked';
  END IF;
END;
$$;

DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.object_security_challenges (
      tenant_id, user_id, personnel_id, object_id, assignment_id,
      access_path, business_email_revision, expires_at, resend_after
    ) VALUES (
      '11111111-1111-4111-8111-111111111111',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'personnel', repeat('a', 64), now() + interval '10 minutes', now()
    );
  EXCEPTION WHEN foreign_key_violation THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'cross-tenant personnel relation was not blocked';
  END IF;
END;
$$;

DO $$
DECLARE revision bigint;
DECLARE rls_enabled boolean;
BEGIN
  SELECT generation INTO revision
  FROM public.object_security_object_revisions
  WHERE tenant_id = '11111111-1111-4111-8111-111111111111'
    AND object_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  IF revision <> 1 THEN
    RAISE EXCEPTION 'unexpected object security revision: %', revision;
  END IF;
  SELECT relrowsecurity INTO rls_enabled
  FROM pg_class
  WHERE oid = 'public.object_security_records'::regclass;
  IF NOT rls_enabled THEN
    RAISE EXCEPTION 'RLS is not enabled';
  END IF;
END;
$$;
