import { digest } from "../disposable-staging/contract.mjs";

export const BRIDGE_SCHEMA = "fieldgrid_migration_bridge";
export const BRIDGE_FUNCTIONS = Object.freeze([
  "abort_disposable_rebuild",
  "finalize_disposable_rebuild",
  "foldername",
  "jwt",
  "prepare_disposable_rebuild",
  "reconcile_storage",
  "role",
  "storage_state",
  "uid",
]);
export const BRIDGE_ADAPTERS = Object.freeze([
  "foldername",
  "jwt",
  "role",
  "uid",
]);
export const STORAGE_POLICIES = Object.freeze([
  "assignment_checklist_evidence_insert",
  "assignment_checklist_evidence_read",
  "assignment_photos_assigned_personnel",
  "assignment_photos_assigned_personnel_delete",
  "assignment_photos_assigned_personnel_insert",
  "assignment_photos_assigned_personnel_update",
  "assignment_photos_management_all",
  "documents_management_all",
  "knowledgebase_media_management_delete",
  "knowledgebase_media_management_update",
  "knowledgebase_media_management_write",
  "news_hero_delete_management",
  "news_hero_insert_management",
  "news_hero_public_read",
  "news_hero_update_management",
  "org_assets_management_write",
  "org_assets_public_read",
  "personnel_avatars_public_read",
  "release_media_management_delete",
  "release_media_management_update",
  "release_media_management_write",
]);
export const SUPERSEDED_STORAGE_POLICIES = Object.freeze([
  "authenticated_upload",
  "knowledgebase_media_public_read",
  "owner_delete",
  "owner_select",
]);

const MIGRATION_ROLE = "fieldgrid_migration_admin";
const RUNTIME_ROLES = Object.freeze([
  "anon",
  "authenticated",
  "fieldgrid_runtime_app",
  "fieldgrid_runtime_data",
  "service_role",
]);
const PERSISTENT_PROVIDER_ADAPTER_ROLES = Object.freeze([
  "anon",
  "authenticated",
  "service_role",
]);
const STORAGE_OWNER = "supabase_storage_admin";
const EXPECTED_BRIDGE_DEFINITION_DIGEST =
  "40ffaffe8aba873229e1d4fe950503546602c6cb57ca564059eeab35bcd5ad16";
const EXPECTED_STORAGE_POLICY_DIGEST =
  "11c73d50bf91d753bb11ea462c99014ba12b689ff12a7beb34e5aaa3b8907809";
const EXPECTED_BUCKET_DIGEST =
  "c03726ada335416df82576ad206a015a1e6262d0443237041e41cdbaf07e9e7d";
const EXPECTED_AUTH_SNAPSHOT_DEFINITION_DIGEST =
  "12afff3e82c6f81f70f228dd3dcc85d068e755ffb1dd0b8b354a4350ad8dc61b";
const EXPECTED_AUTH_SNAPSHOT_ACL_DIGEST =
  "e32a108d61655f954f12cd6166dadfbc73afe66f1711ba67d708dd3064a7e3f5";

function exactRows(actual, expected) {
  return digest(actual) === digest(expected);
}

function directAcl(functionName, grantee, grantor) {
  return {
    function_name: functionName,
    grantee,
    grantor,
    privilege_type: "EXECUTE",
    is_grantable: false,
  };
}

function expectedFunctionAcl(adapterGrantees) {
  const rows = [];
  for (const functionName of BRIDGE_FUNCTIONS) {
    const storageOwned = ["reconcile_storage", "storage_state"].includes(
      functionName,
    );
    const owner = storageOwned ? STORAGE_OWNER : "postgres";
    rows.push(directAcl(functionName, owner, owner));
    if (functionName !== "reconcile_storage") {
      rows.push(directAcl(functionName, MIGRATION_ROLE, owner));
    } else {
      rows.push(directAcl(functionName, "postgres", owner));
    }
    if (BRIDGE_ADAPTERS.includes(functionName)) {
      for (const role of adapterGrantees) {
        rows.push(directAcl(functionName, role, "postgres"));
      }
    }
  }
  return rows.sort((left, right) =>
    `${left.function_name}/${left.grantee}`.localeCompare(
      `${right.function_name}/${right.grantee}`,
    ),
  );
}

