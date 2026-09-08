-- ============================================================================
-- Fieldflow Calm W00: server-only organization settings and tenant domains.
--
-- Both tables contain tenant configuration and operational secrets. Fieldgrid
-- reaches them through the database owner from trusted server code, so the
-- browser-facing Supabase roles must have no direct table access. Keep RLS
-- enabled as defense in depth, but deliberately do not FORCE it: the table
-- owner is the supported server-side access path.
--
-- Forward-only rollback reasoning: if a future consumer needs direct access,
-- add a new reviewed migration with an explicit per-table privilege and a
-- tenant-scoped policy for that consumer. Do not restore broad schema or
-- default privileges.
-- ============================================================================

DO $$
DECLARE
  missing_roles text[];
  missing_tables text[];
  missing_tenant_columns text[];
BEGIN
  SELECT array_agg(required_role.role_name ORDER BY required_role.role_name)
  INTO missing_roles
  FROM (
    VALUES ('anon'), ('authenticated'), ('service_role')
  ) AS required_role(role_name)
  LEFT JOIN pg_catalog.pg_roles role_row
    ON role_row.rolname = required_role.role_name
  WHERE role_row.oid IS NULL;

  IF missing_roles IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42704',
      MESSAGE = format(
        'Fieldflow Calm W00 ACL hardening requires database roles: %s',
        array_to_string(missing_roles, ', ')
      );
  END IF;

  SELECT array_agg(required_table.table_name ORDER BY required_table.table_name)
  INTO missing_tables
  FROM (
    VALUES ('organization_settings'), ('tenant_domains')
  ) AS required_table(table_name)
  LEFT JOIN pg_catalog.pg_class table_row
    ON table_row.oid = pg_catalog.to_regclass(
      pg_catalog.format('public.%I', required_table.table_name)
    )
   AND table_row.relkind = 'r'
  WHERE table_row.oid IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = format(
        'Fieldflow Calm W00 ACL hardening requires ordinary public tables: %s',
        array_to_string(missing_tables, ', ')
      );
  END IF;

  SELECT array_agg(required_table.table_name ORDER BY required_table.table_name)
  INTO missing_tenant_columns
  FROM (
    VALUES ('organization_settings'), ('tenant_domains')
  ) AS required_table(table_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute column_row
    WHERE column_row.attrelid = pg_catalog.to_regclass(
        pg_catalog.format('public.%I', required_table.table_name)
      )
      AND column_row.attname = 'tenant_id'
      AND column_row.attnum > 0
      AND NOT column_row.attisdropped
  );

  IF missing_tenant_columns IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42703',
      MESSAGE = format(
        'Fieldflow Calm W00 ACL hardening requires tenant_id on: %s',
        array_to_string(missing_tenant_columns, ', ')
      );
  END IF;
END;
$$;

ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_settings NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_domains NO FORCE ROW LEVEL SECURITY;

-- Historical deployments can contain policy names that are absent from the
-- current migration history. Remove the effective set by catalog identity,
-- scoped to these two public tables only.
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT
      namespace_row.nspname AS schema_name,
      table_row.relname AS table_name,
      policy.polname AS policy_name
    FROM pg_catalog.pg_policy policy
    JOIN pg_catalog.pg_class table_row
      ON table_row.oid = policy.polrelid
    JOIN pg_catalog.pg_namespace namespace_row
      ON namespace_row.oid = table_row.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND table_row.relname IN ('organization_settings', 'tenant_domains')
    ORDER BY table_row.relname, policy.polname
  LOOP
    EXECUTE pg_catalog.format(
      'DROP POLICY %I ON %I.%I',
      policy_row.policy_name,
      policy_row.schema_name,
      policy_row.table_name
    );
  END LOOP;
END;
$$;

-- A table-level revoke also removes corresponding column privileges in
-- PostgreSQL. CASCADE closes grants derived from these four principals.
REVOKE ALL PRIVILEGES
ON TABLE public.organization_settings, public.tenant_domains
FROM PUBLIC, anon, authenticated, service_role
CASCADE;

-- Revoke only sequences that PostgreSQL records as owned by a column of one of
-- the two target tables. Never touch unrelated sequences in the shared schema.
DO $$
DECLARE
  sequence_row record;
