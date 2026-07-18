#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  FIXTURE,
  assert,
  connect,
  result,
  tableExists,
  writeJsonArtifact,
  writeTextArtifact,
} from "./fieldgrid-runtime-safety-lib.mjs";

async function loadTenantlessClassification() {
  const raw = await readFile(
    join("docs", "testing", "tenantless-write-invariants.json"),
    "utf8",
  );
  return JSON.parse(raw);
}

async function schemaInvariantChecks(client) {
  const requiredTables = [
    "tenants",
    "tenant_users",
    "tenant_domains",
    "tenant_modules",
    "platform_users",
    "support_access_grants",
    "customers",
    "personnel",
    "objects",
    "assignments",
    "assignment_personnel",
  ];
  const missingTables = [];
  for (const table of requiredTables) {
    if (!(await tableExists(client, "public", table))) missingTables.push(table);
  }
  assert(missingTables.length === 0, "Required runtime tables are missing.", { missingTables });

  const requiredTenantScopedTables = [
    "tenant_users",
    "tenant_domains",
    "tenant_modules",
    "support_access_grants",
    "customers",
    "personnel",
    "objects",
    "assignments",
    "customer_users",
  ];
  const tenantBoundByParentTables = ["assignment_personnel"];
  const tenantColumns = await client.query(
    `
      select table_name, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and column_name = 'tenant_id'
        and table_name = any($1::text[])
      order by table_name
    `,
    [requiredTenantScopedTables],
  );
  const seenTenantColumns = new Set(tenantColumns.rows.map((row) => row.table_name));
  const missingTenantColumns = requiredTenantScopedTables.filter((table) => !seenTenantColumns.has(table));
  assert(missingTenantColumns.length === 0, "Required tenant-bound tables are missing tenant_id columns.", {
    missingTenantColumns,
  });
  const nullableRequiredTenantColumns = tenantColumns.rows
    .filter((row) => row.is_nullable === "YES")
    .map((row) => row.table_name);
  assert(nullableRequiredTenantColumns.length === 0, "Required tenant-bound tables have nullable tenant_id columns.", {
    nullableRequiredTenantColumns,
  });

  const policies = await client.query(
    `
      select schemaname, tablename, policyname, roles, cmd
      from pg_policies
      where schemaname in ('public', 'storage')
      order by schemaname, tablename, policyname
    `,
  );
  assert(policies.rows.length > 0, "No RLS policies were installed.");

  return result("schema-invariant-checks", "passed", {
    requiredTables,
    requiredTenantScopedTables,
    tenantBoundByParentTables,
    tenantScopedColumns: tenantColumns.rows.length,
    policies: policies.rows.length,
  });
}

async function tenantDatabaseIntegration(client) {
  const joined = await client.query(
    `
      select
        a.id as assignment_id,
        a.tenant_id as assignment_tenant_id,
        c.tenant_id as customer_tenant_id,
        o.tenant_id as object_tenant_id
      from assignments a
      join customers c on c.id = a.customer_id
      left join objects o on o.id = a.object_id
      where a.id = any($1::uuid[])
      order by a.id
    `,
    [[FIXTURE.assignments.a, FIXTURE.assignments.b]],
  );
  assert(joined.rows.length === 2, "Tenant A/B assignments were not loaded.", { rows: joined.rows });
  const mismatches = joined.rows.filter(
    (row) =>
      row.assignment_tenant_id !== row.customer_tenant_id ||
      (row.object_tenant_id && row.assignment_tenant_id !== row.object_tenant_id),
  );
  assert(mismatches.length === 0, "Assignment parent entities are not tenant-bound.", { mismatches });

  const multiTenantMemberships = await client.query(
    `select tenant_id from tenant_users where user_id = $1 and status = 'active' order by tenant_id`,
    [FIXTURE.users.multiTenant],
  );
  assert(
    multiTenantMemberships.rows.length === 2,
    "Multi-tenant user does not have deterministic Tenant A/B memberships.",
    { memberships: multiTenantMemberships.rows },
  );

  return result("tenant-a-b-database-integration", "passed", {
    checkedAssignments: joined.rows.length,
    multiTenantMemberships: multiTenantMemberships.rows.map((row) => row.tenant_id),
  });
}