function expectedSchemaAcl(adapterGrantees) {
  return [
    ...adapterGrantees.map((grantee) => ({
      grantee,
      grantor: "postgres",
      privilege_type: "USAGE",
      is_grantable: false,
    })),
    {
      grantee: MIGRATION_ROLE,
      grantor: "postgres",
      privilege_type: "USAGE",
      is_grantable: false,
    },
    {
      grantee: STORAGE_OWNER,
      grantor: "postgres",
      privilege_type: "USAGE",
      is_grantable: false,
    },
    {
      grantee: "postgres",
      grantor: "postgres",
      privilege_type: "CREATE",
      is_grantable: false,
    },
    {
      grantee: "postgres",
      grantor: "postgres",
      privilege_type: "USAGE",
      is_grantable: false,
    },
  ].sort((left, right) =>
    `${left.grantee}/${left.privilege_type}`.localeCompare(
      `${right.grantee}/${right.privilege_type}`,
    ),
  );
}

function invalid(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function requireProof(condition, code) {
  if (condition !== true) invalid(code);
}

async function verifyBridgeCatalog(
  client,
  { allowRuntimeAdaptersAbsent = false } = {},
) {
  const schema = await client.query(
    `SELECT pg_get_userbyid(nspowner) AS owner
     FROM pg_namespace WHERE nspname=$1`,
    [BRIDGE_SCHEMA],
  );
  requireProof(
    schema.rows.length === 1 && schema.rows[0]?.owner === "postgres",
    "HOSTED_MIGRATION_BRIDGE_SCHEMA_INVALID",
  );

  const definitions = await client.query(
    `SELECT routine.proname,
       pg_get_function_identity_arguments(routine.oid) AS identity_arguments,
       pg_get_function_result(routine.oid) AS result_type,
       pg_get_userbyid(routine.proowner) AS owner,
       language_row.lanname AS language,routine.prokind,routine.provolatile,
       routine.proparallel,routine.proisstrict,routine.proleakproof,
       routine.prosecdef,routine.proretset,routine.pronargdefaults,
       pg_get_expr(routine.proargdefaults,0) AS argument_defaults,
       routine.proargnames,routine.proargmodes,
       routine.proargtypes::regtype[]::text AS input_argument_types,
       routine.proallargtypes::regtype[]::text AS all_argument_types,
       routine.procost,routine.prorows,routine.proconfig,routine.prosrc,
       CASE WHEN routine.prosupport=0 THEN NULL
            ELSE routine.prosupport::regproc::text END AS support_function,
       routine.prosqlbody IS NULL AS sql_body_is_null
     FROM pg_proc routine
     JOIN pg_namespace namespace_row
       ON namespace_row.oid=routine.pronamespace
     JOIN pg_language language_row ON language_row.oid=routine.prolang
     WHERE namespace_row.nspname=$1
     ORDER BY routine.proname,identity_arguments`,
    [BRIDGE_SCHEMA],
  );
  requireProof(
    definitions.rows.length === BRIDGE_FUNCTIONS.length &&
      definitions.rows.every(
        ({ proname }, index) => proname === BRIDGE_FUNCTIONS[index],
      ) &&
      digest(definitions.rows) === EXPECTED_BRIDGE_DEFINITION_DIGEST,
    "HOSTED_MIGRATION_BRIDGE_DEFINITION_INVALID",
  );

  const schemaAcl = await client.query(
    `SELECT CASE WHEN acl.grantee=0 THEN 'PUBLIC'
            ELSE pg_get_userbyid(acl.grantee) END AS grantee,
       pg_get_userbyid(acl.grantor) AS grantor,
       acl.privilege_type,acl.is_grantable
     FROM pg_namespace namespace_row
     CROSS JOIN LATERAL pg_catalog.aclexplode(
       COALESCE(namespace_row.nspacl,
         pg_catalog.acldefault('n',namespace_row.nspowner))
     ) acl
     WHERE namespace_row.nspname=$1
     ORDER BY grantee,privilege_type`,
    [BRIDGE_SCHEMA],
  );
  const adapterGrantees = schemaAcl.rows
    .filter(
      ({ grantee, privilege_type: privilegeType }) =>
        RUNTIME_ROLES.includes(grantee) && privilegeType === "USAGE",
    )
    .map(({ grantee }) => grantee);
  const runtimeAdaptersInstalled = exactRows(adapterGrantees, RUNTIME_ROLES);
  const permittedIncompleteAdapterState =
    exactRows(adapterGrantees, []) ||
    exactRows(adapterGrantees, PERSISTENT_PROVIDER_ADAPTER_ROLES);
  requireProof(
    (runtimeAdaptersInstalled ||
      (allowRuntimeAdaptersAbsent && permittedIncompleteAdapterState)) &&
      exactRows(schemaAcl.rows, expectedSchemaAcl(adapterGrantees)),
    "HOSTED_MIGRATION_BRIDGE_SCHEMA_ACL_INVALID",
  );

  const functionAcl = await client.query(
    `SELECT routine.proname AS function_name,
       CASE WHEN acl.grantee=0 THEN 'PUBLIC'
            ELSE pg_get_userbyid(acl.grantee) END AS grantee,
       pg_get_userbyid(acl.grantor) AS grantor,
       acl.privilege_type,acl.is_grantable
     FROM pg_proc routine
     JOIN pg_namespace namespace_row
       ON namespace_row.oid=routine.pronamespace
     CROSS JOIN LATERAL pg_catalog.aclexplode(
       COALESCE(routine.proacl,
         pg_catalog.acldefault('f',routine.proowner))
     ) acl
     WHERE namespace_row.nspname=$1
     ORDER BY routine.proname,grantee,privilege_type`,
    [BRIDGE_SCHEMA],
  );
  requireProof(
    exactRows(functionAcl.rows, expectedFunctionAcl(adapterGrantees)),
    "HOSTED_MIGRATION_BRIDGE_FUNCTION_ACL_INVALID",
  );

  const effective = await client.query(
    `WITH requested_roles(role_name) AS (VALUES
       ('fieldgrid_migration_admin'),('anon'),('authenticated'),
       ('service_role'),('fieldgrid_runtime_app'),('fieldgrid_runtime_data'),
       ('supabase_storage_admin'),('postgres')
     ), expected_roles AS (
       SELECT requested_roles.role_name
       FROM requested_roles
       JOIN pg_roles role_row ON role_row.rolname=requested_roles.role_name
     )
     SELECT expected_roles.role_name,routine.proname AS function_name,
       has_schema_privilege(expected_roles.role_name,$1,'USAGE') AS schema_usage,
       has_schema_privilege(expected_roles.role_name,$1,'CREATE') AS schema_create,
       has_function_privilege(expected_roles.role_name,routine.oid,'EXECUTE') AS execute
     FROM expected_roles
     CROSS JOIN pg_proc routine
     JOIN pg_namespace namespace_row
       ON namespace_row.oid=routine.pronamespace
     WHERE namespace_row.nspname=$1
     ORDER BY expected_roles.role_name,routine.proname`,
    [BRIDGE_SCHEMA],
  );
  const effectiveRoles = new Set(
    effective.rows.map(({ role_name: roleName }) => roleName),
  );
  const fieldgridRuntimeRoleCount = [
    "fieldgrid_runtime_app",
    "fieldgrid_runtime_data",
  ].filter((role) => effectiveRoles.has(role)).length;
  requireProof(
    [0, 2].includes(fieldgridRuntimeRoleCount) &&
      effectiveRoles.size === 6 + fieldgridRuntimeRoleCount &&
      effective.rows.length === effectiveRoles.size * BRIDGE_FUNCTIONS.length &&
      (!runtimeAdaptersInstalled || fieldgridRuntimeRoleCount === 2) &&
      effective.rows.every((row) => {
        const adapter = adapterGrantees.includes(row.role_name);
        const expectedUsage =
          adapter ||
          [MIGRATION_ROLE, STORAGE_OWNER, "postgres"].includes(row.role_name);
        const expectedCreate = row.role_name === "postgres";
        let expectedExecute = false;
        if (row.role_name === MIGRATION_ROLE) {
          expectedExecute = row.function_name !== "reconcile_storage";
        } else if (adapter) {
          expectedExecute =
            BRIDGE_ADAPTERS.includes(row.function_name);
        } else if (row.role_name === STORAGE_OWNER) {
          expectedExecute = ["reconcile_storage", "storage_state"].includes(
            row.function_name,
          );
        } else if (row.role_name === "postgres") {
          expectedExecute = row.function_name !== "storage_state";
        }
        return (
          row.schema_usage === expectedUsage &&
          row.schema_create === expectedCreate &&
          row.execute === expectedExecute
        );
      }),
    "HOSTED_MIGRATION_BRIDGE_EFFECTIVE_ACL_INVALID",
  );
  const cleanup = await client.query(
    `SELECT
       has_schema_privilege($1,'auth','USAGE') AS auth_usage,
       has_schema_privilege($1,'storage','USAGE') AS storage_usage,
       (SELECT count(*)::int
          FROM pg_auth_members membership
          JOIN pg_roles role_row ON role_row.oid=membership.roleid
          JOIN pg_roles member_row ON member_row.oid=membership.member
          JOIN pg_roles grantor_row ON grantor_row.oid=membership.grantor
         WHERE role_row.rolname=$1 AND member_row.rolname='postgres'
           AND grantor_row.rolname='postgres') AS temporary_membership_count`,
    [MIGRATION_ROLE],
  );
  requireProof(
    cleanup.rows.length === 1 &&
      cleanup.rows[0]?.auth_usage === false &&
      cleanup.rows[0]?.storage_usage === false &&
      cleanup.rows[0]?.temporary_membership_count === 0,
    "HOSTED_MIGRATION_BRIDGE_TEMPORARY_PRIVILEGE_INVALID",
  );
  return {
    functionCount: definitions.rows.length,
    definitionDigest: digest(definitions.rows),
    runtimeAdaptersInstalled,
  };
}

async function verifyStorageFinalState(client) {
  const topology = await client.query(`
    SELECT
      (SELECT pg_get_userbyid(nspowner) FROM pg_namespace
        WHERE nspname='storage') AS schema_owner,
      (SELECT pg_get_userbyid(relation.relowner)
         FROM pg_class relation JOIN pg_namespace namespace_row
           ON namespace_row.oid=relation.relnamespace
        WHERE namespace_row.nspname='storage' AND relation.relname='buckets'
          AND relation.relkind IN ('r','p')) AS buckets_owner,
      (SELECT pg_get_userbyid(relation.relowner)
         FROM pg_class relation JOIN pg_namespace namespace_row
           ON namespace_row.oid=relation.relnamespace
        WHERE namespace_row.nspname='storage' AND relation.relname='objects'
          AND relation.relkind IN ('r','p')) AS objects_owner,
      (SELECT relation.relrowsecurity
         FROM pg_class relation JOIN pg_namespace namespace_row
           ON namespace_row.oid=relation.relnamespace
        WHERE namespace_row.nspname='storage' AND relation.relname='objects'
          AND relation.relkind IN ('r','p')) AS objects_rls,
      true AS catalog_complete
  `);
  const state = topology.rows[0];
  requireProof(
    topology.rows.length === 1 &&
      state?.schema_owner === STORAGE_OWNER &&
      state?.buckets_owner === STORAGE_OWNER &&
      state?.objects_owner === STORAGE_OWNER &&
      state?.objects_rls === true &&
      state?.catalog_complete === true,
    "HOSTED_PROVIDER_STORAGE_TOPOLOGY_INVALID",
  );

  const policies = await client.query(
    `SELECT policyname,permissive,roles,cmd,qual,with_check
     FROM pg_policies
     WHERE schemaname='storage' AND tablename='objects'
     ORDER BY policyname`,
  );
  const superseded = await client.query(
    `SELECT count(*)::int AS count FROM pg_policies
     WHERE schemaname='storage' AND tablename='objects'
       AND policyname=ANY($1::text[])`,
    [[...SUPERSEDED_STORAGE_POLICIES]],
  );
  requireProof(
    policies.rows.length === STORAGE_POLICIES.length &&
      policies.rows.every(
        ({ policyname }, index) => policyname === STORAGE_POLICIES[index],
      ) &&
      digest(policies.rows) === EXPECTED_STORAGE_POLICY_DIGEST &&
      superseded.rows[0]?.count === 0,
    "HOSTED_STORAGE_POLICY_CONTRACT_INVALID",
  );

  // Only execute the provider-owned read-only proof after its function body,
  // owner, search_path and ACLs have passed the exact catalog contract above.
  const storage = await client.query(
    `SELECT ${BRIDGE_SCHEMA}.storage_state() AS state`,
  );
  const storageState = storage.rows[0]?.state;
  requireProof(
    storage.rows.length === 1 &&
      storageState &&
      Object.keys(storageState).sort().join(",") === "buckets,objectCount" &&
      storageState.objectCount === 0 &&
      Array.isArray(storageState.buckets) &&
      digest(storageState.buckets) === EXPECTED_BUCKET_DIGEST,
    "HOSTED_STORAGE_BUCKET_CONTRACT_INVALID",
  );
  return {
    policyCount: policies.rows.length,
    policyDigest: digest(policies.rows),
    bucketCount: storageState.buckets.length,
    bucketDigest: digest(storageState.buckets),
    objectCount: storageState.objectCount,
  };
}

async function verifyAuthSnapshotFinalState(client) {
  const definitions = await client.query(`
    SELECT routine.proname,
      pg_get_function_identity_arguments(routine.oid) AS identity_arguments,
      pg_get_function_result(routine.oid) AS result_type,
      pg_get_userbyid(routine.proowner) AS owner,
      language_row.lanname AS language,routine.prokind,routine.provolatile,
      routine.proparallel,routine.proisstrict,routine.proleakproof,
      routine.prosecdef,routine.proretset,routine.pronargdefaults,
      pg_get_expr(routine.proargdefaults,0) AS argument_defaults,
      routine.proargnames,routine.proargmodes,
      routine.proargtypes::regtype[]::text AS input_argument_types,
      routine.proallargtypes::regtype[]::text AS all_argument_types,
      routine.procost,routine.prorows,routine.proconfig,routine.prosrc,
      CASE WHEN routine.prosupport=0 THEN NULL
           ELSE routine.prosupport::regproc::text END AS support_function,
      routine.prosqlbody IS NULL AS sql_body_is_null
    FROM pg_proc routine
    JOIN pg_namespace namespace_row
      ON namespace_row.oid=routine.pronamespace
    JOIN pg_language language_row ON language_row.oid=routine.prolang
    WHERE namespace_row.nspname='app_private'
      AND routine.proname='fieldgrid_auth_user_snapshot'
    ORDER BY identity_arguments
  `);
  const acl = await client.query(`
    SELECT CASE WHEN acl.grantee=0 THEN 'PUBLIC'
           ELSE pg_get_userbyid(acl.grantee) END AS grantee,
      pg_get_userbyid(acl.grantor) AS grantor,
      acl.privilege_type,acl.is_grantable
    FROM pg_proc routine
    JOIN pg_namespace namespace_row
      ON namespace_row.oid=routine.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(routine.proacl,
        pg_catalog.acldefault('f',routine.proowner))
    ) acl
    WHERE namespace_row.nspname='app_private'
      AND routine.proname='fieldgrid_auth_user_snapshot'
    ORDER BY grantee,privilege_type
  `);
  const effective = await client.query(`
    WITH requested_roles(role_name,expected_execute) AS (VALUES
      ('fieldgrid_migration_admin',false),('anon',false),
      ('authenticated',false),('service_role',false),
      ('fieldgrid_runtime_app',true),('fieldgrid_runtime_data',true),
      ('postgres',true)
    )
    SELECT requested_roles.role_name,requested_roles.expected_execute,
      has_function_privilege(
        requested_roles.role_name,routine.oid,'EXECUTE'
      ) AS execute
    FROM requested_roles
    CROSS JOIN pg_proc routine
    JOIN pg_namespace namespace_row
      ON namespace_row.oid=routine.pronamespace
    WHERE namespace_row.nspname='app_private'
      AND routine.proname='fieldgrid_auth_user_snapshot'
      AND pg_get_function_identity_arguments(routine.oid)='p_user_id uuid'
    ORDER BY requested_roles.role_name
  `);
  requireProof(
    definitions.rows.length === 1 &&
      digest(definitions.rows) === EXPECTED_AUTH_SNAPSHOT_DEFINITION_DIGEST &&
      digest(acl.rows) === EXPECTED_AUTH_SNAPSHOT_ACL_DIGEST &&
      effective.rows.length === 7 &&
      effective.rows.every((row) => row.execute === row.expected_execute),
    "HOSTED_AUTH_SNAPSHOT_CONTRACT_INVALID",
  );
  return {
    definitionDigest: digest(definitions.rows),
    aclDigest: digest(acl.rows),
  };
}

export async function verifyHostedMigrationBridgeFinalState(
  client,
  { includeStorage = true, allowRuntimeAdaptersAbsent = false } = {},
) {
  const bridge = await verifyBridgeCatalog(client, {
    allowRuntimeAdaptersAbsent,
  });
  const authSnapshot = includeStorage
    ? await verifyAuthSnapshotFinalState(client)
    : null;
  return {
    ...bridge,
    authSnapshot,
    storage: includeStorage ? await verifyStorageFinalState(client) : null,
  };
}
