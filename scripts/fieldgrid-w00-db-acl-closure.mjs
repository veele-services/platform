export const W00_CLIENT_ROLES = ["anon", "authenticated", "service_role"];
export const W00_TARGET_TABLES = ["organization_settings", "tenant_domains"];
export const W00_RUNTIME_POLICY_PROFILE = "runtime-data-v1";

const W00_RUNTIME_ROLES = ["fieldgrid_runtime_app", "fieldgrid_runtime_data"];

const W00_RUNTIME_POLICY_OPERATIONS = Object.freeze({
  organization_settings: ["insert", "select", "update"],
  tenant_domains: ["delete", "insert", "select", "update"],
});
export const W00_RUNTIME_POLICY_COUNT = Object.values(
  W00_RUNTIME_POLICY_OPERATIONS,
).flat().length;

const POLICY_OPERATION_SHAPES = Object.freeze({
  delete: { checkExpression: null, command: "d", usingExpression: "true" },
  insert: { checkExpression: "true", command: "a", usingExpression: null },
  select: { checkExpression: null, command: "r", usingExpression: "true" },
  update: { checkExpression: "true", command: "w", usingExpression: "true" },
});

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

function fail(message) {
  throw new Error(message);
}

async function verifyW00RuntimeProfileClosure(
  client,
  expectedMigrationAdministrator,
) {
  const runtimeRoles = await client.query(
    `
      select
        role_row.rolname::text as role_name,
        role_row.rolcanlogin as can_login,
        role_row.rolinherit as inherits,
        role_row.rolsuper as superuser,
        role_row.rolcreatedb as create_database,
        role_row.rolcreaterole as create_role,
        role_row.rolreplication as replication,
        role_row.rolbypassrls as bypass_rls
      from pg_catalog.pg_roles role_row
      where role_row.rolname::text = any($1::text[])
      order by role_row.rolname
    `,
    [W00_RUNTIME_ROLES],
  );
  if (
    runtimeRoles.rows.length !== W00_RUNTIME_ROLES.length ||
    runtimeRoles.rows.some(
      (row) =>
        !W00_RUNTIME_ROLES.includes(row.role_name) ||
        (row.role_name === "fieldgrid_runtime_data" && row.can_login) ||
        row.inherits !== (row.role_name === "fieldgrid_runtime_app") ||
        row.superuser ||
        row.create_database ||
        row.create_role ||
        row.replication ||
        row.bypass_rls,
    )
  ) {
    fail("The W00 runtime role attributes are not exact.");
  }

  const configuration = await client.query(`
    select
      configuration.migration_admin::text as migration_admin,
      configuration.app_admin_grantor::text as app_admin_grantor,
      configuration.data_admin_grantor::text as data_admin_grantor
    from app_private.fieldgrid_runtime_principal_configuration configuration
    where configuration.singleton
  `);
  if (configuration.rows.length !== 1) {
    fail("The W00 runtime principal configuration is not exact.");
  }
  const config = configuration.rows[0];
  const memberships = await client.query(
    `
      select
        parent.rolname::text as parent_role,
        member.rolname::text as member_role,
        grantor.rolname::text as grantor_role,
        membership.admin_option,
        membership.inherit_option,
        membership.set_option
      from pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles parent on parent.oid = membership.roleid
      join pg_catalog.pg_roles member on member.oid = membership.member
      join pg_catalog.pg_roles grantor on grantor.oid = membership.grantor
      where parent.rolname::text = any($1::text[])
         or member.rolname::text = any($1::text[])
      order by parent.rolname, member.rolname, grantor.rolname
    `,
    [W00_RUNTIME_ROLES],
  );
  const expectedMemberships = [
    {
      parent_role: "fieldgrid_runtime_app",
      member_role: config.migration_admin,
      grantor_role: config.app_admin_grantor,
      admin_option: true,
      inherit_option: false,
      set_option: false,
    },
    {
      parent_role: "fieldgrid_runtime_data",
      member_role: config.migration_admin,
      grantor_role: config.data_admin_grantor,
      admin_option: true,
      inherit_option: false,
      set_option: false,
    },
    {
      parent_role: "fieldgrid_runtime_data",
      member_role: "fieldgrid_runtime_app",
      grantor_role: config.migration_admin,
      admin_option: false,
      inherit_option: true,
      set_option: false,
    },
  ].sort((left, right) =>
    `${left.parent_role}:${left.member_role}:${left.grantor_role}`.localeCompare(
      `${right.parent_role}:${right.member_role}:${right.grantor_role}`,
    ),
  );
  if (
    config.migration_admin !== expectedMigrationAdministrator ||
    !config.app_admin_grantor ||
    !config.data_admin_grantor ||
    JSON.stringify(memberships.rows) !== JSON.stringify(expectedMemberships)
  ) {
    fail("The W00 runtime role membership topology is not exact.");
  }

  const runtimePrivileges = await client.query(
    `
      select
        principal.role_name,
        target.table_name,
        privilege.privilege_name,
        pg_catalog.has_table_privilege(
          principal.role_name,
          pg_catalog.format('public.%I', target.table_name),
          privilege.privilege_name
        ) as permitted
      from unnest($1::text[]) principal(role_name)
      cross join unnest($2::text[]) target(table_name)
      cross join unnest($3::text[]) privilege(privilege_name)
      order by principal.role_name, target.table_name, privilege.privilege_name
    `,
    [W00_RUNTIME_ROLES, W00_TARGET_TABLES, TABLE_PRIVILEGES],
  );
  if (
    runtimePrivileges.rows.length !==
      W00_RUNTIME_ROLES.length *
        W00_TARGET_TABLES.length *
        TABLE_PRIVILEGES.length ||
    runtimePrivileges.rows.some(
      (row) =>
        row.permitted !==
        W00_RUNTIME_POLICY_OPERATIONS[row.table_name].includes(
          row.privilege_name.toLowerCase(),
        ),
    )
  ) {
    fail("The W00 runtime table privilege profile is not exact.");
  }

  return {
    runtimeRolesVerified: runtimeRoles.rows.length,
    runtimeMembershipsVerified: memberships.rows.length,
    runtimeTablePrivilegesVerified: runtimePrivileges.rows.length,
  };
}

