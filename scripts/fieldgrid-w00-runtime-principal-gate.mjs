#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CAPABILITY_ROLE,
  RUNTIME_ROLE,
  assertExactStagingEnvironment,
  assertRuntimePassword,
  assertRuntimeUrlDescriptor,
  assertStagingPoolerHost,
  requireEnv,
} from "./fieldgrid-w00-runtime-principal.mjs";
import { databaseNodePostgresSslConfig } from "./fieldgrid-database-root-cert.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const migrationsRoot = path.join(repoRoot, "lib/db/migrations");
const operationOrder = ["SELECT", "INSERT", "UPDATE", "DELETE"];
const serverOnlyRelations = [
  "credential_recovery_challenges",
  "credential_recovery_events",
  "platform_users",
  "support_access_grants",
  "support_access_audit_log",
  "portal_onboarding_sessions",
  "portal_onboarding_step_completions",
  "portal_notification_preferences",
  "offline_operation_receipts",
  "organization_settings",
  "tenant_domains",
];
const forcedServerOnlyRelations = new Set([
  "credential_recovery_challenges",
  "credential_recovery_events",
  "platform_users",
  "support_access_grants",
  "support_access_audit_log",
  "portal_onboarding_sessions",
  "portal_onboarding_step_completions",
  "portal_notification_preferences",
  "offline_operation_receipts",
]);

function loadCapabilityManifest() {
  const manifests = {
    relations: new Map(),
    functions: new Map(),
    sequences: new Map(),
  };
  const specifications = [
    {
      table: "fieldgrid_runtime_relation_capabilities",
      target: manifests.relations,
      tuple: /\(\s*'((?:public|app_private))',\s*'([a-z][a-z0-9_]*)',\s*'(direct|indirect|function_only|unused)',\s*ARRAY\[([^\]]*)\]::text\[\](?:,\s*'([^']+)')?\s*\)/gu,
      convert: (match, sourceMigration) => [
        `${match[1]}.${match[2]}`,
        {
          schema: match[1],
          name: match[2],
          mode: match[3],
          privileges: [...match[4].matchAll(/'([A-Z]+)'/gu)]
            .map((entry) => entry[1]),
          sourceMigration: match[5] ?? sourceMigration,
        },
      ],
    },
    {
      table: "fieldgrid_runtime_function_capabilities",
      target: manifests.functions,
      tuple: /\(\s*'((?:public|app_private))',\s*'([a-z][a-z0-9_]*)',\s*'([^']*)',\s*'(direct|default_expression|trigger_dependency)'(?:,\s*'([^']+)')?\s*\)/gu,
      convert: (match, sourceMigration) => [
        `${match[1]}.${match[2]}(${match[3]})`,
        {
          schema: match[1],
          name: match[2],
          argumentTypes: match[3],
          mode: match[4],
          sourceMigration: match[5] ?? sourceMigration,
        },
      ],
    },
    {
      table: "fieldgrid_runtime_sequence_capabilities",
      target: manifests.sequences,
      tuple: /\(\s*'((?:public|app_private))',\s*'([a-z][a-z0-9_]*)',\s*'(trigger_dependency|function_only)',\s*ARRAY\[([^\]]*)\]::text\[\](?:,\s*'([^']+)')?\s*\)/gu,
      convert: (match, sourceMigration) => [
        `${match[1]}.${match[2]}`,
        {
          schema: match[1],
          name: match[2],
          mode: match[3],
          privileges: [...match[4].matchAll(/'([A-Z]+)'/gu)]
            .map((entry) => entry[1]),
          sourceMigration: match[5] ?? sourceMigration,
        },
      ],
    },
  ];

  for (const migration of readdirSync(migrationsRoot)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(path.join(migrationsRoot, migration), "utf8");
    for (const specification of specifications) {
      const eventPattern = new RegExp(
        `DELETE\\s+FROM\\s+app_private\\.${specification.table}[^;]*;`
          + `|INSERT\\s+INTO\\s+app_private\\.${specification.table}`
          + `\\s*\\([^;]*?\\)\\s*VALUES\\s*[\\s\\S]*?;`,
        "giu",
      );
      for (const event of sql.matchAll(eventPattern)) {
        if (/^DELETE\b/iu.test(event[0])) {
          if (!/\bWHERE\s+source_migration\s*=/iu.test(event[0])) {
            specification.target.clear();
          }
          continue;
        }
        for (const tuple of event[0].matchAll(specification.tuple)) {
          const [key, value] = specification.convert(tuple, migration);
          specification.target.set(key, value);
        }
      }
    }
  }
  return manifests;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSetEqual(actual, expected, label) {
  const missing = [...expected].filter((value) => !actual.has(value)).sort();
  const unexpected = [...actual].filter((value) => !expected.has(value)).sort();
  assert(
    missing.length === 0 && unexpected.length === 0,
    `${label} mismatch; missing=[${missing.join(", ")}], unexpected=[${unexpected.join(", ")}]`,
  );
}

