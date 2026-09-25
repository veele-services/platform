import { buildScramVerifier } from "../fieldgrid-w00-runtime-principal.mjs";
import { databaseInventory } from "../disposable-staging/database.mjs";
import {
  APP_SCHEMAS,
  MANAGED_SCHEMAS,
  MIGRATION_ROLE,
  digest,
  requireThat,
} from "./contract.mjs";

const RUNTIME_ROLES = Object.freeze([
  "fieldgrid_runtime_app",
  "fieldgrid_runtime_data",
]);

function identifier(value) {
  requireThat(
    typeof value === "string" && value.length > 0 && value.length <= 63,
    "CATALOG_IDENTIFIER_INVALID",
  );
  return `"${value.replaceAll('"', '""')}"`;
}

function qualified(schema, name) {
  return `${identifier(schema)}.${identifier(name)}`;
}

export async function assertLegacyPrincipal(client) {
  const result = await client.query(`
    SELECT current_user::text AS current_user,session_user::text AS session_user,
      current_database() AS database_name,rolsuper,rolbypassrls,rolcreaterole,
      rolcreatedb,rolreplication,rolinherit,rolcanlogin
    FROM pg_roles WHERE rolname=current_user
  `);
  const row = result.rows[0];
  requireThat(
    result.rows.length === 1 &&
      row.current_user === "postgres" &&
      row.session_user === "postgres" &&
      row.database_name === "postgres" &&
      row.rolsuper === false &&
      row.rolbypassrls === true &&
      row.rolcreaterole === true &&
      row.rolcreatedb === true &&
      row.rolcanlogin === true,
    "LEGACY_PRINCIPAL_INVALID",
  );
  return {
    name: row.current_user,
    superuser: row.rolsuper,
    bypassRls: row.rolbypassrls,
    createRole: row.rolcreaterole,
    createDb: row.rolcreatedb,
    replication: row.rolreplication,
    inherit: row.rolinherit,
    login: row.rolcanlogin,
    database: row.database_name,
  };
}

