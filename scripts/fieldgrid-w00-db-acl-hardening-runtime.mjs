#!/usr/bin/env node
import nodeAssert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  FIXTURE,
  assert,
  connect,
  repoRoot,
  result,
  writeJsonArtifact,
  writeTextArtifact,
} from "./fieldgrid-runtime-safety-lib.mjs";
import { verifyW00AclClosure } from "./fieldgrid-w00-db-acl-closure.mjs";

const MIGRATION_PATHS = [
  "lib/db/migrations/20260906120000_organization_settings_tenant_domains_acl_hardening.sql",
  "lib/db/migrations/20260906121000_organization_settings_tenant_domains_role_control_guard.sql",
];
const TARGET_TABLES = ["organization_settings", "tenant_domains"];
const CLIENT_ROLES = ["anon", "authenticated", "service_role"];
const APP_OWNER_ROLE = "fieldgrid_runtime_app_owner";
const UNTRUSTED_ROLE = "fieldgrid_runtime_untrusted";
const SET_OWNER_BRIDGE_ROLE = "fieldgrid_runtime_set_owner_bridge";
const SET_BYPASS_BRIDGE_ROLE = "fieldgrid_runtime_set_bypass_bridge";
const SET_BYPASS_OBJECT_ROLE = "fieldgrid_runtime_set_bypass_object";
const INERT_SUPERUSER_ROLE = "fieldgrid_runtime_inert_superuser";
const DEFAULT_ACL_OWNER_ROLE = "fieldgrid_runtime_default_acl_owner";
const UNRELATED_SEQUENCE = "fieldgrid_w00_unrelated_seq";
const TABLE_PRIVILEGES = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
  "MAINTAIN",
];
const COLUMN_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "REFERENCES"];
const SEQUENCE_PRIVILEGES = ["SELECT", "UPDATE", "USAGE"];
const OWNED_SEQUENCES = [
  "fieldgrid_w00_organization_settings_owned_seq",
  "fieldgrid_w00_tenant_domains_owned_seq",
];

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function applyHardeningMigration(client) {
  for (const migrationPath of MIGRATION_PATHS) {
    const sql = await readFile(join(repoRoot, migrationPath), "utf8");
    await client.query(sql);
  }
}

async function expectMigrationFailure(
  client,
  preparationSql,
  expectedCode,
  expectedMessage,
) {
  let caught = null;
  await client.query("begin");
  try {
    await client.query(preparationSql);
    await applyHardeningMigration(client);
  } catch (error) {
    caught = error;
  } finally {
    await client.query("rollback").catch(() => {});
  }

  assert(caught !== null, "Expected the hardening migration to fail closed.", {
    expectedCode,
    expectedMessage: expectedMessage.source,
  });
  assert(caught.code === expectedCode, "Unexpected fail-closed SQLSTATE.", {
    actual: caught.code,
    expected: expectedCode,
    message: caught instanceof Error ? caught.message : String(caught),
  });
  assert(
    expectedMessage.test(
      caught instanceof Error ? caught.message : String(caught),
    ),
    "Unexpected fail-closed error message.",
    {
      actual: caught instanceof Error ? caught.message : String(caught),
      expected: expectedMessage.source,
    },
  );

  return {
    code: caught.code,
    message: caught instanceof Error ? caught.message : String(caught),
  };
}

async function assertPostgreSql17(client) {
  const version = await client.query(`
    select
      current_setting('server_version') as server_version,
      current_setting('server_version_num')::integer as server_version_num
  `);
  const row = version.rows[0];
  assert(
    row?.server_version_num >= 170000 && row.server_version_num < 180000,
    "W00 DB ACL runtime evidence requires PostgreSQL 17.",
    row ?? {},
  );

  return result("w00-db-acl-postgresql-17-runtime", "passed", row);
}

async function proveMissingPrerequisitesFailClosed(client) {
  const missingTable = await expectMigrationFailure(
    client,
    "drop table public.organization_settings cascade",
    "42P01",
    /requires ordinary public tables: organization_settings/u,
  );
  const partitionedTable = await expectMigrationFailure(
    client,
    `alter table public.tenant_domains rename to tenant_domains_regular_backup;
     create table public.tenant_domains (
       tenant_id uuid not null,
       domain text not null
     ) partition by hash (tenant_id)`,
    "42P01",
    /requires ordinary public tables: tenant_domains/u,
  );
  const missingRole = await expectMigrationFailure(
    client,
    "alter role authenticated rename to fieldgrid_runtime_authenticated_missing",
    "42704",
    /requires database roles: authenticated/u,
  );

  return result("w00-db-acl-missing-prerequisites-fail-closed", "passed", {
    missingRole,
    missingTable,
    partitionedTable,
  });
}

