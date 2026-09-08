-- ============================================================================
-- Fieldflow Calm W00 follow-up: close role-control paths to server-only data.
--
-- The original W00 ACL migration checks effective privileges and PostgreSQL 17
-- SET ROLE reachability. PostgreSQL also lets a member holding ADMIN OPTION
-- re-grant that membership to itself with SET TRUE. This forward-only guard
-- therefore rejects every protected principal that can reach a target owner or
-- privilege through any combination of SET paths and effective ADMIN OPTION
-- edges, including ADMIN held by an INHERIT-reachable bridge role.
--
-- Forward-only rollback reasoning: remove the unsafe role membership or object
-- grant and rerun this migration. If a future reviewed consumer needs access,
-- add a later migration with an explicit tenant-scoped contract; do not weaken
-- or edit this guard.
-- ============================================================================

DO $fieldflow_calm_w00_role_control$
DECLARE
  missing_roles text[];
  missing_tables text[];
  violation record;
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
        'Fieldflow Calm W00 role-control guard requires database roles: %s',
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
        'Fieldflow Calm W00 role-control guard requires ordinary public tables: %s',
        array_to_string(missing_tables, ', ')
      );
  END IF;

  WITH RECURSIVE
    principals AS (
      SELECT
        role_row.oid,
        role_row.rolname::text AS role_name
      FROM pg_catalog.pg_roles role_row
      WHERE role_row.rolname IN ('anon', 'authenticated', 'service_role')
    ),
    controllable_roles(source_oid, source_role, reachable_oid) AS (
      SELECT principal.oid, principal.role_name, principal.oid
      FROM principals principal

      UNION

      SELECT
        controlled.source_oid,
        controlled.source_role,
        next_role.role_oid
      FROM controllable_roles controlled
      CROSS JOIN LATERAL (
        SELECT reachable_role.oid AS role_oid
        FROM pg_catalog.pg_roles reachable_role
        WHERE reachable_role.oid <> controlled.reachable_oid
          AND pg_catalog.pg_has_role(
            controlled.reachable_oid,
            reachable_role.oid,
            'SET'
          )

        UNION

        SELECT membership.roleid
        FROM pg_catalog.pg_auth_members membership
        JOIN pg_catalog.pg_roles administered_role
          ON administered_role.oid = membership.roleid
        WHERE membership.admin_option
          -- PostgreSQL refuses a non-superuser's GRANT of a superuser role.
          -- A SET-capable superuser membership is still found above.
          AND NOT administered_role.rolsuper
          AND pg_catalog.pg_has_role(
            controlled.reachable_oid,
            membership.member,
            'USAGE'
          )
      ) next_role
    ),
    target_tables AS (
      SELECT
        table_row.oid,
        table_row.relname,
        table_row.relowner
      FROM pg_catalog.pg_class table_row
      JOIN pg_catalog.pg_namespace namespace_row
        ON namespace_row.oid = table_row.relnamespace
      WHERE namespace_row.nspname = 'public'
        AND table_row.relname IN ('organization_settings', 'tenant_domains')
        AND table_row.relkind = 'r'
    ),
    target_columns AS (
      SELECT
        target.oid AS table_oid,
        target.relname AS table_name,
        column_row.attnum,
        column_row.attname
      FROM target_tables target
      JOIN pg_catalog.pg_attribute column_row
        ON column_row.attrelid = target.oid
       AND column_row.attnum > 0
       AND NOT column_row.attisdropped
    ),
    owned_sequences AS (
      SELECT DISTINCT
        sequence_relation.oid,
        sequence_namespace.nspname AS schema_name,
        sequence_relation.relname AS sequence_name,
        sequence_relation.relowner
      FROM pg_catalog.pg_depend dependency
      JOIN pg_catalog.pg_class sequence_relation
        ON sequence_relation.oid = dependency.objid
       AND sequence_relation.relkind = 'S'
      JOIN pg_catalog.pg_namespace sequence_namespace
        ON sequence_namespace.oid = sequence_relation.relnamespace
      JOIN target_tables target
        ON target.oid = dependency.refobjid
      WHERE dependency.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
        AND dependency.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
        AND dependency.deptype IN ('a', 'i')
    ),
    violations AS (
      SELECT
        controlled.source_role,
        reachable.rolname::text AS reachable_role,
        CASE WHEN reachable.rolsuper THEN 10 ELSE 20 END AS priority,
        CASE
          WHEN reachable.rolsuper THEN 'superuser'
          ELSE 'BYPASSRLS'
        END AS capability
      FROM controllable_roles controlled
      JOIN pg_catalog.pg_roles reachable
        ON reachable.oid = controlled.reachable_oid
      WHERE controlled.reachable_oid <> controlled.source_oid
        AND (reachable.rolsuper OR reachable.rolbypassrls)

      UNION ALL

      SELECT
        controlled.source_role,
        reachable.rolname::text,
        30,
        pg_catalog.format('target-table owner for public.%I', target.relname)
      FROM controllable_roles controlled
      JOIN pg_catalog.pg_roles reachable
        ON reachable.oid = controlled.reachable_oid
      JOIN target_tables target
        ON target.relowner = controlled.reachable_oid
      WHERE controlled.reachable_oid <> controlled.source_oid

      UNION ALL

      SELECT
        controlled.source_role,
        reachable.rolname::text,
        40,
        pg_catalog.format(
          '%s table privilege on public.%I',
          privilege.privilege_name,
          target.relname
        )
      FROM controllable_roles controlled
      JOIN pg_catalog.pg_roles reachable
        ON reachable.oid = controlled.reachable_oid
      CROSS JOIN target_tables target
      CROSS JOIN unnest(ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
        'REFERENCES', 'TRIGGER', 'MAINTAIN'
      ]::text[]) privilege(privilege_name)
      WHERE controlled.reachable_oid <> controlled.source_oid
        AND pg_catalog.has_table_privilege(
          controlled.reachable_oid,
          target.oid,
          privilege.privilege_name
        )

      UNION ALL

      SELECT
        controlled.source_role,
        reachable.rolname::text,
        50,
        pg_catalog.format(
          '%s column privilege on public.%I.%I',
          privilege.privilege_name,
          target.table_name,
          target.attname
        )
      FROM controllable_roles controlled
      JOIN pg_catalog.pg_roles reachable
        ON reachable.oid = controlled.reachable_oid
      CROSS JOIN target_columns target
      CROSS JOIN unnest(
        ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']::text[]
      ) privilege(privilege_name)
      WHERE controlled.reachable_oid <> controlled.source_oid
        AND pg_catalog.has_column_privilege(
          controlled.reachable_oid,
          target.table_oid,
          target.attnum,
          privilege.privilege_name
        )

      UNION ALL

      SELECT
        controlled.source_role,
        reachable.rolname::text,
        60,
        pg_catalog.format(
          'target-sequence owner for %I.%I',
          target.schema_name,
          target.sequence_name
        )
      FROM controllable_roles controlled
      JOIN pg_catalog.pg_roles reachable
        ON reachable.oid = controlled.reachable_oid
      JOIN owned_sequences target
        ON target.relowner = controlled.reachable_oid
      WHERE controlled.reachable_oid <> controlled.source_oid

      UNION ALL

      SELECT
        controlled.source_role,
        reachable.rolname::text,
        70,
        pg_catalog.format(
          '%s sequence privilege on %I.%I',
          privilege.privilege_name,
          target.schema_name,
          target.sequence_name
        )
      FROM controllable_roles controlled
      JOIN pg_catalog.pg_roles reachable
        ON reachable.oid = controlled.reachable_oid
      CROSS JOIN owned_sequences target
      CROSS JOIN unnest(
        ARRAY['SELECT', 'UPDATE', 'USAGE']::text[]
      ) privilege(privilege_name)
      WHERE controlled.reachable_oid <> controlled.source_oid
        AND pg_catalog.has_sequence_privilege(
          controlled.reachable_oid,
          target.oid,
          privilege.privilege_name
        )
    )
  SELECT
    source_role,
    reachable_role,
    capability
  INTO violation
  FROM violations
  ORDER BY priority, source_role, reachable_role, capability
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = pg_catalog.format(
        'SET/ADMIN-controllable %s role %I remains reachable from %I',
        violation.capability,
        violation.reachable_role,
        violation.source_role
      );
  END IF;
END;
$fieldflow_calm_w00_role_control$;