export async function verifyW00AclClosure(
  client,
  {
    expectedOwner = null,
    policyProfile = null,
    requireCurrentUserOwner = false,
  } = {},
) {
  if (policyProfile !== null && policyProfile !== W00_RUNTIME_POLICY_PROFILE) {
    fail("The W00 policy profile is unsupported.");
  }
  const expectedPolicyCount =
    policyProfile === W00_RUNTIME_POLICY_PROFILE ? W00_RUNTIME_POLICY_COUNT : 0;
  const roles = await client.query(
    `
      select role_row.rolname::text as role_name
      from pg_catalog.pg_roles role_row
      where role_row.rolname::text = any($1::text[])
      order by role_row.rolname
    `,
    [W00_CLIENT_ROLES],
  );
  if (
    roles.rows.length !== W00_CLIENT_ROLES.length ||
    roles.rows.some(
      (row, index) => row.role_name !== [...W00_CLIENT_ROLES].sort()[index],
    )
  ) {
    fail("The W00 browser-facing database role set is incomplete.");
  }

  const tables = await client.query(
    `
      select
        table_row.relname::text as table_name,
        pg_catalog.pg_get_userbyid(table_row.relowner) as owner,
        table_row.relowner = current_user::pg_catalog.regrole::oid
          as current_user_is_owner,
        table_row.relrowsecurity as rls_enabled,
        table_row.relforcerowsecurity as rls_forced,
        (
          select count(*)::integer
          from pg_catalog.pg_policy policy
          where policy.polrelid = table_row.oid
        ) as policy_count
      from pg_catalog.pg_class table_row
      join pg_catalog.pg_namespace namespace_row
        on namespace_row.oid = table_row.relnamespace
      where namespace_row.nspname = 'public'
        and table_row.relkind = 'r'
        and table_row.relname::text = any($1::text[])
      order by table_row.relname
    `,
    [W00_TARGET_TABLES],
  );
  if (
    tables.rows.length !== W00_TARGET_TABLES.length ||
    tables.rows.some(
      (row) =>
        row.rls_enabled !== true ||
        row.rls_forced !== false ||
        row.policy_count !==
          (policyProfile === W00_RUNTIME_POLICY_PROFILE
            ? W00_RUNTIME_POLICY_OPERATIONS[row.table_name]?.length
            : 0) ||
        (requireCurrentUserOwner && row.current_user_is_owner !== true) ||
        (expectedOwner !== null && row.owner !== expectedOwner),
    ) ||
    new Set(tables.rows.map((row) => row.owner)).size !== 1
  ) {
    fail("The W00 table ownership or RLS state is invalid.");
  }

  const policies = await client.query(
    `
      select
        table_row.relname::text as table_name,
        policy.polname::text as policy_name,
        policy.polcmd::text as command,
        policy.polpermissive as permissive,
        array(
          select case
            when role_oid = 0 then 'PUBLIC'
            else pg_catalog.pg_get_userbyid(role_oid)::text
          end
          from unnest(policy.polroles) role_oid
          order by 1
        ) as roles,
        case
          when policy.polqual is null then null
          else pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
        end as using_expression,
        case
          when policy.polwithcheck is null then null
          else pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid)
        end as check_expression
      from pg_catalog.pg_policy policy
      join pg_catalog.pg_class table_row on table_row.oid = policy.polrelid
      join pg_catalog.pg_namespace namespace_row
        on namespace_row.oid = table_row.relnamespace
      where namespace_row.nspname = 'public'
        and table_row.relname::text = any($1::text[])
      order by table_row.relname, policy.polname
    `,
    [W00_TARGET_TABLES],
  );
  const expectedPolicies =
    policyProfile === W00_RUNTIME_POLICY_PROFILE
      ? Object.entries(W00_RUNTIME_POLICY_OPERATIONS)
          .flatMap(([tableName, operations]) =>
            operations.map((operation) => {
              const shape = POLICY_OPERATION_SHAPES[operation];
              return {
                table_name: tableName,
                policy_name: `fieldgrid_runtime_data_${operation}`,
                command: shape.command,
                permissive: true,
                roles: ["fieldgrid_runtime_data"],
                using_expression: shape.usingExpression,
                check_expression: shape.checkExpression,
              };
            }),
          )
          .sort((left, right) =>
            `${left.table_name}:${left.policy_name}`.localeCompare(
              `${right.table_name}:${right.policy_name}`,
            ),
          )
      : [];
  if (
    policies.rows.length !== expectedPolicyCount ||
    JSON.stringify(policies.rows) !== JSON.stringify(expectedPolicies)
  ) {
    fail("The W00 RLS policy profile is invalid.");
  }

  const runtimeProfile =
    policyProfile === W00_RUNTIME_POLICY_PROFILE
      ? await verifyW00RuntimeProfileClosure(client, tables.rows[0].owner)
      : {
          runtimeRolesVerified: 0,
          runtimeMembershipsVerified: 0,
          runtimeTablePrivilegesVerified: 0,
        };

  const directAcl = await client.query(
    `
      with target_tables as (
        select table_row.oid, table_row.relname, table_row.relacl
        from pg_catalog.pg_class table_row
        join pg_catalog.pg_namespace namespace_row
          on namespace_row.oid = table_row.relnamespace
        where namespace_row.nspname = 'public'
          and table_row.relkind = 'r'
          and table_row.relname::text = any($1::text[])
      ),
      owned_sequences as (
        select distinct
          sequence_row.oid,
          sequence_namespace.nspname,
          sequence_row.relname,
          sequence_row.relacl
        from pg_catalog.pg_depend dependency
        join pg_catalog.pg_class sequence_row
          on sequence_row.oid = dependency.objid
         and sequence_row.relkind = 'S'
        join pg_catalog.pg_namespace sequence_namespace
          on sequence_namespace.oid = sequence_row.relnamespace
        join target_tables target
          on target.oid = dependency.refobjid
        where dependency.classid =
                'pg_catalog.pg_class'::pg_catalog.regclass
          and dependency.refclassid =
                'pg_catalog.pg_class'::pg_catalog.regclass
          and dependency.deptype in ('a', 'i')
      )
      select 1
      from target_tables target
      cross join lateral pg_catalog.aclexplode(target.relacl) acl
      left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
      where acl.grantee = 0
         or grantee.rolname::text = any($2::text[])

      union all

      select 1
      from target_tables target
      join pg_catalog.pg_attribute column_row
        on column_row.attrelid = target.oid
       and column_row.attnum > 0
       and not column_row.attisdropped
      cross join lateral pg_catalog.aclexplode(column_row.attacl) acl
      left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
      where acl.grantee = 0
         or grantee.rolname::text = any($2::text[])

      union all

      select 1
      from owned_sequences sequence_row
      cross join lateral pg_catalog.aclexplode(sequence_row.relacl) acl
      left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
      where acl.grantee = 0
         or grantee.rolname::text = any($2::text[])
    `,
    [W00_TARGET_TABLES, W00_CLIENT_ROLES],
  );
  if (directAcl.rows.length !== 0) {
    fail("A direct W00 ACL entry remains.");
  }

  const privilegeParameters = [
    W00_TARGET_TABLES,
    W00_CLIENT_ROLES,
    TABLE_PRIVILEGES,
    COLUMN_PRIVILEGES,
    SEQUENCE_PRIVILEGES,
  ];
  const effectivePrivileges = await client.query(
    `
      with principals as (
        select role_row.oid, role_row.rolname::text as role_name
        from pg_catalog.pg_roles role_row
        where role_row.rolname::text = any($2::text[])
      ),
      target_tables as (
        select table_row.oid, table_row.relname
        from pg_catalog.pg_class table_row
        join pg_catalog.pg_namespace namespace_row
          on namespace_row.oid = table_row.relnamespace
        where namespace_row.nspname = 'public'
          and table_row.relkind = 'r'
          and table_row.relname::text = any($1::text[])
      ),
      target_columns as (
        select
          target.oid as table_oid,
          column_row.attnum
        from target_tables target
        join pg_catalog.pg_attribute column_row
          on column_row.attrelid = target.oid
         and column_row.attnum > 0
         and not column_row.attisdropped
      ),
      owned_sequences as (
        select distinct sequence_row.oid
        from pg_catalog.pg_depend dependency
        join pg_catalog.pg_class sequence_row
          on sequence_row.oid = dependency.objid
         and sequence_row.relkind = 'S'
        join target_tables target
          on target.oid = dependency.refobjid
        where dependency.classid =
                'pg_catalog.pg_class'::pg_catalog.regclass
          and dependency.refclassid =
                'pg_catalog.pg_class'::pg_catalog.regclass
          and dependency.deptype in ('a', 'i')
      )
      select 1
      from target_tables target
      cross join principals principal
      cross join unnest($3::text[]) privilege(privilege_name)
      where pg_catalog.has_table_privilege(
        principal.oid,
        target.oid,
        privilege.privilege_name
      )

      union all

      select 1
      from target_columns column_row
      cross join principals principal
      cross join unnest($4::text[]) privilege(privilege_name)
      where pg_catalog.has_column_privilege(
        principal.oid,
        column_row.table_oid,
        column_row.attnum,
        privilege.privilege_name
      )

      union all

      select 1
      from owned_sequences sequence_row
      cross join principals principal
      cross join unnest($5::text[]) privilege(privilege_name)
      where pg_catalog.has_sequence_privilege(
        principal.oid,
        sequence_row.oid,
        privilege.privilege_name
      )
    `,
    privilegeParameters,
  );
  if (effectivePrivileges.rows.length !== 0) {
    fail("An effective W00 object privilege remains.");
  }

  // PostgreSQL lets a role exercise ADMIN OPTION held by every role whose
  // privileges it inherits. Follow direct ADMIN edges from that USAGE closure;
  // MEMBER WITH ADMIN OPTION alone would also include wholly inert chains.
  // Ignore ADMIN-only superuser memberships: PostgreSQL forbids a non-superuser
  // from re-granting them, while an actual SET path is still rejected below.
  const controllableRolePaths = await client.query(
    `
      with recursive principals as (
        select role_row.oid, role_row.rolname::text as role_name
        from pg_catalog.pg_roles role_row
        where role_row.rolname::text = any($2::text[])
      ),
      target_tables as (
        select table_row.oid, table_row.relowner
        from pg_catalog.pg_class table_row
        join pg_catalog.pg_namespace namespace_row
          on namespace_row.oid = table_row.relnamespace
        where namespace_row.nspname = 'public'
          and table_row.relkind = 'r'
          and table_row.relname::text = any($1::text[])
      ),
      target_columns as (
        select target.oid as table_oid, column_row.attnum
        from target_tables target
        join pg_catalog.pg_attribute column_row
          on column_row.attrelid = target.oid
         and column_row.attnum > 0
         and not column_row.attisdropped
      ),
      owned_sequences as (
        select distinct sequence_row.oid, sequence_row.relowner
        from pg_catalog.pg_depend dependency
        join pg_catalog.pg_class sequence_row
          on sequence_row.oid = dependency.objid
         and sequence_row.relkind = 'S'
        join target_tables target
          on target.oid = dependency.refobjid
        where dependency.classid =
                'pg_catalog.pg_class'::pg_catalog.regclass
          and dependency.refclassid =
                'pg_catalog.pg_class'::pg_catalog.regclass
          and dependency.deptype in ('a', 'i')
      ),
      controllable_roles(source_oid, source_role, reachable_oid) as (
        select
          principal.oid,
          principal.role_name,
          principal.oid
        from principals principal

        union

        select
          controlled.source_oid,
          controlled.source_role,
          next_role.role_oid
        from controllable_roles controlled
        cross join lateral (
          select reachable_role.oid as role_oid
          from pg_catalog.pg_roles reachable_role
          where reachable_role.oid <> controlled.reachable_oid
            and pg_catalog.pg_has_role(
              controlled.reachable_oid,
              reachable_role.oid,
              'SET'
            )

          union

          select membership.roleid
          from pg_catalog.pg_auth_members membership
          join pg_catalog.pg_roles administered_role
            on administered_role.oid = membership.roleid
          where membership.admin_option
            and not administered_role.rolsuper
            and pg_catalog.pg_has_role(
              controlled.reachable_oid,
              membership.member,
              'USAGE'
            )
        ) next_role
      )
      select 1
      from controllable_roles controlled
      join pg_catalog.pg_roles reachable
        on reachable.oid = controlled.reachable_oid
      where controlled.reachable_oid <> controlled.source_oid
        and (
          reachable.rolsuper
         or reachable.rolbypassrls
         or exists (
           select 1
           from target_tables target
           where target.relowner = controlled.reachable_oid
         )
         or exists (
           select 1
           from target_tables target
           cross join unnest($3::text[]) privilege(privilege_name)
           where pg_catalog.has_table_privilege(
             controlled.reachable_oid,
             target.oid,
             privilege.privilege_name
           )
         )
         or exists (
           select 1
           from target_columns column_row
           cross join unnest($4::text[]) privilege(privilege_name)
           where pg_catalog.has_column_privilege(
             controlled.reachable_oid,
             column_row.table_oid,
             column_row.attnum,
             privilege.privilege_name
           )
         )
         or exists (
           select 1
           from owned_sequences sequence_row
           where sequence_row.relowner = controlled.reachable_oid
         )
         or exists (
           select 1
           from owned_sequences sequence_row
           cross join unnest($5::text[]) privilege(privilege_name)
           where pg_catalog.has_sequence_privilege(
             controlled.reachable_oid,
             sequence_row.oid,
             privilege.privilege_name
           )
         )
        )
    `,
    privilegeParameters,
  );
  if (controllableRolePaths.rows.length !== 0) {
    fail("A transitive SET/ADMIN role path reaches a W00 bypass capability.");
  }

  return {
    rolesVerified: roles.rows.length,
    tablesVerified: tables.rows.length,
    ownersUnified: true,
    currentUserOwnsAll: tables.rows.every(
      (row) => row.current_user_is_owner === true,
    ),
    rlsEnabled: true,
    rlsForced: false,
    policies: policies.rows.length,
    policyProfile,
    ...runtimeProfile,
    directAclViolations: 0,
    effectivePrivilegeViolations: 0,
    controllableRoleViolations: 0,
  };
}