function roleList(value) {
  return Array.isArray(value) ? value : [];
}

async function assertIdentityAndTopology(client) {
  const identity = await client.query(`
    select
      current_user::text as current_user,
      session_user::text as session_user,
      current_setting('row_security') as row_security,
      current_setting('search_path') as search_path,
      app.rolcanlogin as app_can_login,
      app.rolinherit as app_inherits,
      app.rolsuper as app_super,
      app.rolcreatedb as app_create_db,
      app.rolcreaterole as app_create_role,
      app.rolreplication as app_replication,
      app.rolbypassrls as app_bypass_rls,
      data.rolcanlogin as data_can_login,
      data.rolinherit as data_inherits,
      data.rolsuper as data_super,
      data.rolcreatedb as data_create_db,
      data.rolcreaterole as data_create_role,
      data.rolreplication as data_replication,
      data.rolbypassrls as data_bypass_rls
    from pg_catalog.pg_roles app
    join pg_catalog.pg_roles data
      on data.rolname = 'fieldgrid_runtime_data'
    where app.rolname = current_user
  `);
  const row = identity.rows[0];
  assert(
    row
      && row.current_user === RUNTIME_ROLE
      && row.session_user === RUNTIME_ROLE
      && row.row_security === "on"
      && row.search_path.replaceAll(" ", "") === "pg_catalog,public"
      && row.app_can_login
      && row.app_inherits
      && !row.app_super
      && !row.app_create_db
      && !row.app_create_role
      && !row.app_replication
      && !row.app_bypass_rls
      && !row.data_can_login
      && !row.data_inherits
      && !row.data_super
      && !row.data_create_db
      && !row.data_create_role
      && !row.data_replication
      && !row.data_bypass_rls,
    "Runtime identity or role attributes are not exact.",
  );

  const topology = await client.query(`
    select
      parent.rolname::text as parent_role,
      member.rolname::text as member_role,
      grantor.rolname::text as grantor_role,
      grantor.rolsuper as grantor_super,
      membership.admin_option,
      membership.inherit_option,
      membership.set_option
    from pg_catalog.pg_auth_members membership
    join pg_catalog.pg_roles parent on parent.oid = membership.roleid
    join pg_catalog.pg_roles member on member.oid = membership.member
    join pg_catalog.pg_roles grantor on grantor.oid = membership.grantor
    where parent.rolname in ('fieldgrid_runtime_app', 'fieldgrid_runtime_data')
       or member.rolname in ('fieldgrid_runtime_app', 'fieldgrid_runtime_data')
    order by parent.rolname, member.rolname
  `);
  const dataEdges = topology.rows.filter(
    (edge) => edge.parent_role === CAPABILITY_ROLE,
  );
  const appParents = topology.rows.filter(
    (edge) => edge.member_role === RUNTIME_ROLE,
  );
  const dataParents = topology.rows.filter(
    (edge) => edge.member_role === CAPABILITY_ROLE,
  );
  const appAdministrators = topology.rows.filter(
    (edge) => edge.parent_role === RUNTIME_ROLE,
  );
  const migrationAdministrator = appAdministrators[0]?.member_role;
  const dataAdministratorEdges = dataEdges.filter(
    (edge) => edge.member_role === migrationAdministrator,
  );
  const appCapabilityEdges = dataEdges.filter(
    (edge) => edge.member_role === RUNTIME_ROLE,
  );
  assert(
    dataEdges.length === 2
      && appCapabilityEdges.length === 1
      && !appCapabilityEdges[0].admin_option
      && appCapabilityEdges[0].inherit_option
      && !appCapabilityEdges[0].set_option
      && appCapabilityEdges[0].grantor_role === migrationAdministrator
      && appParents.length === 1
      && appParents[0].parent_role === CAPABILITY_ROLE
      && dataParents.length === 0
      && appAdministrators.length === 1
      && migrationAdministrator !== RUNTIME_ROLE
      && migrationAdministrator !== CAPABILITY_ROLE
      && appAdministrators[0].admin_option
      && !appAdministrators[0].inherit_option
      && !appAdministrators[0].set_option
      && appAdministrators[0].grantor_super
      && dataAdministratorEdges.length === 1
      && dataAdministratorEdges[0].admin_option
      && !dataAdministratorEdges[0].inherit_option
      && !dataAdministratorEdges[0].set_option
      && dataAdministratorEdges[0].grantor_super
      && dataAdministratorEdges[0].grantor_role
        === appAdministrators[0].grantor_role,
    "Runtime membership topology is not exact.",
  );

  const functionDefaults = await client.query(`
    select
      default_acl.defaclnamespace,
      exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(
            default_acl.defaclacl,
            pg_catalog.acldefault('f', default_acl.defaclrole)
          )
        ) privilege
        where privilege.grantee = 0
          and privilege.privilege_type = 'EXECUTE'
      ) as public_execute
    from pg_catalog.pg_default_acl default_acl
    where default_acl.defaclrole = $1::text::pg_catalog.regrole::oid
      and default_acl.defaclobjtype = 'f'
      and default_acl.defaclnamespace = 0
  `, [migrationAdministrator]);
  assert(
    functionDefaults.rows.length === 1
      && Number(functionDefaults.rows[0].defaclnamespace) === 0
      && !functionDefaults.rows[0].public_execute,
    "Migration-admin function defaults are not fail-closed.",
  );

  const ownership = await client.query(`
    with runtime_roles as (
      select oid from pg_catalog.pg_roles
      where rolname in ('fieldgrid_runtime_app', 'fieldgrid_runtime_data')
    )
    select
      (select count(*)::integer from pg_catalog.pg_class object_row
       where object_row.relowner in (select oid from runtime_roles))
        as owned_relations,
      (select count(*)::integer from pg_catalog.pg_namespace schema_row
       where schema_row.nspowner in (select oid from runtime_roles))
        as owned_schemas,
      (select count(*)::integer from pg_catalog.pg_proc function_row
       where function_row.proowner in (select oid from runtime_roles))
        as owned_functions,
      pg_catalog.has_schema_privilege(
        current_user, 'public', 'CREATE'
      ) as public_create,
      pg_catalog.has_schema_privilege(
        current_user, 'app_private', 'CREATE'
      ) as private_create,
      pg_catalog.has_schema_privilege(
        current_user, 'auth', 'USAGE'
      ) as auth_usage
  `);
  const ownershipRow = ownership.rows[0];
  assert(
    ownershipRow?.owned_relations === 0
      && ownershipRow.owned_schemas === 0
      && ownershipRow.owned_functions === 0
      && !ownershipRow.public_create
      && !ownershipRow.private_create
      && !ownershipRow.auth_usage,
    "Runtime owns objects or has unsafe schema privileges.",
  );

  const escalation = await client.query(`
    with recursive controllable(reachable_oid) as (
      select current_user::pg_catalog.regrole::oid
      union
      select candidate.oid
      from controllable controlled
      cross join lateral (
        select reachable.oid
        from pg_catalog.pg_roles reachable
        where reachable.oid <> controlled.reachable_oid
          and (
            pg_catalog.pg_has_role(controlled.reachable_oid, reachable.oid, 'SET')
            or pg_catalog.pg_has_role(controlled.reachable_oid, reachable.oid, 'USAGE')
          )
        union
        select membership.roleid
        from pg_catalog.pg_auth_members membership
        where membership.admin_option
          and pg_catalog.pg_has_role(
            controlled.reachable_oid, membership.member, 'USAGE'
          )
      ) candidate
    )
    select reachable.rolname::text as reachable_role
    from controllable controlled
    join pg_catalog.pg_roles reachable on reachable.oid = controlled.reachable_oid
    where controlled.reachable_oid <> current_user::pg_catalog.regrole::oid
      and reachable.rolname <> 'fieldgrid_runtime_data'
      and (
        reachable.rolsuper
        or reachable.rolbypassrls
        or exists (
          select 1 from pg_catalog.pg_class owned
          where owned.relowner = reachable.oid
        )
        or exists (
          select 1 from pg_catalog.pg_namespace owned
          where owned.nspowner = reachable.oid
        )
        or exists (
          select 1 from pg_catalog.pg_proc owned
          where owned.proowner = reachable.oid
        )
      )
    limit 1
  `);
  assert(escalation.rows.length === 0, "Runtime has a privileged control path.");

  return { migrationAdministrator };
}