BEGIN
  FOR sequence_row IN
    SELECT DISTINCT
      sequence_namespace.nspname AS schema_name,
      sequence_relation.relname AS sequence_name
    FROM pg_catalog.pg_depend dependency
    JOIN pg_catalog.pg_class sequence_relation
      ON sequence_relation.oid = dependency.objid
     AND sequence_relation.relkind = 'S'
    JOIN pg_catalog.pg_namespace sequence_namespace
      ON sequence_namespace.oid = sequence_relation.relnamespace
    JOIN pg_catalog.pg_class owning_table
      ON owning_table.oid = dependency.refobjid
    JOIN pg_catalog.pg_namespace table_namespace
      ON table_namespace.oid = owning_table.relnamespace
    WHERE dependency.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
      AND dependency.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
      AND dependency.deptype IN ('a', 'i')
      AND table_namespace.nspname = 'public'
      AND owning_table.relname IN ('organization_settings', 'tenant_domains')
    ORDER BY sequence_namespace.nspname, sequence_relation.relname
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM PUBLIC, anon, authenticated, service_role CASCADE',
      sequence_row.schema_name,
      sequence_row.sequence_name
    );
  END LOOP;
END;
$$;

-- Fail the migration if the requested end state was not reached. This catches
-- indirect role grants as well as unexpected catalog drift.
DO $$
DECLARE
  target_table record;
  target_column record;
  target_sequence record;
  target_role name;
  target_role_row record;
  settable_role record;
  privilege_name text;
  target_role_oids oid[];