async function prepareOwnerAndDriftFixtures(client) {
  await client.query(`
    do $$
    begin
      if not exists (
        select 1 from pg_catalog.pg_roles where rolname = '${APP_OWNER_ROLE}'
      ) then
        create role ${APP_OWNER_ROLE} nologin nosuperuser nobypassrls noinherit;
      end if;
      if not exists (
        select 1 from pg_catalog.pg_roles where rolname = '${UNTRUSTED_ROLE}'
      ) then
        create role ${UNTRUSTED_ROLE} nologin nosuperuser nobypassrls noinherit;
      end if;
      if not exists (
        select 1 from pg_catalog.pg_roles where rolname = '${SET_OWNER_BRIDGE_ROLE}'
      ) then
        create role ${SET_OWNER_BRIDGE_ROLE} nologin nosuperuser nobypassrls noinherit;
      end if;
      if not exists (
        select 1 from pg_catalog.pg_roles where rolname = '${SET_BYPASS_BRIDGE_ROLE}'
      ) then
        create role ${SET_BYPASS_BRIDGE_ROLE} nologin nosuperuser nobypassrls noinherit;
      end if;
      if not exists (
        select 1 from pg_catalog.pg_roles where rolname = '${SET_BYPASS_OBJECT_ROLE}'
      ) then
        create role ${SET_BYPASS_OBJECT_ROLE} nologin nosuperuser bypassrls noinherit;
      end if;
      if not exists (
        select 1 from pg_catalog.pg_roles where rolname = '${INERT_SUPERUSER_ROLE}'
      ) then
        create role ${INERT_SUPERUSER_ROLE} nologin superuser noinherit;
      end if;
      if not exists (
        select 1 from pg_catalog.pg_roles where rolname = '${DEFAULT_ACL_OWNER_ROLE}'
      ) then
        create role ${DEFAULT_ACL_OWNER_ROLE} nologin nosuperuser nobypassrls noinherit;
      end if;
    end;
    $$;

    alter role ${APP_OWNER_ROLE} nologin nosuperuser nobypassrls noinherit;
    alter role ${UNTRUSTED_ROLE} nologin nosuperuser nobypassrls noinherit;
    alter role ${SET_OWNER_BRIDGE_ROLE} nologin nosuperuser nobypassrls noinherit;
    alter role ${SET_BYPASS_BRIDGE_ROLE} nologin nosuperuser nobypassrls noinherit;
    alter role ${SET_BYPASS_OBJECT_ROLE} nologin nosuperuser bypassrls noinherit;
    alter role ${INERT_SUPERUSER_ROLE} nologin superuser noinherit;
    alter role ${DEFAULT_ACL_OWNER_ROLE} nologin nosuperuser nobypassrls noinherit;

    revoke ${SET_OWNER_BRIDGE_ROLE} from anon;
    revoke ${APP_OWNER_ROLE} from ${SET_OWNER_BRIDGE_ROLE};
    revoke ${SET_BYPASS_BRIDGE_ROLE} from authenticated;
    revoke ${SET_BYPASS_OBJECT_ROLE} from ${SET_BYPASS_BRIDGE_ROLE};
    revoke ${INERT_SUPERUSER_ROLE} from anon;

    alter table public.organization_settings owner to ${APP_OWNER_ROLE};
    alter table public.tenant_domains owner to ${APP_OWNER_ROLE};

    create sequence if not exists public.${OWNED_SEQUENCES[0]};
    alter sequence public.${OWNED_SEQUENCES[0]} owner to ${APP_OWNER_ROLE};
    alter sequence public.${OWNED_SEQUENCES[0]}
      owned by public.organization_settings.id;

    create sequence if not exists public.${OWNED_SEQUENCES[1]};
    alter sequence public.${OWNED_SEQUENCES[1]} owner to ${APP_OWNER_ROLE};
    alter sequence public.${OWNED_SEQUENCES[1]}
      owned by public.tenant_domains.id;

    create sequence if not exists public.${UNRELATED_SEQUENCE};
    alter sequence public.${UNRELATED_SEQUENCE} owner to ${DEFAULT_ACL_OWNER_ROLE};
    alter sequence public.${UNRELATED_SEQUENCE} owned by none;

    alter default privileges for role ${DEFAULT_ACL_OWNER_ROLE} in schema public
      grant select on tables to ${UNTRUSTED_ROLE};
    alter default privileges for role ${DEFAULT_ACL_OWNER_ROLE} in schema public
      grant usage on sequences to ${UNTRUSTED_ROLE};
  `);

  await client.query(`
    alter table public.organization_settings force row level security;
    alter table public.tenant_domains force row level security;

    create policy fieldgrid_w00_legacy_org_public_all
      on public.organization_settings
      for all
      to public
      using (true)
      with check (true);
    create policy fieldgrid_w00_legacy_org_authenticated_read
      on public.organization_settings
      for select
      to authenticated
      using (true);
    create policy fieldgrid_w00_legacy_domains_public_all
      on public.tenant_domains
      for all
      to public
      using (true)
      with check (true);
    create policy fieldgrid_w00_legacy_domains_authenticated_read
      on public.tenant_domains
      for select
      to authenticated
      using (true);

    grant all privileges
      on table public.organization_settings, public.tenant_domains
      to public, anon, authenticated, service_role;
    grant select (smtp_password_encrypted), update (smtp_password_encrypted)
      on table public.organization_settings
      to anon, authenticated, service_role;
    grant select (verification_token), update (verification_token)
      on table public.tenant_domains
      to anon, authenticated, service_role;
    grant all privileges
      on sequence public.${OWNED_SEQUENCES[0]}, public.${OWNED_SEQUENCES[1]}
      to public, anon, authenticated, service_role;
    grant all privileges
      on sequence public.${UNRELATED_SEQUENCE}
      to public, anon, authenticated, service_role;
  `);
}

async function readSchemaAclSnapshot(client) {
  const schema = await client.query(
    `
      select
        pg_catalog.pg_get_userbyid(namespace_row.nspowner) as owner
      from pg_catalog.pg_namespace namespace_row
      where namespace_row.nspname = 'public'
    `,
  );
  const directAcl = await client.query(`
    select
      coalesce(role_row.rolname, 'PUBLIC') as grantee,
      acl.privilege_type,
      acl.is_grantable
    from pg_catalog.pg_namespace namespace_row
    cross join lateral pg_catalog.aclexplode(namespace_row.nspacl) acl
    left join pg_catalog.pg_roles role_row
      on role_row.oid = acl.grantee
    where namespace_row.nspname = 'public'
    order by grantee, acl.privilege_type
  `);
  const roles = [...CLIENT_ROLES, APP_OWNER_ROLE, UNTRUSTED_ROLE];
  const effective = await client.query(
    `
      select
        role_name,
        pg_catalog.has_schema_privilege(role_name, 'public', 'USAGE') as usage,
        pg_catalog.has_schema_privilege(role_name, 'public', 'CREATE') as create
      from unnest($1::text[]) role_name
      order by role_name
    `,
    [roles],
  );

  return {
    schema: {
      owner: schema.rows[0]?.owner,
      directAcl: directAcl.rows,
    },
    effective: effective.rows,
  };
}