async function expectDatabaseInvariantRejection(operation) {
  try {
    await operation();
  } catch (error) {
    assert(error?.code === "23514", "Unexpected database invariant rejection code.", {
      code: error?.code,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      code: error.code,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  throw new Error("Expected database invariant rejection, but the write was accepted.");
}

async function assignmentExploitTests(client) {
  const outcomes = {};

  await client.query("begin");
  try {
    const sameTenant = await client.query(
      `
        insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
        values ($1, $2, 'assigned', $3)
        returning id
      `,
      [FIXTURE.assignments.a, FIXTURE.personnel.a, FIXTURE.users.tenantAPlanner],
    );
    assert(sameTenant.rows.length === 1, "Same-tenant assignment_personnel insert was not accepted.");
    outcomes.sameTenantInsert = "accepted";
    await client.query("rollback");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }

  await client.query("begin");
  try {
    outcomes.crossTenantInsert = await expectDatabaseInvariantRejection(() =>
      client.query(
        `
          insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
          values ($1, $2, 'assigned', $3)
          returning id
        `,
        [FIXTURE.assignments.a, FIXTURE.personnel.b, FIXTURE.users.tenantAPlanner],
      ),
    );
    await client.query("rollback");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }

  await client.query("begin");
  try {
    const inserted = await client.query(
      `
        insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
        values ($1, $2, 'assigned', $3)
        returning id
      `,
      [FIXTURE.assignments.a, FIXTURE.personnel.a, FIXTURE.users.tenantAPlanner],
    );
    outcomes.updateToForeignPersonnel = await expectDatabaseInvariantRejection(() =>
      client.query(
        `update assignment_personnel set personnel_id = $1 where id = $2`,
        [FIXTURE.personnel.b, inserted.rows[0].id],
      ),
    );
    await client.query("rollback");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }

  await client.query("begin");
  try {
    outcomes.upsertCrossTenant = await expectDatabaseInvariantRejection(() =>
      client.query(
      `
        insert into assignment_personnel (assignment_id, personnel_id, status, assigned_by)
        values ($1, $2, 'assigned', $3)
        on conflict (assignment_id, personnel_id)
        do update set status = excluded.status
      `,
      [FIXTURE.assignments.a, FIXTURE.personnel.b, FIXTURE.users.tenantAPlanner],
      ),
    );
    await client.query("rollback");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  }

  return result("assignment-exploit-tests", "passed", {
    attempted: "Tenant A assignment linked to Tenant B personnel",
    expected: "database rejects cross-tenant writes before commit, including update and upsert paths",
    outcomes,
  });
}

async function tenantlessWriteInvariants(client) {
  const classification = await loadTenantlessClassification();
  const tableClassifications = classification.tables ?? {};
  const rows = await client.query(
    `
      select columns_row.table_name, columns_row.is_nullable
      from information_schema.columns columns_row
      join information_schema.tables tables_row
        on tables_row.table_schema = columns_row.table_schema
       and tables_row.table_name = columns_row.table_name
       and tables_row.table_type = 'BASE TABLE'
      where columns_row.table_schema = 'public'
        and columns_row.column_name = 'tenant_id'
      order by columns_row.table_name
    `,
  );
  const unclassifiedNullableTables = rows.rows
    .filter((row) => row.is_nullable === "YES" && !tableClassifications[row.table_name])
    .map((row) => row.table_name);
  assert(
    unclassifiedNullableTables.length === 0,
    "Nullable tenant_id tables must be explicitly classified before tenantless writes are allowed.",
    { unclassifiedNullableTables },
  );

  const violations = [];
  for (const row of rows.rows) {
    const classificationEntry = tableClassifications[row.table_name];
    const tableClass = classificationEntry?.classification ?? "tenant-required";
    if (row.is_nullable === "YES" && tableClass !== "tenant-required") continue;

    const count = await client.query(`select count(*)::int as count from ${row.table_name} where tenant_id is null`);
    if (count.rows[0].count > 0) violations.push({ table: row.table_name, rows: count.rows[0].count });
  }
  assert(violations.length === 0, "Tenantless rows exist in tenant-bound tables.", { violations });
  return result("tenantless-write-invariants", "passed", {
    checkedTables: rows.rows.length,
    classificationVersion: classification.version,
    nullableClassifiedTables: Object.keys(tableClassifications).length,
  });
}

async function passwordResetExploitScaffold(client) {
  const authUser = await client.query(
    `
      select id, email, raw_user_meta_data ->> 'expired_recovery_at' as expired_recovery_at
      from auth.users
      where id = $1
    `,
    [FIXTURE.users.tenantACustomer],
  );
  assert(authUser.rows.length === 1, "Tenant A customer auth fixture is missing.");
  assert(
    new Date(authUser.rows[0].expired_recovery_at).getTime() < Date.now(),
    "Expired recovery fixture is not expired.",
    authUser.rows[0],
  );

  const invite = await client.query(
    `
      select status, invite_sent_at, metadata
      from tenant_owner_invites
      where id = $1
    `,
    [FIXTURE.tenantOwnerInviteExpired],
  );
  assert(invite.rows.length === 1, "Expired invite fixture is missing.");

  return result("password-reset-exploit-tests", "passed", {
    layer: "database integration scaffold",
    limitation:
      "No local Supabase password-reset token table exists; provider reset-code behavior still requires Supabase/runtime evidence.",
  });
}

async function rlsStorageScaffold(client) {
  const storageObjects = await tableExists(client, "storage", "objects");
  const storagePolicies = storageObjects
    ? await client.query(`select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname`)
    : { rows: [] };

  const rlsProbe = await client.query(
    `
      select relname, relrowsecurity
      from pg_class
      join pg_namespace on pg_namespace.oid = pg_class.relnamespace
      where nspname = 'public'
        and relkind = 'r'
        and relname in ('tenants', 'tenant_users', 'customers', 'personnel', 'assignments')
      order by relname
    `,
  );
  const withoutRls = rlsProbe.rows.filter((row) => !row.relrowsecurity).map((row) => row.relname);
  assert(withoutRls.length === 0, "Expected public tables do not have RLS enabled.", { withoutRls });

  return result("rls-storage-test-scaffolding", "passed", {
    rlsTablesChecked: rlsProbe.rows.length,
    storageObjects,
    storagePolicies: storagePolicies.rows.length,
    limitation: "Storage table policies are PostgreSQL policy checks, not object-storage runtime checks.",
  });
}

async function writeSchemaArtifacts(client) {
  const tables = await client.query(
    `
      select table_schema, table_name, column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema in ('public', 'auth', 'storage')
      order by table_schema, table_name, ordinal_position
    `,
  );
  const policies = await client.query(
    `
      select schemaname, tablename, policyname, roles, cmd, qual, with_check
      from pg_policies
      where schemaname in ('public', 'storage')
      order by schemaname, tablename, policyname
    `,
  );
  await writeJsonArtifact(join("schema", "database-schema.json"), {
    generatedAt: new Date().toISOString(),
    columns: tables.rows,
    policies: policies.rows,
  });
  return result("test-result-and-schema-artifacts", "passed", {
    schemaArtifact: "artifacts/runtime-safety-harness/schema/database-schema.json",
  });
}

async function runChecks() {
  const client = await connect();
  const checks = [];
  try {
    checks.push(await schemaInvariantChecks(client));
    checks.push(await tenantDatabaseIntegration(client));
    checks.push(await assignmentExploitTests(client));
    checks.push(await passwordResetExploitScaffold(client));
    checks.push(await tenantlessWriteInvariants(client));
    checks.push(await rlsStorageScaffold(client));
    checks.push(await writeSchemaArtifacts(client));
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
    checks.push(result("runtime-safety-db-failure", "failed", {
      message: error instanceof Error ? error.message : String(error),
      details: error?.details ?? {},
    }));
    await writeTextArtifact(
      join("logs", "db-harness-error.log"),
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
  }

  await writeJsonArtifact(join("reports", "db-harness.json"), {
    name: "fieldgrid-runtime-safety-db-harness",
    status,
    startedAt,
    completedAt: new Date().toISOString(),
    checks,
    testLayerClassification: {
      "schema-invariant-checks": "database integration",
      "tenant-a-b-database-integration": "database integration",
      "assignment-exploit-tests": "service-role/database invariant",
      "password-reset-exploit-tests": "provider mock",
      "tenantless-write-invariants": "database integration",
      "rls-storage-test-scaffolding": "provider mock",
      "test-result-and-schema-artifacts": "artifact generation",
    },
  });

  if (status !== "passed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