BEGIN
  SELECT array_agg(role_row.oid ORDER BY role_row.rolname)
  INTO target_role_oids
  FROM pg_catalog.pg_roles role_row
  WHERE role_row.rolname IN ('anon', 'authenticated', 'service_role');

  FOR target_table IN
    SELECT
      table_row.oid AS table_oid,
      table_row.relname AS table_name,
      table_row.relowner AS owner_oid,
      table_row.relacl,
      table_row.relrowsecurity,
      table_row.relforcerowsecurity
    FROM pg_catalog.pg_class table_row
    JOIN pg_catalog.pg_namespace namespace_row
      ON namespace_row.oid = table_row.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND table_row.relname IN ('organization_settings', 'tenant_domains')
    ORDER BY table_row.relname
  LOOP
    IF NOT target_table.relrowsecurity OR target_table.relforcerowsecurity THEN
      RAISE EXCEPTION 'Unexpected RLS flags for public.%', target_table.table_name;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(target_table.relacl) acl
      WHERE acl.grantee = 0
         OR acl.grantee = ANY(target_role_oids)
    ) THEN
      RAISE EXCEPTION 'Direct table ACL remains on public.%', target_table.table_name;
    END IF;

    FOR privilege_name IN
      SELECT DISTINCT owner_acl.privilege_type
      FROM pg_catalog.aclexplode(
        pg_catalog.acldefault('r', target_table.owner_oid)
      ) owner_acl
      ORDER BY owner_acl.privilege_type
    LOOP
      FOREACH target_role IN ARRAY ARRAY['anon'::name, 'authenticated'::name, 'service_role'::name]
      LOOP
        IF pg_catalog.has_table_privilege(
          target_role,
          target_table.table_oid,
          privilege_name
        ) THEN
          RAISE EXCEPTION
            'Effective % table privilege remains for % on public.%',
            privilege_name,
            target_role,
            target_table.table_name;
        END IF;
      END LOOP;
    END LOOP;

    FOR target_column IN
      SELECT column_row.attnum, column_row.attname, column_row.attacl
      FROM pg_catalog.pg_attribute column_row
      WHERE column_row.attrelid = target_table.table_oid
        AND column_row.attnum > 0
        AND NOT column_row.attisdropped
      ORDER BY column_row.attnum
    LOOP
      IF EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(target_column.attacl) acl
        WHERE acl.grantee = 0
           OR acl.grantee = ANY(target_role_oids)
      ) THEN
        RAISE EXCEPTION
          'Direct column ACL remains on public.%.%',
          target_table.table_name,
          target_column.attname;
      END IF;

      FOREACH target_role IN ARRAY ARRAY['anon'::name, 'authenticated'::name, 'service_role'::name]
      LOOP
        FOREACH privilege_name IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']
        LOOP
          IF pg_catalog.has_column_privilege(
            target_role,
            target_table.table_oid,
            target_column.attnum,
            privilege_name
          ) THEN
            RAISE EXCEPTION
              'Effective % column privilege remains for % on public.%.%',
              privilege_name,
              target_role,
              target_table.table_name,
              target_column.attname;
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;

    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_policy policy
      WHERE policy.polrelid = target_table.table_oid
    ) THEN
      RAISE EXCEPTION 'RLS policy remains on public.%', target_table.table_name;
    END IF;
  END LOOP;

  FOR target_sequence IN
    SELECT DISTINCT
      sequence_relation.oid AS sequence_oid,
      sequence_namespace.nspname AS schema_name,
      sequence_relation.relname AS sequence_name,
      sequence_relation.relacl
    FROM pg_catalog.pg_depend dependency
    JOIN pg_catalog.pg_class sequence_relation
      ON sequence_relation.oid = dependency.objid
     AND sequence_relation.relkind = 'S'
    JOIN pg_catalog.pg_namespace sequence_namespace
      ON sequence_namespace.oid = sequence_relation.relnamespace
    JOIN pg_catalog.pg_class owning_table
      ON owning_table.oid = dependency.refobjid
    JOIN pg_catalog.pg_namespace table_namespace
      ON table_namespace.oid = owning_table.relnamespace
    WHERE dependency.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
      AND dependency.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
      AND dependency.deptype IN ('a', 'i')
      AND table_namespace.nspname = 'public'
      AND owning_table.relname IN ('organization_settings', 'tenant_domains')
    ORDER BY sequence_namespace.nspname, sequence_relation.relname
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(target_sequence.relacl) acl
      WHERE acl.grantee = 0
         OR acl.grantee = ANY(target_role_oids)
    ) THEN
      RAISE EXCEPTION
        'Direct sequence ACL remains on %.%',
        target_sequence.schema_name,
        target_sequence.sequence_name;
    END IF;

    FOREACH target_role IN ARRAY ARRAY['anon'::name, 'authenticated'::name, 'service_role'::name]
    LOOP
      FOREACH privilege_name IN ARRAY ARRAY['SELECT', 'UPDATE', 'USAGE']
      LOOP
        IF pg_catalog.has_sequence_privilege(
          target_role,
          target_sequence.sequence_oid,
          privilege_name
        ) THEN
          RAISE EXCEPTION
            'Effective % sequence privilege remains for % on %.%',
            privilege_name,
            target_role,
            target_sequence.schema_name,
            target_sequence.sequence_name;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  -- PostgreSQL 17 separates immediately inherited privileges (USAGE) from
  -- roles that a principal can assume with SET ROLE. The has_*_privilege
  -- checks above intentionally validate the direct/inherited state after the
  -- targeted REVOKE. Validate every transitive SET-capable role separately so
  -- WITH INHERIT FALSE, SET TRUE cannot reach a target owner, an RLS-bypassing
  -- role, a superuser, or target object privileges. PUBLIC is not a pg_roles
  -- identity and PostgreSQL does not permit role membership grants to PUBLIC;
  -- its complete exposure surface is covered by the direct ACL checks above.
  FOR target_role_row IN
    SELECT role_row.oid AS role_oid, role_row.rolname AS role_name
    FROM pg_catalog.pg_roles role_row
    WHERE role_row.rolname IN ('anon', 'authenticated', 'service_role')
    ORDER BY role_row.rolname
  LOOP
    FOR settable_role IN
      SELECT
        role_row.oid AS role_oid,
        role_row.rolname AS role_name,
        role_row.rolsuper,
        role_row.rolbypassrls
      FROM pg_catalog.pg_roles role_row
      WHERE role_row.oid <> target_role_row.role_oid
        AND pg_catalog.pg_has_role(
          target_role_row.role_oid,
          role_row.oid,
          'SET'
        )
      ORDER BY role_row.rolname
    LOOP
      IF settable_role.rolsuper THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = format(
            'SET-capable superuser role %s remains reachable from %s',
            settable_role.role_name,
            target_role_row.role_name
          );
      END IF;

      IF settable_role.rolbypassrls THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = format(
            'SET-capable BYPASSRLS role %s remains reachable from %s',
            settable_role.role_name,
            target_role_row.role_name
          );
      END IF;

      FOR target_table IN
        SELECT
          table_row.oid AS table_oid,
          table_row.relname AS table_name,
          table_row.relowner AS owner_oid
        FROM pg_catalog.pg_class table_row
        JOIN pg_catalog.pg_namespace namespace_row
          ON namespace_row.oid = table_row.relnamespace
        WHERE namespace_row.nspname = 'public'
          AND table_row.relname IN ('organization_settings', 'tenant_domains')
        ORDER BY table_row.relname
      LOOP
        IF target_table.owner_oid = settable_role.role_oid THEN
          RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = format(
              'SET-capable target-table owner %s remains reachable from %s for public.%s',
              settable_role.role_name,
              target_role_row.role_name,
              target_table.table_name
            );
        END IF;

        FOREACH privilege_name IN ARRAY ARRAY[
          'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
          'REFERENCES', 'TRIGGER', 'MAINTAIN'
        ]
        LOOP
          IF pg_catalog.has_table_privilege(
            settable_role.role_oid,
            target_table.table_oid,
            privilege_name
          ) THEN
            RAISE EXCEPTION USING
              ERRCODE = '42501',
              MESSAGE = format(
                'SET-capable %s table privilege via role %s remains reachable from %s on public.%s',
                privilege_name,
                settable_role.role_name,
                target_role_row.role_name,
                target_table.table_name
              );
          END IF;
        END LOOP;

        FOR target_column IN
          SELECT column_row.attnum, column_row.attname
          FROM pg_catalog.pg_attribute column_row
          WHERE column_row.attrelid = target_table.table_oid
            AND column_row.attnum > 0
            AND NOT column_row.attisdropped
          ORDER BY column_row.attnum
        LOOP
          FOREACH privilege_name IN ARRAY ARRAY[
            'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'
          ]
          LOOP
            IF pg_catalog.has_column_privilege(
              settable_role.role_oid,
              target_table.table_oid,
              target_column.attnum,
              privilege_name
            ) THEN
              RAISE EXCEPTION USING
                ERRCODE = '42501',
                MESSAGE = format(
                  'SET-capable %s column privilege via role %s remains reachable from %s on public.%s.%s',
                  privilege_name,
                  settable_role.role_name,
                  target_role_row.role_name,
                  target_table.table_name,
                  target_column.attname
                );
            END IF;
          END LOOP;
        END LOOP;
      END LOOP;

      FOR target_sequence IN
        SELECT DISTINCT
          sequence_relation.oid AS sequence_oid,
          sequence_namespace.nspname AS schema_name,
          sequence_relation.relname AS sequence_name,
          sequence_relation.relowner AS owner_oid
        FROM pg_catalog.pg_depend dependency
        JOIN pg_catalog.pg_class sequence_relation
          ON sequence_relation.oid = dependency.objid
         AND sequence_relation.relkind = 'S'
        JOIN pg_catalog.pg_namespace sequence_namespace
          ON sequence_namespace.oid = sequence_relation.relnamespace
        JOIN pg_catalog.pg_class owning_table
          ON owning_table.oid = dependency.refobjid
        JOIN pg_catalog.pg_namespace table_namespace
          ON table_namespace.oid = owning_table.relnamespace
        WHERE dependency.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
          AND dependency.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
          AND dependency.deptype IN ('a', 'i')
          AND table_namespace.nspname = 'public'
          AND owning_table.relname IN ('organization_settings', 'tenant_domains')
        ORDER BY sequence_namespace.nspname, sequence_relation.relname
      LOOP
        IF target_sequence.owner_oid = settable_role.role_oid THEN
          RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = format(
              'SET-capable target-sequence owner %s remains reachable from %s for %s.%s',
              settable_role.role_name,
              target_role_row.role_name,
              target_sequence.schema_name,
              target_sequence.sequence_name
            );
        END IF;

        FOREACH privilege_name IN ARRAY ARRAY['SELECT', 'UPDATE', 'USAGE']
        LOOP
          IF pg_catalog.has_sequence_privilege(
            settable_role.role_oid,
            target_sequence.sequence_oid,
            privilege_name
          ) THEN
            RAISE EXCEPTION USING
              ERRCODE = '42501',
              MESSAGE = format(
                'SET-capable %s sequence privilege via role %s remains reachable from %s on %s.%s',
                privilege_name,
                settable_role.role_name,
                target_role_row.role_name,
                target_sequence.schema_name,
                target_sequence.sequence_name
              );
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;