async function readUntouchedCatalogSnapshot(client) {
  const unrelatedSequence = await client.query(
    `
      select
        sequence_relation.relname as sequence_name,
        pg_catalog.pg_get_userbyid(sequence_relation.relowner) as owner,
        pg_catalog.md5(coalesce(sequence_relation.relacl::text, ''))
          as acl_fingerprint,
        count(dependency.objid)::integer as owned_dependency_count
      from pg_catalog.pg_class sequence_relation
      join pg_catalog.pg_namespace namespace_row
        on namespace_row.oid = sequence_relation.relnamespace
      left join pg_catalog.pg_depend dependency
        on dependency.objid = sequence_relation.oid
       and dependency.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
       and dependency.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
       and dependency.deptype in ('a', 'i')
      where namespace_row.nspname = 'public'
        and sequence_relation.relkind = 'S'
        and sequence_relation.relname = $1
      group by sequence_relation.oid, sequence_relation.relname,
        sequence_relation.relowner, sequence_relation.relacl
    `,
    [UNRELATED_SEQUENCE],
  );
  const unrelatedSequenceAcl = await client.query(
    `
      select
        coalesce(grantee.rolname, 'PUBLIC') as grantee,
        pg_catalog.pg_get_userbyid(acl.grantor) as grantor,
        acl.privilege_type,
        acl.is_grantable
      from pg_catalog.pg_class sequence_relation
      join pg_catalog.pg_namespace namespace_row
        on namespace_row.oid = sequence_relation.relnamespace
      cross join lateral pg_catalog.aclexplode(sequence_relation.relacl) acl
      left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
      where namespace_row.nspname = 'public'
        and sequence_relation.relkind = 'S'
        and sequence_relation.relname = $1
      order by grantee, grantor, acl.privilege_type, acl.is_grantable
    `,
    [UNRELATED_SEQUENCE],
  );
  const unrelatedSequenceEffective = await client.query(
    `
      select
        role_name,
        privilege_name,
        pg_catalog.has_sequence_privilege(
          role_name,
          pg_catalog.format('public.%I', $1::text),
          privilege_name
        ) as allowed
      from unnest($2::text[]) role_name
      cross join unnest($3::text[]) privilege_name
      order by role_name, privilege_name
    `,
    [UNRELATED_SEQUENCE, ["public", ...CLIENT_ROLES], SEQUENCE_PRIVILEGES],
  );
  const defaultAcl = await client.query(`
    select
      pg_catalog.pg_get_userbyid(default_acl.defaclrole) as owner,
      coalesce(namespace_row.nspname, '') as schema_name,
      default_acl.defaclobjtype as object_type,
      pg_catalog.md5(default_acl.defaclacl::text) as acl_fingerprint,
      case
        when acl.grantee is null then null
        when acl.grantee = 0 then 'PUBLIC'
        else grantee.rolname
      end as grantee,
      pg_catalog.pg_get_userbyid(acl.grantor) as grantor,
      acl.privilege_type,
      acl.is_grantable
    from pg_catalog.pg_default_acl default_acl
    left join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = default_acl.defaclnamespace
    left join lateral pg_catalog.aclexplode(default_acl.defaclacl) acl on true
    left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
    order by owner, schema_name, object_type, grantee, grantor,
      acl.privilege_type, acl.is_grantable
  `);

  return {
    unrelatedSequence: unrelatedSequence.rows,
    unrelatedSequenceAcl: unrelatedSequenceAcl.rows,
    unrelatedSequenceEffective: unrelatedSequenceEffective.rows,
    defaultAcl: defaultAcl.rows,
  };
}

async function readMigrationRollbackSnapshot(client) {
  const policyDefinitions = await client.query(
    `
      select
        table_row.relname as table_name,
        policy.polname as policy_name,
        policy.polpermissive as permissive,
        policy.polcmd as command,
        policy.polroles::text as role_oids,
        pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) as using_expression,
        pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) as check_expression
      from pg_catalog.pg_policy policy
      join pg_catalog.pg_class table_row on table_row.oid = policy.polrelid
      join pg_catalog.pg_namespace namespace_row
        on namespace_row.oid = table_row.relnamespace
      where namespace_row.nspname = 'public'
        and table_row.relname = any($1::text[])
      order by table_row.relname, policy.polname
    `,
    [TARGET_TABLES],
  );
  const trackedRoles = [
    ...CLIENT_ROLES,
    APP_OWNER_ROLE,
    SET_OWNER_BRIDGE_ROLE,
    SET_BYPASS_BRIDGE_ROLE,
    SET_BYPASS_OBJECT_ROLE,
  ];
  const roleMemberships = await client.query(
    `
      select
        granted_role.rolname as granted_role,
        member_role.rolname as member_role,
        grantor_role.rolname as grantor_role,
        membership.admin_option,
        membership.inherit_option,
        membership.set_option
      from pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles granted_role
        on granted_role.oid = membership.roleid
      join pg_catalog.pg_roles member_role
        on member_role.oid = membership.member
      join pg_catalog.pg_roles grantor_role
        on grantor_role.oid = membership.grantor
      where granted_role.rolname = any($1::text[])
         or member_role.rolname = any($1::text[])
      order by granted_role.rolname, member_role.rolname, grantor_role.rolname
    `,
    [trackedRoles],
  );

  return {
    acl: await readAclSnapshot(client),
    policyDefinitions: policyDefinitions.rows,
    roleMemberships: roleMemberships.rows,
    untouchedCatalog: await readUntouchedCatalogSnapshot(client),
  };
}