async function assertRelationClosure(client, relations, migrationAdministrator) {
  const catalog = await client.query(`
    select
      namespace_row.nspname::text as schema_name,
      relation.relname::text as relation_name,
      relation.relrowsecurity,
      relation.relforcerowsecurity,
      pg_catalog.has_table_privilege(current_user, relation.oid, 'SELECT') as can_select,
      pg_catalog.has_table_privilege(current_user, relation.oid, 'INSERT') as can_insert,
      pg_catalog.has_table_privilege(current_user, relation.oid, 'UPDATE') as can_update,
      pg_catalog.has_table_privilege(current_user, relation.oid, 'DELETE') as can_delete,
      pg_catalog.has_table_privilege(current_user, relation.oid, 'TRUNCATE') as can_truncate,
      pg_catalog.has_table_privilege(current_user, relation.oid, 'REFERENCES') as can_references,
      pg_catalog.has_table_privilege(current_user, relation.oid, 'TRIGGER') as can_trigger,
      pg_catalog.has_table_privilege(current_user, relation.oid, 'MAINTAIN') as can_maintain
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = relation.relnamespace
    where namespace_row.nspname = 'public'
      and relation.relkind in ('r', 'p')
    order by relation.relname
  `);
  assertSetEqual(
    new Set(catalog.rows.map((row) => `${row.schema_name}.${row.relation_name}`)),
    new Set(relations.keys()),
    "runtime relation manifest/catalog",
  );
  for (const row of catalog.rows) {
    const key = `${row.schema_name}.${row.relation_name}`;
    const expected = relations.get(key);
    const privileges = new Set(expected.privileges);
    for (const operation of operationOrder) {
      assert(
        row[`can_${operation.toLowerCase()}`] === privileges.has(operation),
        `Unexpected runtime ${operation} privilege on ${key}.`,
      );
    }
    assert(
      !row.can_truncate && !row.can_references && !row.can_trigger
        && !row.can_maintain,
      `Unsafe non-CRUD privilege exists on ${key}.`,
    );
    if (["direct", "indirect"].includes(expected.mode)) {
      assert(row.relrowsecurity, `Runtime relation lacks RLS: ${key}.`);
    }
  }

  const policies = await client.query(`
    select
      namespace_row.nspname::text as schema_name,
      relation.relname::text as relation_name,
      policy.polname::text as policy_name,
      policy.polcmd,
      policy.polpermissive,
      array(
        select role_row.rolname::text
        from unnest(policy.polroles) role_oid
        join pg_catalog.pg_roles role_row on role_row.oid = role_oid
        order by role_row.rolname
      ) as roles,
      pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) as using_expression,
      pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) as check_expression
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_class relation on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = relation.relnamespace
    where policy.polname like 'fieldgrid_runtime_data\\_%' escape '\\'
    order by namespace_row.nspname, relation.relname, policy.polname
  `);
  const policyCommand = {
    SELECT: "r",
    INSERT: "a",
    UPDATE: "w",
    DELETE: "d",
  };
  const expectedPolicies = new Map();
  for (const capability of relations.values()) {
    if (!["direct", "indirect"].includes(capability.mode)) continue;
    for (const operation of capability.privileges) {
      expectedPolicies.set(
        `${capability.schema}.${capability.name}:fieldgrid_runtime_data_${operation.toLowerCase()}`,
        { operation, capability },
      );
    }
  }
  assertSetEqual(
    new Set(policies.rows.map(
      (row) => `${row.schema_name}.${row.relation_name}:${row.policy_name}`,
    )),
    new Set(expectedPolicies.keys()),
    "runtime RLS policy closure",
  );
  for (const row of policies.rows) {
    const expected = expectedPolicies.get(
      `${row.schema_name}.${row.relation_name}:${row.policy_name}`,
    );
    assert(
      expected
        && row.polcmd === policyCommand[expected.operation]
        && row.polpermissive
        && roleList(row.roles).length === 1
        && row.roles[0] === CAPABILITY_ROLE,
      `Runtime policy metadata has drifted on ${row.schema_name}.${row.relation_name}.`,
    );
    const expectsUsing = expected.operation !== "INSERT";
    const expectsCheck = ["INSERT", "UPDATE"].includes(expected.operation);
    assert(
      (expectsUsing ? row.using_expression === "true" : row.using_expression === null)
        && (expectsCheck ? row.check_expression === "true" : row.check_expression === null),
      `Runtime policy expression has drifted on ${row.schema_name}.${row.relation_name}.`,
    );
  }

  for (const relationName of serverOnlyRelations) {
    const row = catalog.rows.find((candidate) => candidate.relation_name === relationName);
    assert(
      row?.relrowsecurity
        && row.relforcerowsecurity === forcedServerOnlyRelations.has(relationName),
      `Server-only RLS mode has drifted on public.${relationName}.`,
    );
  }

  const serverOnlyPolicyRoles = await client.query(`
    select relation.relname::text as relation_name,
           policy.polname::text as policy_name,
           array(
             select role_row.rolname::text
             from unnest(policy.polroles) role_oid
             join pg_catalog.pg_roles role_row on role_row.oid = role_oid
             order by role_row.rolname
           ) as roles
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_class relation on relation.oid = policy.polrelid
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = relation.relnamespace
    where namespace_row.nspname = 'public'
      and relation.relname = any($1::text[])
  `, [serverOnlyRelations]);
  const expectedServerPolicies = new Map();
  for (const relationName of serverOnlyRelations) {
    const capability = relations.get(`public.${relationName}`);
    if (["direct", "indirect"].includes(capability?.mode)) {
      for (const operation of capability.privileges) {
        expectedServerPolicies.set(
          `${relationName}:fieldgrid_runtime_data_${operation.toLowerCase()}`,
          CAPABILITY_ROLE,
        );
      }
    }
    if (forcedServerOnlyRelations.has(relationName)) {
      const adminOperations = relationName === "offline_operation_receipts"
        ? ["SELECT", "INSERT", "UPDATE"]
        : capability.privileges;
      for (const operation of adminOperations) {
        expectedServerPolicies.set(
          `${relationName}:fieldgrid_migration_admin_compat_${operation.toLowerCase()}`,
          migrationAdministrator,
        );
      }
    }
  }
  assertSetEqual(
    new Set(serverOnlyPolicyRoles.rows.map(
      (row) => `${row.relation_name}:${row.policy_name}`,
    )),
    new Set(expectedServerPolicies.keys()),
    "server-only policy closure",
  );
  assert(
    serverOnlyPolicyRoles.rows.every(
      (row) => row.roles.length === 1
        && row.roles[0] === expectedServerPolicies.get(
          `${row.relation_name}:${row.policy_name}`,
        ),
    ),
    "A server-only policy targets an unexpected principal.",
  );

  const browserAcl = await client.query(`
    select principal.role_name, target.relation_name, operation.privilege
    from unnest($1::text[]) principal(role_name)
    cross join unnest($2::text[]) target(relation_name)
    cross join unnest($3::text[]) operation(privilege)
    where pg_catalog.has_table_privilege(
      principal.role_name,
      pg_catalog.to_regclass(pg_catalog.format('public.%I', target.relation_name)),
      operation.privilege
    )
  `, [
    ["anon", "authenticated", "service_role"],
    serverOnlyRelations,
    [...operationOrder, "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"],
  ]);
  assert(browserAcl.rows.length === 0, "Browser/service server-only ACL drift exists.");
}

