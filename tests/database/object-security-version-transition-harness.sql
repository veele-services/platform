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
CREATE TABLE public.personnel (id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id));
CREATE TABLE public.customers (id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id));
CREATE TABLE public.assignments (id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id));
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource text NOT NULL,
  action text NOT NULL,
  description text,
  UNIQUE (resource, action)
);

\i /tmp/object-security-migration.sql
\i /tmp/object-security-version-transition-fix.sql

INSERT INTO public.tenants(id) VALUES ('11111111-1111-4111-8111-111111111111');
INSERT INTO public.objects(id, tenant_id) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111'
);

INSERT INTO public.object_security_records (
  id, tenant_id, object_id, category, title, encrypted_payload,
  version, generation, status, change_reason, created_by
) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'key_code', 'Version 1', 'ciphertext-v1', 1, 1, 'active', 'initial',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
);

UPDATE public.object_security_records
SET status = 'superseded', revoked_at = now(), revoked_by = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

INSERT INTO public.object_security_records (
  id, tenant_id, object_id, category, title, encrypted_payload,
  version, generation, status, change_reason, supersedes_record_id, created_by
) VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'key_code', 'Version 2', 'ciphertext-v2', 2, 3, 'active', 'rotation',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
);

DO $$
DECLARE old_generation bigint;
DECLARE old_ciphertext text;
DECLARE current_revision bigint;
BEGIN
  SELECT generation, encrypted_payload INTO old_generation, old_ciphertext
  FROM public.object_security_records
  WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  IF old_generation <> 1 OR old_ciphertext <> 'ciphertext-v1' THEN
    RAISE EXCEPTION 'historical cryptographic context changed';
  END IF;
  SELECT generation INTO current_revision
  FROM public.object_security_object_revisions
  WHERE tenant_id = '11111111-1111-4111-8111-111111111111'
    AND object_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  IF current_revision <> 3 THEN RAISE EXCEPTION 'unexpected revision %', current_revision; END IF;
END;
$$;

DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    UPDATE public.object_security_records
    SET encrypted_payload = 'tampered'
    WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  EXCEPTION WHEN others THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'ciphertext mutation was not blocked'; END IF;
END;
$$;