async function readAclSnapshot(client) {
  const tables = await client.query(
    `
      select
        table_row.relname as table_name,
        pg_catalog.pg_get_userbyid(table_row.relowner) as owner,
        table_row.relrowsecurity as rls_enabled,
        table_row.relforcerowsecurity as rls_forced,
        count(policy.oid)::integer as policy_count
      from pg_catalog.pg_class table_row
      join pg_catalog.pg_namespace namespace_row
        on namespace_row.oid = table_row.relnamespace
      left join pg_catalog.pg_policy policy
        on policy.polrelid = table_row.oid
      where namespace_row.nspname = 'public'
        and table_row.relname = any($1::text[])
      group by table_row.oid, table_row.relname, table_row.relowner,
        table_row.relrowsecurity, table_row.relforcerowsecurity
      order by table_row.relname
    `,
    [TARGET_TABLES],
  );
  const tablePrivileges = await client.query(
    `
      select
        table_name,
        role_name,
        privilege_name,
        pg_catalog.has_table_privilege(
          role_name,
          pg_catalog.format('public.%I', table_name),
          privilege_name
        ) as allowed
      from unnest($1::text[]) table_name
      cross join unnest($2::text[]) role_name
      cross join unnest($3::text[]) privilege_name
      order by table_name, role_name, privilege_name
    `,
    [TARGET_TABLES, CLIENT_ROLES, TABLE_PRIVILEGES],
  );
  const columnPrivileges = await client.query(
    `
      select
        column_row.table_name,
        column_row.column_name,
        role_name,
        privilege_name,
        pg_catalog.has_column_privilege(
          role_name,
          pg_catalog.format('public.%I', column_row.table_name),
          column_row.column_name,
          privilege_name
        ) as allowed
      from information_schema.columns column_row
      cross join unnest($2::text[]) role_name
      cross join unnest($3::text[]) privilege_name
      where column_row.table_schema = 'public'
        and column_row.table_name = any($1::text[])
      order by column_row.table_name, column_row.ordinal_position,
        role_name, privilege_name
    `,
    [TARGET_TABLES, CLIENT_ROLES, COLUMN_PRIVILEGES],
  );
  const directTableAcl = await client.query(
    `
      select
        table_row.relname as table_name,
        coalesce(role_row.rolname, 'PUBLIC') as grantee,
        acl.privilege_type,
        acl.is_grantable
      from pg_catalog.pg_class table_row
      join pg_catalog.pg_namespace namespace_row
        on namespace_row.oid = table_row.relnamespace
      cross join lateral pg_catalog.aclexplode(table_row.relacl) acl
      left join pg_catalog.pg_roles role_row
        on role_row.oid = acl.grantee
      where namespace_row.nspname = 'public'
        and table_row.relname = any($1::text[])
        and (
          acl.grantee = 0
          or role_row.rolname = any($2::text[])
        )
      order by table_row.relname, grantee, acl.privilege_type
    `,
    [TARGET_TABLES, CLIENT_ROLES],
  );
  const directColumnAcl = await client.query(
    `
      select
        table_row.relname as table_name,
        column_row.attname as column_name,
        coalesce(role_row.rolname, 'PUBLIC') as grantee,
        acl.privilege_type,
        acl.is_grantable
      from pg_catalog.pg_class table_row
      join pg_catalog.pg_namespace namespace_row
        on namespace_row.oid = table_row.relnamespace
      join pg_catalog.pg_attribute column_row
        on column_row.attrelid = table_row.oid
       and column_row.attnum > 0
       and not column_row.attisdropped
      cross join lateral pg_catalog.aclexplode(column_row.attacl) acl
      left join pg_catalog.pg_roles role_row
        on role_row.oid = acl.grantee
      where namespace_row.nspname = 'public'
        and table_row.relname = any($1::text[])
        and (
          acl.grantee = 0
          or role_row.rolname = any($2::text[])
        )
      order by table_row.relname, column_row.attnum, grantee,
        acl.privilege_type
    `,
    [TARGET_TABLES, CLIENT_ROLES],
  );
  const sequences = await client.query(
    `
      select distinct
        sequence_relation.oid as sequence_oid,
        sequence_namespace.nspname as schema_name,
        sequence_relation.relname as sequence_name,
        pg_catalog.pg_get_userbyid(sequence_relation.relowner) as owner
      from pg_catalog.pg_depend dependency
      join pg_catalog.pg_class sequence_relation
        on sequence_relation.oid = dependency.objid
       and sequence_relation.relkind = 'S'
      join pg_catalog.pg_namespace sequence_namespace
        on sequence_namespace.oid = sequence_relation.relnamespace
      join pg_catalog.pg_class owning_table
        on owning_table.oid = dependency.refobjid
      join pg_catalog.pg_namespace table_namespace
        on table_namespace.oid = owning_table.relnamespace
      where dependency.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
        and dependency.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
        and dependency.deptype in ('a', 'i')
        and table_namespace.nspname = 'public'
        and owning_table.relname = any($1::text[])
      order by sequence_namespace.nspname, sequence_relation.relname
    `,
    [TARGET_TABLES],
  );
  const sequencePrivileges = await client.query(
    `
      with owned_sequences as (
        select distinct sequence_relation.oid, sequence_relation.relname
        from pg_catalog.pg_depend dependency
        join pg_catalog.pg_class sequence_relation
          on sequence_relation.oid = dependency.objid
         and sequence_relation.relkind = 'S'
        join pg_catalog.pg_class owning_table
          on owning_table.oid = dependency.refobjid
        join pg_catalog.pg_namespace table_namespace
          on table_namespace.oid = owning_table.relnamespace
        where dependency.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
          and dependency.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
          and dependency.deptype in ('a', 'i')
          and table_namespace.nspname = 'public'
          and owning_table.relname = any($1::text[])
      )
      select
        owned_sequences.relname as sequence_name,
        role_name,
        privilege_name,
        pg_catalog.has_sequence_privilege(
          role_name,
          owned_sequences.oid,
          privilege_name
        ) as allowed
      from owned_sequences
      cross join unnest($2::text[]) role_name
      cross join unnest($3::text[]) privilege_name
      order by owned_sequences.relname, role_name, privilege_name
    `,
    [TARGET_TABLES, CLIENT_ROLES, SEQUENCE_PRIVILEGES],
  );
  const directSequenceAcl = await client.query(
    `
      with owned_sequences as (
        select distinct
          sequence_relation.relname,
          sequence_relation.relacl
        from pg_catalog.pg_depend dependency
        join pg_catalog.pg_class sequence_relation
          on sequence_relation.oid = dependency.objid
         and sequence_relation.relkind = 'S'
        join pg_catalog.pg_class owning_table
          on owning_table.oid = dependency.refobjid
        join pg_catalog.pg_namespace table_namespace
          on table_namespace.oid = owning_table.relnamespace
        where dependency.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
          and dependency.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
          and dependency.deptype in ('a', 'i')
          and table_namespace.nspname = 'public'
          and owning_table.relname = any($1::text[])
      )
      select
        owned_sequences.relname as sequence_name,
        coalesce(role_row.rolname, 'PUBLIC') as grantee,
        acl.privilege_type,
        acl.is_grantable
      from owned_sequences
      cross join lateral pg_catalog.aclexplode(owned_sequences.relacl) acl
      left join pg_catalog.pg_roles role_row
        on role_row.oid = acl.grantee
      where acl.grantee = 0
         or role_row.rolname = any($2::text[])
      order by owned_sequences.relname, grantee, acl.privilege_type
    `,
    [TARGET_TABLES, CLIENT_ROLES],
  );

  return {
    tables: tables.rows,
    tablePrivileges: tablePrivileges.rows,
    columnPrivileges: columnPrivileges.rows,
    directTableAcl: directTableAcl.rows,
    directColumnAcl: directColumnAcl.rows,
    sequences: sequences.rows.map(
      ({ sequence_oid: _sequenceOid, ...row }) => row,
    ),
    sequencePrivileges: sequencePrivileges.rows,
    directSequenceAcl: directSequenceAcl.rows,
  };
}

function assertClosedSnapshot(snapshot) {
  assert(
    snapshot.tables.length === TARGET_TABLES.length,
    "Target table snapshot is incomplete.",
    {
      tables: snapshot.tables,
    },
  );
  for (const table of snapshot.tables) {
    assert(
      table.owner === APP_OWNER_ROLE,
      "Unexpected target table owner.",
      table,
    );
    assert(table.rls_enabled === true, "RLS is not enabled.", table);
    assert(table.rls_forced === false, "RLS is unexpectedly forced.", table);
    assert(
      table.policy_count === 0,
      "A target-table RLS policy remains.",
      table,
    );
  }
  for (const row of snapshot.tablePrivileges) {
    assert(
      row.allowed === false,
      "Client role retains a table privilege.",
      row,
    );
  }
  for (const row of snapshot.columnPrivileges) {
    assert(
      row.allowed === false,
      "Client role retains a column privilege.",
      row,
    );
  }
  assert(
    snapshot.directTableAcl.length === 0,
    "Direct target table ACL entries remain.",
    {
      rows: snapshot.directTableAcl,
    },
  );
  assert(
    snapshot.directColumnAcl.length === 0,
    "Direct target column ACL entries remain.",
    {
      rows: snapshot.directColumnAcl,
    },
  );
  nodeAssert.deepEqual(
    snapshot.sequences.map((row) => row.sequence_name),
    [...OWNED_SEQUENCES].sort(),
  );
  for (const row of snapshot.sequencePrivileges) {
    assert(
      row.allowed === false,
      "Client role retains an owned-sequence privilege.",
      row,
    );
  }
  assert(
    snapshot.directSequenceAcl.length === 0,
    "Direct owned-sequence ACL entries remain.",
    {
      rows: snapshot.directSequenceAcl,
    },
  );
}