export async function managedCatalogSnapshot(client) {
  const schemas = await client.query(
    `SELECT nspname,pg_get_userbyid(nspowner) AS owner
     FROM pg_namespace WHERE nspname=ANY($1::text[]) ORDER BY nspname`,
    [[...MANAGED_SCHEMAS]],
  );
  const relations = await client.query(
    `SELECT n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity,c.relforcerowsecurity
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname=ANY($1::text[])
     ORDER BY n.nspname,c.relname,c.relkind`,
    [[...MANAGED_SCHEMAS]],
  );
  const columns = await client.query(
    `SELECT n.nspname,c.relname,a.attname,a.atttypid::text,a.atttypmod,
       a.attnotnull,a.attidentity,a.attgenerated,coll.collname AS collation,
       pg_get_expr(d.adbin,d.adrelid) AS default_expression
     FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
     LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
     LEFT JOIN pg_collation coll ON coll.oid=a.attcollation
     WHERE n.nspname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped
     ORDER BY n.nspname,c.relname,a.attnum`,
    [[...MANAGED_SCHEMAS]],
  );
  const routines = await client.query(
    `SELECT n.nspname,p.proname,p.prokind,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname=ANY($1::text[])
     ORDER BY n.nspname,p.proname,identity_arguments`,
    [[...MANAGED_SCHEMAS]],
  );
  const types = await client.query(
    `SELECT n.nspname,t.typname,t.typtype,pg_get_userbyid(t.typowner) AS owner
     FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
     WHERE n.nspname=ANY($1::text[])
     ORDER BY n.nspname,t.typname`,
    [[...MANAGED_SCHEMAS]],
  );
  const policies = await client.query(
    `SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
     FROM pg_policies WHERE schemaname=ANY($1::text[])
     ORDER BY schemaname,tablename,policyname`,
    [[...MANAGED_SCHEMAS]],
  );
  const triggers = await client.query(
    `SELECT n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
     FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname=ANY($1::text[]) AND NOT t.tgisinternal
     ORDER BY n.nspname,c.relname,t.tgname`,
    [[...MANAGED_SCHEMAS]],
  );
  const extensions = await client.query(
    `SELECT e.extname,e.extversion,n.nspname AS schema_name
     FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
     ORDER BY e.extname`,
  );
  const accessControl = await client.query(
    `SELECT object_kind,schema_name,object_name,subobject_name,acl_entry
     FROM (
       SELECT 'schema'::text AS object_kind,n.nspname AS schema_name,
         NULL::name AS object_name,NULL::name AS subobject_name,
         pg_get_userbyid(n.nspowner) AS owner_name,acl::text AS acl_entry
       FROM pg_namespace n CROSS JOIN LATERAL unnest(COALESCE(n.nspacl,'{}'::aclitem[])) acl
       WHERE n.nspname=ANY($1::text[])
       UNION ALL
       SELECT 'relation',n.nspname,c.relname,NULL::name,
         pg_get_userbyid(c.relowner),acl::text
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       CROSS JOIN LATERAL unnest(COALESCE(c.relacl,'{}'::aclitem[])) acl
       WHERE n.nspname=ANY($1::text[])
       UNION ALL
       SELECT 'column',n.nspname,c.relname,a.attname,
         pg_get_userbyid(c.relowner),acl::text
       FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace
       CROSS JOIN LATERAL unnest(COALESCE(a.attacl,'{}'::aclitem[])) acl
       WHERE n.nspname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped
       UNION ALL
       SELECT 'routine',n.nspname,p.proname,NULL::name,
         pg_get_userbyid(p.proowner),acl::text
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       CROSS JOIN LATERAL unnest(COALESCE(p.proacl,'{}'::aclitem[])) acl
       WHERE n.nspname=ANY($1::text[])
       UNION ALL
       SELECT 'type',n.nspname,t.typname,NULL::name,
         pg_get_userbyid(t.typowner),acl::text
       FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
       CROSS JOIN LATERAL unnest(COALESCE(t.typacl,'{}'::aclitem[])) acl
       WHERE n.nspname=ANY($1::text[])
     ) entries
     WHERE NOT (
       (
         split_part(acl_entry,'=',1)=owner_name
         AND object_kind='schema'
         AND split_part(split_part(acl_entry,'=',2),'/',1)='UC'
       )
       OR (
         split_part(acl_entry,'=',1)=$2
         AND (
           (object_kind='schema' AND schema_name='auth'
             AND split_part(split_part(acl_entry,'=',2),'/',1)='U')
           OR (
             object_kind='column' AND schema_name='auth' AND object_name='users'
             AND subobject_name IN ('id','email','raw_app_meta_data')
             AND split_part(split_part(acl_entry,'=',2),'/',1)='r'
           )
         )
       )
     )
     ORDER BY object_kind,schema_name,object_name,subobject_name,
       acl_entry`,
    [[...MANAGED_SCHEMAS], MIGRATION_ROLE],
  );
  const value = {
    schemas: schemas.rows,
    relations: relations.rows,
    columns: columns.rows,
    routines: routines.rows,
    types: types.rows,
    policies: policies.rows,
    triggers: triggers.rows,
    extensions: extensions.rows,
    accessControl: accessControl.rows,
  };
  return { ...value, digest: digest(value) };
}

export async function applicationOwnershipInventory(client) {
  const schemas = await client.query(
    `SELECT nspname AS schema_name,pg_get_userbyid(nspowner) AS owner
     FROM pg_namespace WHERE nspname=ANY($1::text[]) ORDER BY nspname`,
    [[...APP_SCHEMAS]],
  );
  const relations = await client.query(
    `SELECT n.nspname AS schema_name,c.relkind,pg_get_userbyid(c.relowner) AS owner,
       count(*)::int AS count
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname=ANY($1::text[]) AND c.relkind IN ('r','p','S','v','m','f')
     GROUP BY n.nspname,c.relkind,c.relowner ORDER BY 1,2,3`,
    [[...APP_SCHEMAS]],
  );
  const routines = await client.query(
    `SELECT n.nspname AS schema_name,p.prokind,p.prosecdef,
       pg_get_userbyid(p.proowner) AS owner,count(*)::int AS count
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname=ANY($1::text[])
     GROUP BY n.nspname,p.prokind,p.prosecdef,p.proowner ORDER BY 1,2,3,4`,
    [[...APP_SCHEMAS]],
  );
  const target = await client.query(
    `SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,
       rolreplication,rolinherit,rolcanlogin
     FROM pg_roles WHERE rolname=$1`,
    [MIGRATION_ROLE],
  );
  const runtime = await runtimeMembership(client);
  return {
    schemas: schemas.rows,
    relations: relations.rows,
    routines: routines.rows,
    targetRoleExists: target.rows.length === 1,
    targetRole: target.rows[0] ?? null,
    runtimeMembership: runtime,
  };
}