async function assertSequenceClosure(client, sequences) {
  const catalog = await client.query(`
    select namespace_row.nspname::text as schema_name,
           sequence_row.relname::text as sequence_name,
           pg_catalog.has_sequence_privilege(
             current_user, sequence_row.oid, 'SELECT'
           ) as can_select,
           pg_catalog.has_sequence_privilege(
             current_user, sequence_row.oid, 'UPDATE'
           ) as can_update,
           pg_catalog.has_sequence_privilege(
             current_user, sequence_row.oid, 'USAGE'
           ) as can_usage
    from pg_catalog.pg_class sequence_row
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = sequence_row.relnamespace
    where namespace_row.nspname = 'public'
      and sequence_row.relkind = 'S'
    order by sequence_row.relname
  `);
  assertSetEqual(
    new Set(catalog.rows.map((row) => `${row.schema_name}.${row.sequence_name}`)),
    new Set(sequences.keys()),
    "runtime sequence manifest/catalog",
  );
  for (const row of catalog.rows) {
    const key = `${row.schema_name}.${row.sequence_name}`;
    const privileges = new Set(sequences.get(key).privileges);
    for (const operation of ["SELECT", "UPDATE", "USAGE"]) {
      assert(
        row[`can_${operation.toLowerCase()}`] === privileges.has(operation),
        `Unexpected runtime ${operation} privilege on sequence ${key}.`,
      );
    }
  }
}