function assertUntouchedFixtureSnapshot(snapshot) {
  assert(
    snapshot.unrelatedSequence.length === 1,
    "Unrelated sequence fixture is missing.",
    snapshot.unrelatedSequence,
  );
  assert(
    snapshot.unrelatedSequence[0].owner === DEFAULT_ACL_OWNER_ROLE &&
      snapshot.unrelatedSequence[0].owned_dependency_count === 0,
    "Unrelated sequence unexpectedly belongs to a target column.",
    snapshot.unrelatedSequence[0],
  );
  for (const row of snapshot.unrelatedSequenceEffective) {
    assert(
      row.allowed === true,
      "Unrelated sequence fixture lacks its deliberate broad privilege.",
      row,
    );
  }
  const fixtureDefaultAcl = snapshot.defaultAcl.filter(
    (row) => row.owner === DEFAULT_ACL_OWNER_ROLE,
  );
  assert(
    fixtureDefaultAcl.some(
      (row) =>
        row.grantee === UNTRUSTED_ROLE && row.privilege_type === "SELECT",
    ) &&
      fixtureDefaultAcl.some(
        (row) =>
          row.grantee === UNTRUSTED_ROLE && row.privilege_type === "USAGE",
      ),
    "Default ACL fixture is incomplete.",
    fixtureDefaultAcl,
  );
}