export async function bootstrapPlan(client) {
  const legacy = await assertLegacyPrincipal(client);
  await client.query("BEGIN READ ONLY");
  try {
    const ownership = await applicationOwnershipInventory(client);
    const managed = await managedCatalogSnapshot(client);
    await client.query("COMMIT");
    return {
      principal: legacy,
      applicationSchemas: ownership.schemas,
      applicationRelationOwners: ownership.relations,
      applicationRoutineOwners: ownership.routines,
      targetRoleExists: ownership.targetRoleExists,
      targetRole: ownership.targetRole,
      runtimeMembership: ownership.runtimeMembership,
      managedCatalogDigest: managed.digest,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function runtimeMembership(client) {
  const result = await client.query(
    `SELECT role.rolname AS role_name,member.rolname AS member_name,
       grantor.rolname AS grantor_name,m.admin_option,m.inherit_option,m.set_option
     FROM pg_auth_members m
     JOIN pg_roles role ON role.oid=m.roleid
     JOIN pg_roles member ON member.oid=m.member
     JOIN pg_roles grantor ON grantor.oid=m.grantor
     WHERE role.rolname=ANY($1::text[])
        OR member.rolname=ANY($1::text[])
        OR role.rolname=$2 OR member.rolname=$2
     ORDER BY role.rolname,member.rolname,grantor.rolname`,
    [[...RUNTIME_ROLES], MIGRATION_ROLE],
  );
  return result.rows;
}

async function verifyRuntimeRolesSafe(client) {
  const result = await client.query(
    `SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,
       rolreplication,rolcanlogin
     FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname`,
    [[...RUNTIME_ROLES]],
  );
  requireThat(
    result.rows.length === 2 &&
      result.rows.every(
        (row) =>
          row.rolsuper === false &&
          row.rolbypassrls === false &&
          row.rolcreaterole === false &&
          row.rolcreatedb === false &&
          row.rolreplication === false &&
          row.rolcanlogin === false,
      ),
    "RUNTIME_ROLE_ATTRIBUTES_INVALID",
  );
}

async function transferRelations(client) {
  const result = await client.query(
    `SELECT n.nspname AS schema_name,c.relname,c.relkind,
       pg_get_userbyid(c.relowner) AS owner
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname=ANY($1::text[]) AND c.relkind IN ('r','p','S','v','m','f')
     ORDER BY n.nspname,c.relname`,
    [[...APP_SCHEMAS]],
  );
  const kind = {
    r: "TABLE",
    p: "TABLE",
    S: "SEQUENCE",
    v: "VIEW",
    m: "MATERIALIZED VIEW",
    f: "FOREIGN TABLE",
  };
  for (const row of result.rows) {
    requireThat(
      row.owner === "postgres" || row.owner === MIGRATION_ROLE,
      "APPLICATION_OBJECT_OWNER_INVALID",
    );
    if (row.owner !== MIGRATION_ROLE) {
      await client.query(
        `ALTER ${kind[row.relkind]} ${qualified(row.schema_name, row.relname)} OWNER TO ${identifier(MIGRATION_ROLE)}`,
      );
    }
  }
}

async function transferRoutines(client) {
  const result = await client.query(
    `SELECT n.nspname AS schema_name,p.proname,p.prokind,p.prosecdef,
       pg_get_userbyid(p.proowner) AS owner,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname=ANY($1::text[])
     ORDER BY n.nspname,p.proname,identity_arguments`,
    [[...APP_SCHEMAS]],
  );
  for (const row of result.rows) {
    requireThat(
      row.owner === "postgres" || row.owner === MIGRATION_ROLE,
      "APPLICATION_OBJECT_OWNER_INVALID",
    );
    if (row.owner === MIGRATION_ROLE || row.prosecdef) continue;
    const type =
      row.prokind === "p"
        ? "PROCEDURE"
        : row.prokind === "a"
          ? "AGGREGATE"
          : "FUNCTION";
    await client.query(
      `ALTER ${type} ${qualified(row.schema_name, row.proname)}(${row.identity_arguments}) OWNER TO ${identifier(MIGRATION_ROLE)}`,
    );
  }
}

async function transferStandaloneTypes(client) {
  const result = await client.query(
    `SELECT n.nspname AS schema_name,t.typname,pg_get_userbyid(t.typowner) AS owner
     FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
     LEFT JOIN pg_class c ON c.oid=t.typrelid
     WHERE n.nspname=ANY($1::text[]) AND t.typelem=0
       AND (t.typrelid=0 OR c.relkind='c')
     ORDER BY n.nspname,t.typname`,
    [[...APP_SCHEMAS]],
  );
  for (const row of result.rows) {
    requireThat(
      row.owner === "postgres" || row.owner === MIGRATION_ROLE,
      "APPLICATION_OBJECT_OWNER_INVALID",
    );
    if (row.owner !== MIGRATION_ROLE) {
      await client.query(
        `ALTER TYPE ${qualified(row.schema_name, row.typname)} OWNER TO ${identifier(MIGRATION_ROLE)}`,
      );
    }
  }
}

async function assertNoUnsupportedOwnedObjects(client) {
  const result = await client.query(
    `SELECT object_kind,count(*)::int AS count FROM (
       SELECT 'collation' AS object_kind FROM pg_collation x JOIN pg_namespace n ON n.oid=x.collnamespace WHERE n.nspname=ANY($1::text[])
       UNION ALL SELECT 'conversion' FROM pg_conversion x JOIN pg_namespace n ON n.oid=x.connamespace WHERE n.nspname=ANY($1::text[])
       UNION ALL SELECT 'operator' FROM pg_operator x JOIN pg_namespace n ON n.oid=x.oprnamespace WHERE n.nspname=ANY($1::text[])
       UNION ALL SELECT 'operator_class' FROM pg_opclass x JOIN pg_namespace n ON n.oid=x.opcnamespace WHERE n.nspname=ANY($1::text[])
       UNION ALL SELECT 'operator_family' FROM pg_opfamily x JOIN pg_namespace n ON n.oid=x.opfnamespace WHERE n.nspname=ANY($1::text[])
       UNION ALL SELECT 'text_search_dictionary' FROM pg_ts_dict x JOIN pg_namespace n ON n.oid=x.dictnamespace WHERE n.nspname=ANY($1::text[])
       UNION ALL SELECT 'text_search_configuration' FROM pg_ts_config x JOIN pg_namespace n ON n.oid=x.cfgnamespace WHERE n.nspname=ANY($1::text[])
       UNION ALL SELECT 'statistics' FROM pg_statistic_ext x JOIN pg_namespace n ON n.oid=x.stxnamespace WHERE n.nspname=ANY($1::text[])
     ) unsupported GROUP BY object_kind ORDER BY object_kind`,
    [[...APP_SCHEMAS]],
  );
  requireThat(result.rows.length === 0, "UNSUPPORTED_APPLICATION_OBJECT");
}

async function ensureRole(client, verifier) {
  const existing = await client.query(
    `SELECT rolsuper,rolbypassrls,rolcreatedb,rolreplication
     FROM pg_roles WHERE rolname=$1`,
    [MIGRATION_ROLE],
  );
  requireThat(
    existing.rows.length === 0 ||
      (existing.rows[0].rolsuper === false &&
        existing.rows[0].rolbypassrls === false &&
        existing.rows[0].rolcreatedb === false &&
        existing.rows[0].rolreplication === false),
    "EXISTING_TARGET_ROLE_PRIVILEGED",
  );
  if (existing.rows.length === 0) {
    await client.query(
      `CREATE ROLE ${identifier(MIGRATION_ROLE)} LOGIN CREATEROLE NOCREATEDB NOSUPERUSER NOBYPASSRLS NOREPLICATION NOINHERIT`,
    );
  }
  await client.query(
    "SELECT set_config('fieldgrid.bootstrap.verifier',$1,true)",
    [verifier],
  );
  await client.query(`
    DO $bootstrap$
    BEGIN
      EXECUTE format(
        'ALTER ROLE %I LOGIN CREATEROLE NOCREATEDB NOINHERIT PASSWORD %L',
        '${MIGRATION_ROLE}',current_setting('fieldgrid.bootstrap.verifier')
      );
    END
    $bootstrap$
  `);
}

async function verifyCatalogState(client, managedExpectation) {
  const managedDigest =
    typeof managedExpectation === "string"
      ? managedExpectation
      : managedExpectation.digest;
  const role = await client.query(
    `SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,
       rolreplication,rolinherit,rolcanlogin
     FROM pg_roles WHERE rolname=$1`,
    [MIGRATION_ROLE],
  );
  const row = role.rows[0];
  requireThat(
    role.rows.length === 1 &&
      row.rolsuper === false &&
      row.rolbypassrls === false &&
      row.rolcreaterole === true &&
      row.rolcreatedb === false &&
      row.rolreplication === false &&
      row.rolinherit === false &&
      row.rolcanlogin === true,
    "TARGET_ROLE_ATTRIBUTES_INVALID",
  );
  const owners = await client.query(
    `SELECT 'schema' AS kind,n.nspname AS schema_name,NULL::name AS object_name,
       pg_get_userbyid(n.nspowner) AS owner,false AS security_definer
     FROM pg_namespace n WHERE n.nspname=ANY($1::text[])
     UNION ALL
     SELECT 'relation',n.nspname,c.relname,pg_get_userbyid(c.relowner),false
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname=ANY($1::text[]) AND c.relkind IN ('r','p','S','v','m','f')
     UNION ALL
     SELECT 'routine',n.nspname,p.proname,pg_get_userbyid(p.proowner),p.prosecdef
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname=ANY($1::text[])
     ORDER BY 1,2,3`,
    [[...APP_SCHEMAS]],
  );
  requireThat(
    owners.rows.every(
      (item) =>
        item.owner === MIGRATION_ROLE ||
        (item.kind === "routine" &&
          item.security_definer === true &&
          item.owner === "postgres"),
    ),
    "APPLICATION_OWNERSHIP_INVALID",
  );
  const typeOwners = await client.query(
    `SELECT n.nspname,t.typname,pg_get_userbyid(t.typowner) AS owner
     FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
     LEFT JOIN pg_class c ON c.oid=t.typrelid
     WHERE n.nspname=ANY($1::text[]) AND t.typelem=0
       AND (t.typrelid=0 OR c.relkind='c')
     ORDER BY n.nspname,t.typname`,
    [[...APP_SCHEMAS]],
  );
  requireThat(
    typeOwners.rows.every(({ owner }) => owner === MIGRATION_ROLE),
    "APPLICATION_TYPE_OWNERSHIP_INVALID",
  );
  const membership = await runtimeMembership(client);
  const targetMembership = membership.filter(
    ({ role_name: roleName, member_name: memberName }) =>
      roleName === MIGRATION_ROLE || memberName === MIGRATION_ROLE,
  );
  requireThat(
    targetMembership.every(
      ({
        role_name: roleName,
        member_name: memberName,
        grantor_name: grantorName,
        admin_option: admin,
        inherit_option: inherit,
        set_option: set,
      }) =>
        (memberName === MIGRATION_ROLE && RUNTIME_ROLES.includes(roleName)) ||
        (roleName === MIGRATION_ROLE &&
          memberName === "postgres" &&
          grantorName === "supabase_admin" &&
          admin === true &&
          inherit === false &&
          set === false),
    ),
    "TARGET_ROLE_MEMBERSHIP_INVALID",
  );
  for (const runtimeRole of RUNTIME_ROLES) {
    const edges = membership.filter(
      ({ role_name: roleName, member_name: memberName }) =>
        roleName === runtimeRole && memberName === MIGRATION_ROLE,
    );
    requireThat(
      edges.length >= 1 &&
        edges.some(({ admin_option: admin }) => admin === true) &&
        edges.every(
          ({ inherit_option: inherit, set_option: set }) =>
            inherit === false && set === false,
        ),
      "RUNTIME_ADMIN_TOPOLOGY_INVALID",
    );
  }
  const capabilityEdges = membership.filter(
    ({ role_name: roleName, member_name: memberName }) =>
      roleName === "fieldgrid_runtime_data" &&
      memberName === "fieldgrid_runtime_app",
  );
  requireThat(
    capabilityEdges.length >= 1 &&
      capabilityEdges.every(
        ({ admin_option: admin, inherit_option: inherit, set_option: set }) =>
          admin === false && inherit === true && set === false,
      ),
    "RUNTIME_CAPABILITY_TOPOLOGY_INVALID",
  );
  requireThat(
    !membership.some(
      ({ member_name: member, role_name: granted }) =>
        member === MIGRATION_ROLE &&
        (granted === "postgres" || granted === "supabase_admin"),
    ),
    "PRIVILEGED_ROLE_MEMBERSHIP_INVALID",
  );
  const publication = await client.query(
    `SELECT pg_get_userbyid(pubowner) AS owner FROM pg_publication
     WHERE pubname='supabase_realtime'`,
  );
  requireThat(
    publication.rows.length === 1 &&
      publication.rows[0].owner === MIGRATION_ROLE,
    "REALTIME_PUBLICATION_OWNER_INVALID",
  );
  const managed = await managedCatalogSnapshot(client);
  if (managed.digest !== managedDigest) {
    const error = new Error("MANAGED_CATALOG_CHANGED");
    error.code = "MANAGED_CATALOG_CHANGED";
    if (typeof managedExpectation !== "string") {
      error.changedCatalogSections = Object.keys(managedExpectation).filter(
        (key) =>
          key !== "digest" &&
          digest(managedExpectation[key]) !== digest(managed[key]),
      );
    }
    throw error;
  }
  return { ownership: owners.rows, runtimeMembership: membership };
}

export async function applyBootstrap(client, password, { injectFailure } = {}) {
  const legacy = await assertLegacyPrincipal(client);
  const before = await managedCatalogSnapshot(client);
  const schemas = await client.query(
    "SELECT nspname FROM pg_namespace WHERE nspname=ANY($1::text[])",
    [[...APP_SCHEMAS]],
  );
  requireThat(
    schemas.rows.length === APP_SCHEMAS.length,
    "APPLICATION_SCHEMA_MISSING",
  );
  const verifier = buildScramVerifier(password);
  let commitAttempted = false;
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query("SET LOCAL statement_timeout='120s'");
    const lock = await client.query(
      "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired",
      ["fieldgrid:staging-migration-admin-bootstrap:v1"],
    );
    requireThat(lock.rows[0]?.acquired === true, "BOOTSTRAP_LOCK_UNAVAILABLE");
    await verifyRuntimeRolesSafe(client);
    await assertNoUnsupportedOwnedObjects(client);
    await ensureRole(client, verifier);
    await client.query(
      `GRANT ${identifier(MIGRATION_ROLE)} TO postgres WITH INHERIT TRUE, SET TRUE`,
    );
    await client.query(
      `GRANT CONNECT,CREATE ON DATABASE postgres TO ${identifier(MIGRATION_ROLE)}`,
    );
    await client.query(
      `GRANT USAGE ON SCHEMA auth TO ${identifier(MIGRATION_ROLE)}`,
    );
    await client.query(
      `GRANT SELECT (id,email,raw_app_meta_data) ON TABLE auth.users TO ${identifier(MIGRATION_ROLE)}`,
    );
    for (const schema of APP_SCHEMAS) {
      await client.query(
        `GRANT USAGE,CREATE ON SCHEMA ${identifier(schema)} TO ${identifier(MIGRATION_ROLE)}`,
      );
    }
    await transferRelations(client);
    await transferRoutines(client);
    await transferStandaloneTypes(client);
    if (injectFailure === "after-objects") throw new Error("INJECTED_FAILURE");
    for (const schema of APP_SCHEMAS) {
      const present = await client.query(
        "SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname=$1",
        [schema],
      );
      if (present.rows.length === 0) continue;
      requireThat(
        present.rows[0].owner === "postgres" ||
          present.rows[0].owner === "pg_database_owner" ||
          present.rows[0].owner === MIGRATION_ROLE,
        "APPLICATION_SCHEMA_OWNER_INVALID",
      );
      if (present.rows[0].owner !== MIGRATION_ROLE) {
        await client.query(
          `ALTER SCHEMA ${identifier(schema)} OWNER TO ${identifier(MIGRATION_ROLE)}`,
        );
      }
      await client.query(
        `REVOKE ALL ON SCHEMA ${identifier(schema)} FROM ${identifier(MIGRATION_ROLE)}`,
      );
    }
    const publication = await client.query(
      `SELECT pg_get_userbyid(pubowner) AS owner FROM pg_publication
       WHERE pubname='supabase_realtime'`,
    );
    requireThat(
      publication.rows.length === 1 &&
        ["postgres", MIGRATION_ROLE].includes(publication.rows[0].owner),
      "REALTIME_PUBLICATION_OWNER_INVALID",
    );
    if (publication.rows[0].owner !== MIGRATION_ROLE) {
      await client.query(
        `ALTER PUBLICATION supabase_realtime OWNER TO ${identifier(MIGRATION_ROLE)}`,
      );
    }
    await client.query(
      `GRANT fieldgrid_runtime_app TO ${identifier(MIGRATION_ROLE)} WITH INHERIT FALSE, SET FALSE, ADMIN TRUE`,
    );
    await client.query(
      `GRANT fieldgrid_runtime_data TO ${identifier(MIGRATION_ROLE)} WITH INHERIT FALSE, SET FALSE, ADMIN TRUE`,
    );
    await client.query(
      "GRANT fieldgrid_runtime_data TO fieldgrid_runtime_app WITH INHERIT TRUE, SET FALSE, ADMIN FALSE",
    );
    await client.query(
      `REVOKE ${identifier(MIGRATION_ROLE)} FROM postgres GRANTED BY postgres`,
    );
    const proof = await verifyCatalogState(client, before);
    if (injectFailure === "before-commit") throw new Error("INJECTED_FAILURE");
    commitAttempted = true;
    await client.query("COMMIT");
    return {
      legacyPrincipal: legacy.name,
      managedCatalogDigest: before.digest,
      securityDefinerCompatibilityOwner: "postgres",
      applicationObjectCount: proof.ownership.length,
      runtimeMembershipDigest: digest(proof.runtimeMembership),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (commitAttempted && error && typeof error === "object") {
      error.bootstrapCommitAttempted = true;
    }
    throw error;
  }
}

export async function drainApplicationWriters(client) {
  const unknown = await client.query(
    `SELECT role.rolname
     FROM pg_roles role
     WHERE role.rolcanlogin AND role.rolname<>ALL($2::text[])
       AND (
         EXISTS (
           SELECT 1 FROM pg_class relation
           JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
           WHERE namespace.nspname=ANY($1::text[])
             AND relation.relkind IN ('r','p')
             AND (
               has_table_privilege(role.rolname,relation.oid,'INSERT')
               OR has_table_privilege(role.rolname,relation.oid,'UPDATE')
               OR has_table_privilege(role.rolname,relation.oid,'DELETE')
               OR has_table_privilege(role.rolname,relation.oid,'TRUNCATE')
             )
         )
         OR EXISTS (
           SELECT 1 FROM pg_proc routine
           JOIN pg_namespace namespace ON namespace.oid=routine.pronamespace
           WHERE namespace.nspname=ANY($1::text[])
             AND has_function_privilege(role.rolname,routine.oid,'EXECUTE')
         )
       )
     ORDER BY role.rolname`,
    [
      [...APP_SCHEMAS],
      [
        "anon",
        "authenticated",
        "authenticator",
        "dashboard_user",
        "fieldgrid_migration_admin",
        "fieldgrid_runtime_app",
        "postgres",
        "pgbouncer",
        "service_role",
        "supabase_admin",
        "supabase_auth_admin",
        "supabase_etl_admin",
        "supabase_functions_admin",
        "supabase_read_only_user",
        "supabase_replication_admin",
        "supabase_storage_admin",
      ],
    ],
  );
  requireThat(unknown.rows.length === 0, "UNKNOWN_DATABASE_WRITER");
  const result = await client.query(`
    SELECT pid,pg_terminate_backend(pid) AS stopped
    FROM pg_stat_activity
    WHERE datname=current_database() AND pid<>pg_backend_pid()
      AND backend_type='client backend'
      AND usename=ANY(ARRAY[
        'postgres','fieldgrid_migration_admin','fieldgrid_runtime_app',
        'authenticator','anon','authenticated','service_role'
      ]::text[])
    ORDER BY pid
  `);
  requireThat(
    result.rows.every(({ stopped }) => stopped === true),
    "DATABASE_WRITER_TERMINATION_FAILED",
  );
  return { terminatedSessionCount: result.rows.length };
}

export async function verifyTargetLogin(client, managedDigest) {
  const identity = await client.query(`
    SELECT current_user::text AS current_user,session_user::text AS session_user,
      current_database() AS database_name,rolsuper,rolbypassrls,rolcreaterole,
      rolcreatedb,rolreplication,rolinherit,rolcanlogin
    FROM pg_roles WHERE rolname=current_user
  `);
  const row = identity.rows[0];
  requireThat(
    identity.rows.length === 1 &&
      row.current_user === MIGRATION_ROLE &&
      row.session_user === MIGRATION_ROLE &&
      row.database_name === "postgres" &&
      row.rolsuper === false &&
      row.rolbypassrls === false &&
      row.rolcreaterole === true &&
      row.rolcreatedb === false &&
      row.rolreplication === false &&
      row.rolinherit === false &&
      row.rolcanlogin === true,
    "TARGET_LOGIN_INVALID",
  );
  await verifyCatalogState(client, managedDigest);
  const capabilities = await client.query(`
    SELECT has_database_privilege(current_user,current_database(),'CONNECT') AS connect,
      has_database_privilege(current_user,current_database(),'CREATE') AS create,
      has_database_privilege(current_user,current_database(),'TEMPORARY') AS temporary,
      has_schema_privilege(current_user,'auth','USAGE') AS auth_usage,
      NOT has_table_privilege(current_user,'auth.users','SELECT') AS auth_no_table_select,
      has_column_privilege(current_user,'auth.users','id','SELECT') AS auth_id,
      has_column_privilege(current_user,'auth.users','email','SELECT') AS auth_email,
      has_column_privilege(current_user,'auth.users','raw_app_meta_data','SELECT') AS auth_metadata
  `);
  requireThat(
    Object.values(capabilities.rows[0] ?? {}).every((value) => value === true),
    "TARGET_CAPABILITY_INVALID",
  );
  const selectedAuthColumns = await client.query(`
    SELECT COALESCE(jsonb_agg(a.attname ORDER BY a.attname),'[]'::jsonb) AS columns
    FROM pg_attribute a
    WHERE a.attrelid='auth.users'::regclass AND a.attnum>0 AND NOT a.attisdropped
      AND has_column_privilege(current_user,a.attrelid,a.attnum,'SELECT')
  `);
  requireThat(
    JSON.stringify(selectedAuthColumns.rows[0]?.columns) ===
      JSON.stringify(["email", "id", "raw_app_meta_data"]),
    "TARGET_AUTH_COLUMN_SCOPE_INVALID",
  );
  const inventory = await databaseInventory(client, {
    expectedDatabaseName: "postgres",
    expectedPrincipalName: MIGRATION_ROLE,
  });
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query("SET LOCAL statement_timeout='120s'");
    await client.query("DROP SCHEMA IF EXISTS app_private CASCADE");
    await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query(
      `CREATE SCHEMA public AUTHORIZATION ${identifier(MIGRATION_ROLE)}`,
    );
    await client.query(
      "CREATE TEMP TABLE fieldgrid_bootstrap_capability_proof(id int)",
    );
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
  return {
    principal: inventory.principal,
    applicationSchemas: inventory.applicationSchemas,
    applicationTables: inventory.applicationTables,
    managedCatalogDigest: inventory.managedCatalogDigest,
    dryRebuildCapability: true,
    authorizedProviderCompatibility: {
      realtimePublicationOwner: MIGRATION_ROLE,
      authSchemaUsage: true,
      authUsersSelectColumns: ["email", "id", "raw_app_meta_data"],
    },
  };
}