async function assertFunctionClosure(client, functions) {
  const catalog = await client.query(`
    select
      function_row.oid,
      namespace_row.nspname::text as schema_name,
      function_row.proname::text as function_name,
      pg_catalog.oidvectortypes(function_row.proargtypes) as argument_types,
      pg_catalog.has_function_privilege(
        current_user, function_row.oid, 'EXECUTE'
      ) as can_execute
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = function_row.pronamespace
    where namespace_row.nspname in ('public', 'app_private')
      and function_row.prokind = 'f'
      and not exists (
        select 1
        from pg_catalog.pg_depend dependency
        where dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
          and dependency.objid = function_row.oid
          and dependency.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
          and dependency.deptype = 'e'
      )
    order by namespace_row.nspname, function_row.proname, argument_types
  `);
  const actualAllowed = new Set(catalog.rows.filter((row) => row.can_execute).map(
    (row) => `${row.schema_name}.${row.function_name}(${row.argument_types})`,
  ));
  assertSetEqual(actualAllowed, new Set(functions.keys()), "runtime function ACL closure");
  for (const key of functions.keys()) {
    assert(
      catalog.rows.some(
        (row) => `${row.schema_name}.${row.function_name}(${row.argument_types})` === key,
      ),
      `Manifest function is absent from the catalog: ${key}.`,
    );
  }

  const helper = await client.query(`
    select
      function_row.prosecdef,
      function_row.provolatile,
      function_row.proconfig,
      pg_catalog.pg_get_function_result(function_row.oid) as result_type,
      owner_role.rolname::text as owner_role,
      pg_catalog.has_function_privilege(
        'fieldgrid_runtime_app', function_row.oid, 'EXECUTE'
      ) as runtime_execute,
      pg_catalog.has_function_privilege(
        'fieldgrid_runtime_data', function_row.oid, 'EXECUTE'
      ) as data_execute,
      pg_catalog.has_function_privilege(
        'anon', function_row.oid, 'EXECUTE'
      ) as anon_execute,
      pg_catalog.has_function_privilege(
        'authenticated', function_row.oid, 'EXECUTE'
      ) as authenticated_execute,
      pg_catalog.has_function_privilege(
        'service_role', function_row.oid, 'EXECUTE'
      ) as service_execute
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_roles owner_role on owner_role.oid = function_row.proowner
    where function_row.oid =
      'app_private.fieldgrid_auth_user_snapshot(uuid)'::pg_catalog.regprocedure
  `);
  const row = helper.rows[0];
  assert(
    row
      && row.prosecdef
      && row.provolatile === "s"
      && Array.isArray(row.proconfig)
      && row.proconfig.length === 1
      && row.proconfig[0] === "search_path=pg_catalog"
      && row.result_type === "TABLE(id uuid, email text, raw_app_meta_data jsonb)"
      && ![RUNTIME_ROLE, CAPABILITY_ROLE].includes(row.owner_role)
      && row.runtime_execute
      && row.data_execute
      && !row.anon_execute
      && !row.authenticated_execute
      && !row.service_execute,
    "Auth snapshot helper contract or ACL has drifted.",
  );
}