async function proveControllableRolePathsFailAndRollback(client) {
  let adminOptionCanMintSet = null;
  await client.query("begin");
  try {
    await client.query(
      `grant ${APP_OWNER_ROLE} to anon
         with admin true, inherit false, set false`,
    );
    await client.query("set local role anon");
    const before = await client.query(
      `select pg_catalog.pg_has_role(current_user, '${APP_OWNER_ROLE}', 'SET') as can_set`,
    );
    await client.query(
      `grant ${APP_OWNER_ROLE} to anon
         with admin false, inherit false, set true`,
    );
    const after = await client.query(
      `select pg_catalog.pg_has_role(current_user, '${APP_OWNER_ROLE}', 'SET') as can_set`,
    );
    adminOptionCanMintSet = {
      before: before.rows[0]?.can_set,
      after: after.rows[0]?.can_set,
    };
  } finally {
    await client.query("rollback").catch(() => {});
  }
  assert(
    adminOptionCanMintSet?.before === false &&
      adminOptionCanMintSet.after === true,
    "PostgreSQL 17 ADMIN OPTION fixture did not mint SET capability.",
    adminOptionCanMintSet ?? {},
  );

  let inheritedAdminCanMintSet = null;
  await client.query("begin");
  try {
    await client.query(
      `grant ${APP_OWNER_ROLE} to ${SET_OWNER_BRIDGE_ROLE}
         with admin true, inherit false, set false`,
    );
    await client.query(
      `grant ${SET_OWNER_BRIDGE_ROLE} to anon
         with admin false, inherit true, set false`,
    );
    await client.query("set local role anon");
    const before = await client.query(`
      select
        pg_catalog.pg_has_role(
          current_user,
          '${SET_OWNER_BRIDGE_ROLE}',
          'USAGE'
        ) as bridge_usage,
        pg_catalog.pg_has_role(
          current_user,
          '${APP_OWNER_ROLE}',
          'MEMBER WITH ADMIN OPTION'
        ) as inherited_admin,
        pg_catalog.pg_has_role(
          current_user,
          '${APP_OWNER_ROLE}',
          'SET'
        ) as can_set
    `);
    await client.query(
      `grant ${APP_OWNER_ROLE} to anon
         with admin false, inherit false, set true`,
    );
    const after = await client.query(
      `select pg_catalog.pg_has_role(current_user, '${APP_OWNER_ROLE}', 'SET') as can_set`,
    );
    inheritedAdminCanMintSet = {
      bridgeUsage: before.rows[0]?.bridge_usage,
      inheritedAdmin: before.rows[0]?.inherited_admin,
      before: before.rows[0]?.can_set,
      after: after.rows[0]?.can_set,
    };
  } finally {
    await client.query("rollback").catch(() => {});
  }
  assert(
    inheritedAdminCanMintSet?.bridgeUsage === true &&
      inheritedAdminCanMintSet.inheritedAdmin === true &&
      inheritedAdminCanMintSet.before === false &&
      inheritedAdminCanMintSet.after === true,
    "PostgreSQL 17 inherited ADMIN OPTION fixture did not mint SET capability.",
    inheritedAdminCanMintSet ?? {},
  );

  let inertSuperuserAdminUpgrade = null;
  await client.query("begin");
  try {
    await client.query(
      `grant ${INERT_SUPERUSER_ROLE} to anon
         with admin true, inherit false, set false`,
    );
    await client.query("set local role anon");
    await client.query(
      `grant ${INERT_SUPERUSER_ROLE} to anon
         with admin false, inherit false, set true`,
    );
  } catch (error) {
    inertSuperuserAdminUpgrade = {
      code: error?.code,
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await client.query("rollback").catch(() => {});
  }
  assert(
    inertSuperuserAdminUpgrade?.code === "42501" &&
      /(?:Only roles with SUPERUSER may grant roles with SUPERUSER|permission denied to grant role)/iu.test(
        inertSuperuserAdminUpgrade.message,
      ),
    "PostgreSQL 17 unexpectedly allowed an ADMIN-only superuser membership upgrade.",
    inertSuperuserAdminUpgrade ?? {},
  );

  const inertSuperuserBefore = await readMigrationRollbackSnapshot(client);
  await client.query("begin");
  try {
    await client.query(
      `grant ${INERT_SUPERUSER_ROLE} to anon
         with admin true, inherit false, set false`,
    );
    await applyHardeningMigration(client);
  } finally {
    await client.query("rollback").catch(() => {});
  }
  const inertSuperuserAfter = await readMigrationRollbackSnapshot(client);
  nodeAssert.deepEqual(inertSuperuserAfter, inertSuperuserBefore);

  const ownerBefore = await readMigrationRollbackSnapshot(client);
  const ownerFailure = await expectMigrationFailure(
    client,
    `
      grant ${APP_OWNER_ROLE} to ${SET_OWNER_BRIDGE_ROLE}
        with inherit false, set true;
      grant ${SET_OWNER_BRIDGE_ROLE} to anon
        with inherit false, set true;
    `,
    "42501",
    /SET-capable target-table owner .* remains reachable from anon/u,
  );
  const ownerAfter = await readMigrationRollbackSnapshot(client);
  nodeAssert.deepEqual(ownerAfter, ownerBefore);

  const bypassBefore = await readMigrationRollbackSnapshot(client);
  const bypassFailure = await expectMigrationFailure(
    client,
    `
      grant select on table public.organization_settings
        to ${SET_BYPASS_OBJECT_ROLE};
      grant ${SET_BYPASS_OBJECT_ROLE} to ${SET_BYPASS_BRIDGE_ROLE}
        with inherit false, set true;
      grant ${SET_BYPASS_BRIDGE_ROLE} to authenticated
        with inherit false, set true;
    `,
    "42501",
    /SET-capable BYPASSRLS role .* remains reachable from authenticated/u,
  );
  const bypassAfter = await readMigrationRollbackSnapshot(client);
  nodeAssert.deepEqual(bypassAfter, bypassBefore);

  const directAdminBefore = await readMigrationRollbackSnapshot(client);
  const directAdminFailure = await expectMigrationFailure(
    client,
    `grant ${APP_OWNER_ROLE} to service_role
       with admin true, inherit false, set false`,
    "42501",
    /SET\/ADMIN-controllable target-table owner .* remains reachable from service_role/u,
  );
  const directAdminAfter = await readMigrationRollbackSnapshot(client);
  nodeAssert.deepEqual(directAdminAfter, directAdminBefore);

  const directAdminBypassBefore = await readMigrationRollbackSnapshot(client);
  const directAdminBypassFailure = await expectMigrationFailure(
    client,
    `grant ${SET_BYPASS_OBJECT_ROLE} to anon
       with admin true, inherit false, set false`,
    "42501",
    /SET\/ADMIN-controllable BYPASSRLS role .* remains reachable from anon/u,
  );
  const directAdminBypassAfter = await readMigrationRollbackSnapshot(client);
  nodeAssert.deepEqual(directAdminBypassAfter, directAdminBypassBefore);

  const inheritedAdminBefore = await readMigrationRollbackSnapshot(client);
  const inheritedAdminFailure = await expectMigrationFailure(
    client,
    `
      grant ${APP_OWNER_ROLE} to ${SET_OWNER_BRIDGE_ROLE}
        with admin true, inherit false, set false;
      grant ${SET_OWNER_BRIDGE_ROLE} to anon
        with admin false, inherit true, set false;
    `,
    "42501",
    /SET\/ADMIN-controllable target-table owner .* remains reachable from anon/u,
  );
  const inheritedAdminAfter = await readMigrationRollbackSnapshot(client);
  nodeAssert.deepEqual(inheritedAdminAfter, inheritedAdminBefore);

  const adminBridgeBefore = await readMigrationRollbackSnapshot(client);
  const adminBridgeFailure = await expectMigrationFailure(
    client,
    `
      grant ${APP_OWNER_ROLE} to ${SET_OWNER_BRIDGE_ROLE}
        with admin true, inherit false, set false;
      grant ${SET_OWNER_BRIDGE_ROLE} to authenticated
        with admin false, inherit false, set true;
    `,
    "42501",
    /SET\/ADMIN-controllable target-table owner .* remains reachable from authenticated/u,
  );
  const adminBridgeAfter = await readMigrationRollbackSnapshot(client);
  nodeAssert.deepEqual(adminBridgeAfter, adminBridgeBefore);

  return result("w00-db-acl-role-control-fail-closed", "passed", {
    adminOptionCanMintSet,
    inheritedAdminCanMintSet,
    inertSuperuserAdminOnly: {
      migrationAccepted: true,
      upgradeDenied: inertSuperuserAdminUpgrade,
      fullTransactionRollbackExact: true,
    },
    adminOptionDirect: {
      failure: directAdminFailure,
      fullTransactionRollbackExact: true,
    },
    adminOptionDirectBypass: {
      failure: directAdminBypassFailure,
      fullTransactionRollbackExact: true,
    },
    adminOptionViaInheritedBridge: {
      failure: inheritedAdminFailure,
      fullTransactionRollbackExact: true,
    },
    adminOptionViaSettableBridge: {
      failure: adminBridgeFailure,
      fullTransactionRollbackExact: true,
    },
    bypassObjectGrantee: {
      failure: bypassFailure,
      fullTransactionRollbackExact: true,
      transitiveSetPath: true,
    },
    targetOwner: {
      failure: ownerFailure,
      fullTransactionRollbackExact: true,
      transitiveSetPath: true,
    },
  });
}

async function assertDirectClientReadsDenied(client) {
  const denied = [];
  for (const role of [...CLIENT_ROLES, UNTRUSTED_ROLE]) {
    for (const table of TARGET_TABLES) {
      let caught = null;
      await client.query("begin");
      try {
        await client.query(`set local role ${quoteIdentifier(role)}`);
        await client.query("set local row_security = on");
        await client.query(
          `select count(*) from public.${quoteIdentifier(table)}`,
        );
      } catch (error) {
        caught = error;
      } finally {
        await client.query("rollback").catch(() => {});
      }
      assert(
        caught?.code === "42501",
        "Direct client read was not denied by table ACL.",
        {
          code: caught?.code,
          message: caught instanceof Error ? caught.message : String(caught),
          role,
          table,
        },
      );
      denied.push({ role, table, code: caught.code });
    }
  }

  return result("w00-db-acl-direct-client-access-denied", "passed", { denied });
}

async function assertRlsDefaultDeny(client) {
  const selectAndMutation = [];
  for (const table of TARGET_TABLES) {
    await client.query("begin");
    try {
      await client.query(
        `grant select, insert, update, delete on table public.${quoteIdentifier(table)} to ${UNTRUSTED_ROLE}`,
      );
      await client.query(`set local role ${UNTRUSTED_ROLE}`);
      await client.query("set local row_security = on");
      const selected = await client.query(
        `select count(*)::integer as count from public.${quoteIdentifier(table)}`,
      );
      const updated = await client.query(
        `update public.${quoteIdentifier(table)} set tenant_id = tenant_id`,
      );
      const deleted = await client.query(
        `delete from public.${quoteIdentifier(table)}`,
      );
      assert(
        selected.rows[0]?.count === 0,
        "Policy-free RLS SELECT exposed rows.",
        {
          table,
          rows: selected.rows,
        },
      );
      assert(updated.rowCount === 0, "Policy-free RLS UPDATE changed rows.", {
        table,
        rowCount: updated.rowCount,
      });
      assert(deleted.rowCount === 0, "Policy-free RLS DELETE changed rows.", {
        table,
        rowCount: deleted.rowCount,
      });
      selectAndMutation.push({
        table,
        selectedRows: selected.rows[0]?.count,
        updatedRows: updated.rowCount,
        deletedRows: deleted.rowCount,
      });
    } finally {
      await client.query("rollback").catch(() => {});
    }

    let insertError = null;
    await client.query("begin");
    try {
      await client.query(
        `grant insert on table public.${quoteIdentifier(table)} to ${UNTRUSTED_ROLE}`,
      );
      await client.query(`set local role ${UNTRUSTED_ROLE}`);
      await client.query("set local row_security = on");
      if (table === "organization_settings") {
        await client.query(
          `insert into public.organization_settings (tenant_id, naam)
           values ($1, 'RLS denied fixture')`,
          [FIXTURE.tenants.suspended],
        );
      } else {
        await client.query(
          `insert into public.tenant_domains (
             tenant_id, domain, type, is_primary, verification_status
           ) values ($1, 'rls-denied.runtime.fieldgrid.test',
             'custom_domain', false, 'pending')`,
          [FIXTURE.tenants.suspended],
        );
      }
    } catch (error) {
      insertError = error;
    } finally {
      await client.query("rollback").catch(() => {});
    }
    assert(
      insertError?.code === "42501",
      "Policy-free RLS INSERT was not denied.",
      {
        code: insertError?.code,
        message:
          insertError instanceof Error
            ? insertError.message
            : String(insertError),
        table,
      },
    );
  }

  return result("w00-db-acl-policy-free-rls-default-deny", "passed", {
    actor: UNTRUSTED_ROLE,
    selectAndMutation,
    insertSqlState: "42501",
  });
}

async function assertOwnerHostAndSettingsPaths(client) {
  await client.query(
    `
      insert into public.organization_settings (tenant_id, naam)
      values
        ($1, 'Runtime Tenant A settings'),
        ($2, 'Runtime Tenant B settings')
      on conflict (tenant_id) do update
      set naam = excluded.naam
    `,
    [FIXTURE.tenants.a, FIXTURE.tenants.b],
  );
  await client.query(
    `
      insert into public.tenant_domains (
        tenant_id,
        domain,
        type,
        is_primary,
        verification_status,
        verification_method,
        tls_status,
        activated_at,
        verified_at
      ) values
        ($1, 'tenant-a.runtime.fieldgrid.test', 'fieldgrid_subdomain', true,
          'verified', 'dns_txt', 'active', now(), now()),
        ($2, 'tenant-b.runtime.fieldgrid.test', 'fieldgrid_subdomain', true,
          'verified', 'dns_txt', 'active', now(), now())
      on conflict (domain) do update
      set tenant_id = excluded.tenant_id,
          verification_status = excluded.verification_status,
          disabled_at = null
    `,
    [FIXTURE.tenants.a, FIXTURE.tenants.b],
  );

  const role = await client.query(
    `
      select rolname, rolsuper, rolbypassrls
      from pg_catalog.pg_roles
      where rolname = $1
    `,
    [APP_OWNER_ROLE],
  );
  assert(
    role.rows.length === 1 &&
      role.rows[0].rolsuper === false &&
      role.rows[0].rolbypassrls === false,
    "Runtime application owner must be a non-superuser without BYPASSRLS.",
    role.rows[0] ?? {},
  );

  const paths = [];
  await client.query("begin");
  try {
    await client.query(`set local role ${APP_OWNER_ROLE}`);
    await client.query("set local row_security = on");
    for (const [tenantId, host, expectedName] of [
      [
        FIXTURE.tenants.a,
        "tenant-a.runtime.fieldgrid.test",
        "Runtime Tenant A settings",
      ],
      [
        FIXTURE.tenants.b,
        "tenant-b.runtime.fieldgrid.test",
        "Runtime Tenant B settings",
      ],
    ]) {
      const resolved = await client.query(
        `
          select
            domain_row.tenant_id::text as host_tenant_id,
            domain_row.domain,
            settings.tenant_id::text as settings_tenant_id,
            settings.naam
          from public.tenant_domains domain_row
          join public.organization_settings settings
            on settings.tenant_id = domain_row.tenant_id
          where domain_row.domain = $1
            and domain_row.verification_status = 'verified'
            and domain_row.disabled_at is null
        `,
        [host],
      );
      assert(
        resolved.rows.length === 1,
        "Owner host/settings path did not resolve exactly once.",
        {
          host,
          rows: resolved.rows,
        },
      );
      assert(
        resolved.rows[0].host_tenant_id === tenantId &&
          resolved.rows[0].settings_tenant_id === tenantId &&
          resolved.rows[0].naam === expectedName,
        "Owner host/settings path crossed a tenant boundary.",
        { expectedName, host, tenantId, row: resolved.rows[0] },
      );

      const settingsWrite = await client.query(
        `update public.organization_settings
         set updated_at = updated_at
         where tenant_id = $1`,
        [tenantId],
      );
      const hostWrite = await client.query(
        `update public.tenant_domains
         set updated_at = updated_at
         where tenant_id = $1 and domain = $2`,
        [tenantId, host],
      );
      assert(
        settingsWrite.rowCount === 1 && hostWrite.rowCount === 1,
        "Owner tenant-scoped write path did not affect exactly one row.",
        {
          host,
          hostRows: hostWrite.rowCount,
          settingsRows: settingsWrite.rowCount,
          tenantId,
        },
      );
      paths.push({
        domain: resolved.rows[0].domain,
        hostRows: hostWrite.rowCount,
        settingsName: resolved.rows[0].naam,
        settingsRows: settingsWrite.rowCount,
        tenantId,
      });
    }
  } finally {
    await client.query("rollback").catch(() => {});
  }

  return result("w00-db-acl-owner-host-settings-tenant-a-b", "passed", {
    owner: role.rows[0],
    paths,
  });
}

async function proveSharedClosureDetectsDrift(client) {
  const detected = [];
  const expectFailure = async (label, sql) => {
    let caught = null;
    await client.query("begin");
    try {
      await client.query(sql);
      await verifyW00AclClosure(client, { expectedOwner: APP_OWNER_ROLE });
    } catch (error) {
      caught = error;
    } finally {
      await client.query("rollback").catch(() => {});
    }
    assert(caught instanceof Error, "Shared ACL closure accepted drift.", {
      label,
    });
    detected.push(label);
  };

  await expectFailure(
    "policy",
    `create policy fieldgrid_w00_shared_closure_fixture
       on public.organization_settings for select to public using (true)`,
  );
  await expectFailure(
    "rls-disabled",
    "alter table public.organization_settings disable row level security",
  );
  await expectFailure(
    "rls-forced",
    "alter table public.organization_settings force row level security",
  );
  await expectFailure(
    "public-table-grant",
    "grant select on table public.organization_settings to public",
  );
  await expectFailure(
    "authenticated-column-grant",
    "grant select (smtp_password_encrypted) on table public.organization_settings to authenticated",
  );
  await expectFailure(
    "service-role-owned-sequence-grant",
    `grant usage on sequence public.${OWNED_SEQUENCES[0]} to service_role`,
  );
  await expectFailure(
    "transitive-owner-set-role",
    `grant ${APP_OWNER_ROLE} to ${SET_OWNER_BRIDGE_ROLE}
       with inherit false, set true;
     grant ${SET_OWNER_BRIDGE_ROLE} to anon
       with inherit false, set true`,
  );
  await expectFailure(
    "transitive-bypass-set-role",
    `grant ${SET_BYPASS_OBJECT_ROLE} to ${SET_BYPASS_BRIDGE_ROLE}
       with inherit false, set true;
     grant ${SET_BYPASS_BRIDGE_ROLE} to authenticated
       with inherit false, set true`,
  );
  await expectFailure(
    "direct-owner-admin-option",
    `grant ${APP_OWNER_ROLE} to service_role
       with admin true, inherit false, set false`,
  );
  await expectFailure(
    "owner-admin-option-via-settable-bridge",
    `grant ${APP_OWNER_ROLE} to ${SET_OWNER_BRIDGE_ROLE}
       with admin true, inherit false, set false;
     grant ${SET_OWNER_BRIDGE_ROLE} to authenticated
       with admin false, inherit false, set true`,
  );
  await expectFailure(
    "owner-admin-option-via-inherited-bridge",
    `grant ${APP_OWNER_ROLE} to ${SET_OWNER_BRIDGE_ROLE}
       with admin true, inherit false, set false;
     grant ${SET_OWNER_BRIDGE_ROLE} to anon
       with admin false, inherit true, set false`,
  );

  await client.query("begin");
  try {
    await client.query(
      `grant usage on sequence public.${UNRELATED_SEQUENCE} to service_role`,
    );
    await client.query(
      `grant ${UNTRUSTED_ROLE} to anon
         with admin true, inherit false, set false`,
    );
    await client.query(
      `grant ${INERT_SUPERUSER_ROLE} to anon
         with admin true, inherit false, set false`,
    );
    await verifyW00AclClosure(client, { expectedOwner: APP_OWNER_ROLE });
  } finally {
    await client.query("rollback").catch(() => {});
  }

  return result("w00-db-acl-shared-closure-drift-detection", "passed", {
    detected,
    unrelatedAdminOptionIgnored: true,
    inertSuperuserAdminOptionIgnored: true,
    unrelatedSequenceIgnored: true,
  });
}

async function runChecks() {
  const client = await connect();
  try {
    const checks = [await assertPostgreSql17(client)];
    checks.push(await proveMissingPrerequisitesFailClosed(client));
    await prepareOwnerAndDriftFixtures(client);

    const schemaBefore = await readSchemaAclSnapshot(client);
    const untouchedBefore = await readUntouchedCatalogSnapshot(client);
    assertUntouchedFixtureSnapshot(untouchedBefore);
    for (const row of schemaBefore.effective) {
      assert(
        row.usage === true,
        "Runtime actor unexpectedly lacks shared public-schema USAGE.",
        row,
      );
    }
    checks.push(await proveControllableRolePathsFailAndRollback(client));

    await applyHardeningMigration(client);
    const first = await readAclSnapshot(client);
    assertClosedSnapshot(first);
    const firstSharedClosure = await verifyW00AclClosure(client, {
      expectedOwner: APP_OWNER_ROLE,
    });
    const schemaAfterFirst = await readSchemaAclSnapshot(client);
    nodeAssert.deepEqual(schemaAfterFirst, schemaBefore);
    const untouchedAfterFirst = await readUntouchedCatalogSnapshot(client);
    nodeAssert.deepEqual(untouchedAfterFirst, untouchedBefore);

    await applyHardeningMigration(client);
    const second = await readAclSnapshot(client);
    assertClosedSnapshot(second);
    nodeAssert.deepEqual(second, first);
    const secondSharedClosure = await verifyW00AclClosure(client, {
      expectedOwner: APP_OWNER_ROLE,
    });
    nodeAssert.deepEqual(secondSharedClosure, firstSharedClosure);
    const schemaAfterSecond = await readSchemaAclSnapshot(client);
    nodeAssert.deepEqual(schemaAfterSecond, schemaBefore);
    const untouchedAfterSecond = await readUntouchedCatalogSnapshot(client);
    nodeAssert.deepEqual(untouchedAfterSecond, untouchedBefore);

    checks.push(
      result("w00-db-acl-table-column-owned-sequence-closure", "passed", first),
      result("w00-db-acl-idempotent-end-state", "passed", {
        exactSnapshotMatch: true,
        sharedClosureExact: true,
      }),
      result("w00-db-acl-shared-schema-privileges-unchanged", "passed", {
        before: schemaBefore,
        after: schemaAfterSecond,
      }),
      result("w00-db-acl-unrelated-sequence-default-acl-unchanged", "passed", {
        defaultAclExact: true,
        unrelatedSequenceExact: true,
        snapshot: untouchedAfterSecond,
      }),
      await assertDirectClientReadsDenied(client),
      await assertRlsDefaultDeny(client),
      await proveSharedClosureDetectsDrift(client),
      await assertOwnerHostAndSettingsPaths(client),
    );
    return checks;
  } finally {
    await client.end();
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const checks = [];
  let status = "passed";
  try {
    checks.push(...(await runChecks()));
  } catch (error) {
    status = "failed";
    checks.push(
      result("w00-db-acl-runtime-failure", "failed", {
        code: error?.code,
        details: error?.details ?? {},
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    await writeTextArtifact(
      join("logs", "w00-db-acl-hardening-error.log"),
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
  }

  await writeJsonArtifact(join("reports", "w00-db-acl-hardening.json"), {
    name: "fieldgrid-w00-db-acl-hardening-runtime",
    status,
    startedAt,
    completedAt: new Date().toISOString(),
    migrationPaths: MIGRATION_PATHS,
    checks,
    limitations: [
      "Runs against a disposable local PostgreSQL 17 database, not staging.",
      "Proves database ACL/RLS behavior and table-owner SQL paths; HTTP host routing remains a separate application/runtime gate.",
    ],
  });

  console.log(
    `FG-W00-DB-ACL-HARDENING status=${status} checks=${checks.length}`,
  );
  if (status !== "passed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