async function expectInsufficientPrivilege(client, label, sql) {
  const savepoint = `fieldgrid_denial_${label.replaceAll(/[^a-z0-9]/giu, "_")}`;
  await client.query(`savepoint ${savepoint}`);
  let denied = false;
  try {
    await client.query(sql);
  } catch (error) {
    denied = error?.code === "42501";
  } finally {
    await client.query(`rollback to savepoint ${savepoint}`);
    await client.query(`release savepoint ${savepoint}`);
  }
  assert(denied, `Expected an insufficient-privilege denial for ${label}.`);
}

async function assertRepresentativeRuntime(client, migrationAdministrator) {
  await client.query("select 1 from public.tenants limit 1");
  await client.query("select 1 from public.organization_settings limit 1");
  await client.query("select 1 from public.tenant_domains limit 1");
  await client.query(`
    select count(*)::integer
    from app_private.fieldgrid_auth_user_snapshot(
      '00000000-0000-0000-0000-000000000000'::uuid
    )
  `);

  await expectInsufficientPrivilege(
    client,
    "auth_users",
    "select 1 from auth.users limit 1",
  );
  await expectInsufficientPrivilege(
    client,
    "offline_receipts",
    "select 1 from public.offline_operation_receipts limit 1",
  );
  await expectInsufficientPrivilege(
    client,
    "private_manifest",
    "select 1 from app_private.fieldgrid_runtime_relation_capabilities limit 1",
  );
  const quotedAdministrator = `"${migrationAdministrator.replaceAll('"', '""')}"`;
  await expectInsufficientPrivilege(
    client,
    "migration_owner",
    `set role ${quotedAdministrator}`,
  );
}

async function runStrictGate(env = process.env) {
  const exactSha = assertExactStagingEnvironment(env);
  const runtimeUrl = requireEnv(env, "FIELDGRID_RUNTIME_DATABASE_URL");
  const poolerHost = assertStagingPoolerHost(
    requireEnv(env, "FIELDGRID_STAGING_DATABASE_POOLER_HOST"),
  );
  const descriptor = assertRuntimeUrlDescriptor(runtimeUrl, poolerHost);
  assertRuntimePassword(decodeURIComponent(descriptor.password));
  const ssl = databaseNodePostgresSslConfig(env);
  const manifests = loadCapabilityManifest();
  assert(
    manifests.relations.size > 0
      && manifests.functions.size > 0
      && manifests.sequences.size > 0,
    "Runtime capability manifests are empty.",
  );

  const dbRequire = createRequire(new URL("../lib/db/package.json", import.meta.url));
  const { Client } = dbRequire("pg");
  const client = new Client({
    connectionString: runtimeUrl,
    ssl,
    application_name: "fieldgrid-w00-runtime-principal-gate",
  });
  await client.connect();
  try {
    await client.query("begin transaction read only");
    await client.query("set local statement_timeout = '30s'");
    await client.query("set local lock_timeout = '5s'");
    await client.query("set local row_security = on");
    const topology = await assertIdentityAndTopology(client);
    await assertRelationClosure(
      client,
      manifests.relations,
      topology.migrationAdministrator,
    );
    await assertSequenceClosure(client, manifests.sequences);
    await assertFunctionClosure(client, manifests.functions);
    await assertRepresentativeRuntime(client, topology.migrationAdministrator);
    await client.query("rollback");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }

  return {
    status: "passed",
    gate: "fieldgrid-w00-runtime-principal",
    exactSha,
    role: RUNTIME_ROLE,
    relationCapabilities: manifests.relations.size,
    functionCapabilities: manifests.functions.size,
    sequenceCapabilities: manifests.sequences.size,
  };
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || argv[0] !== "--strict") {
    throw new Error("Usage: fieldgrid-w00-runtime-principal-gate.mjs --strict");
  }
  process.stdout.write(`${JSON.stringify(await runStrictGate())}\n`);
}

if (
  process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      status: "failed",
      code: typeof error?.code === "string" ? error.code : null,
      kind: typeof error?.name === "string" ? error.name : "UnknownError",
    })}\n`);
    process.exitCode = 1;
  });
}

export {
  assertFunctionClosure,
  assertIdentityAndTopology,
  assertRelationClosure,
  assertRepresentativeRuntime,
  assertSequenceClosure,
  loadCapabilityManifest,
  runStrictGate,
};
