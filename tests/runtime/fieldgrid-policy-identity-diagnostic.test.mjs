import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

// The operational .mts dependency uses TypeScript parameter properties, which
// Node's strip-only loader cannot erase. Scope the existing tsx loader to this
// import without changing the migration test runner or its global flags.
const { tsImport } = createRequire(new URL("../../lib/db/package.json", import.meta.url))("tsx/esm/api");
const {
  formatSafeTenantManagementPolicyIdentityDiagnosticError,
  runTenantManagementPolicyIdentityDiagnostic,
  tenantManagementPolicyIdentityDiagnosticSql,
} = await tsImport("../../scripts/fieldgrid-staging-tenant-management-policy-identity-diagnostic.mts", import.meta.url);

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const digest = (value) => createHash("sha256")
  .update(JSON.stringify(value)).digest("hex");
const identityKeys = (identities) => identities.map(({ schema, table, policy }) =>
  JSON.stringify([schema, table, policy])).sort();

// Called by the disposable PostgreSQL 17 migration gate, outside a transaction.
// These deliberately artificial policies are scanner fixtures, not evidence of
// any staging policy identity or a proposed authorization replacement.
export async function verifyPolicyIdentityDiagnostic(client, context) {
  const database = (await client.query("SELECT current_database() AS name")).rows[0];
  assert.ok(["fieldgrid_runtime_safety", "fieldgrid_runtime_safety_test"].includes(database.name),
    "Policy identity runtime fixtures require the disposable safety database");
  assert.deepEqual(await runTenantManagementPolicyIdentityDiagnostic(client), {
    unknownConsumerCount: 0, identities: [],
  });

  const schema = `fg_policy_identity_${randomUUID().replaceAll("-", "")}`;
  const invalidSchema = `${schema}-bad`;
  const namespace = quoteIdentifier(schema);
  const targets = `${namespace}.targets`;
  const canary = "synthetic_policy_expression_must_not_be_exported";
  const querySql = tenantManagementPolicyIdentityDiagnosticSql();
  const schemas = [schema, invalidSchema];
  const basePolicies = [
    ["targets", "qual_function", `FOR SELECT USING (${namespace}.is_management() OR payload = '${canary}')`],
    ["targets", "check_function", `FOR INSERT WITH CHECK (${namespace}.is_management())`],
    ["targets", "qual_roles", `FOR SELECT USING (EXISTS (SELECT 1 FROM ${namespace}.user_roles))`],
    ["targets", "check_roles", `FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM ${namespace}.user_roles))`],
    ["user_roles", "user_roles_select_own", `FOR SELECT USING (${namespace}.is_management())`],
    ["targets", "user_roles_insert_management", `FOR INSERT WITH CHECK (${namespace}.is_management())`],
  ];
  const expected = basePolicies.map(([table, policy]) => ({ schema, table, policy }));
  const createPolicy = ([table, policy, clause]) => client.query(
    `CREATE POLICY ${quoteIdentifier(policy)} ON ${namespace}.${quoteIdentifier(table)} ${clause}`,
  );
  const dropPolicy = (table, policy) => client.query(
    `DROP POLICY ${quoteIdentifier(policy)} ON ${namespace}.${quoteIdentifier(table)}`,
  );
  const policySnapshot = async () => digest((await client.query(
    "SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid), '[]'::jsonb) AS policies FROM pg_catalog.pg_policy p",
  )).rows);
  const settings = async () => (await client.query(`SELECT
    current_setting('transaction_read_only') AS read_only,
    current_setting('transaction_isolation') AS isolation,
    current_setting('statement_timeout') AS statement_timeout`)).rows;
  const snapshot = async () => {
    const catalog = (await client.query(`SELECT
      (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid), '[]'::jsonb)
       FROM pg_catalog.pg_policy p) AS policies,
      (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid), '[]'::jsonb)
       FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname=ANY($1::text[])) AS functions,
      (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid), '[]'::jsonb)
       FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname=ANY($1::text[])) AS relations,
      (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum), '[]'::jsonb)
       FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
       JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname=ANY($1::text[])) AS columns`, [schemas])).rows;
    const data = {};
    for (const table of ["targets", "user_roles", "tenant_user_roles"]) {
      data[table] = (await client.query(`SELECT to_jsonb(fixture) AS row
        FROM ${namespace}.${quoteIdentifier(table)} fixture ORDER BY id`)).rows;
    }
    // Assertions can report only hashes, never catalog SQL or full row contents.
    return { catalog: digest(catalog), data: digest(data), settings: await settings() };
  };
  const assertResult = (result, identities = expected) => {
    assert.deepEqual(Object.keys(result).sort(), ["identities", "unknownConsumerCount"]);
    assert.equal(result.unknownConsumerCount, identities.length);
    assert.deepEqual(identityKeys(result.identities), identityKeys(identities));
    for (const identity of result.identities) {
      assert.deepEqual(Object.keys(identity).sort(), ["policy", "schema", "table"]);
    }
    assert.doesNotMatch(JSON.stringify(result), new RegExp(canary, "u"));
    assert.doesNotMatch(JSON.stringify(result), /\b(?:qual|with_check|payload|SELECT|EXISTS)\b/u);
  };
  const assertFailure = async (queryable, code) => {
    await assert.rejects(runTenantManagementPolicyIdentityDiagnostic(queryable), (error) => {
      assert.equal(error.message, code);
      assert.equal(formatSafeTenantManagementPolicyIdentityDiagnosticError(error),
        `fieldgrid-staging-tenant-management-policy-identity-diagnostic-v1: ${code}`);
      assert.doesNotMatch(JSON.stringify(error), new RegExp(canary, "u"));
      return true;
    });
  };
  const originalPolicies = await policySnapshot();
  const originalSettings = await settings();
  try {
    await client.query(`CREATE SCHEMA ${namespace};
      CREATE TABLE ${targets} (id integer PRIMARY KEY, payload text NOT NULL);
      CREATE TABLE ${namespace}.user_roles (id integer PRIMARY KEY, payload text NOT NULL);
      CREATE TABLE ${namespace}.tenant_user_roles (id integer PRIMARY KEY, payload text NOT NULL);
      INSERT INTO ${targets} VALUES (1, 'synthetic target one'), (2, 'synthetic target two');
      INSERT INTO ${namespace}.user_roles VALUES (1, 'synthetic global fixture');
      INSERT INTO ${namespace}.tenant_user_roles VALUES (1, 'synthetic scoped fixture');
      ALTER TABLE ${targets} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${namespace}.user_roles ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION ${namespace}.is_management() RETURNS boolean LANGUAGE sql AS 'SELECT false';
      CREATE FUNCTION ${namespace}.is_management_for_tenant(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT false';`);
    for (const policy of basePolicies) await createPolicy(policy);
    await createPolicy(["targets", "scoped_function_only",
      `FOR SELECT USING (${namespace}.is_management_for_tenant(NULL::uuid))`]);
    await createPolicy(["targets", "scoped_roles_only",
      `FOR SELECT USING (EXISTS (SELECT 1 FROM ${namespace}.tenant_user_roles))`]);

    await context.test("catalog scan distinguishes schema, table, USING and WITH CHECK consumers", async () => {
      const before = await snapshot();
      assertResult(await runTenantManagementPolicyIdentityDiagnostic(client));
      assert.deepEqual(await snapshot(), before);
    });

    await context.test("real read-only transaction rejects DML and DDL before exporting identities", async () => {
      const before = await snapshot();
      let inspected = false;
      const queryable = { async query(sql, values) {
        if (sql === querySql) {
          inspected = true;
          const activeSettings = await settings();
          assert.equal(activeSettings[0].read_only, "on");
          assert.equal(activeSettings[0].isolation, "repeatable read");
          assert.equal(activeSettings[0].statement_timeout, "30s");
          for (const statement of [
            `INSERT INTO ${targets} VALUES (3, 'forbidden synthetic insert')`,
            `UPDATE ${targets} SET payload='forbidden synthetic update' WHERE id=1`,
            `DELETE FROM ${targets} WHERE id=1`,
            `TRUNCATE ${targets}`,
            `CREATE TABLE ${namespace}.forbidden_create (id integer)`,
            `ALTER TABLE ${targets} ADD COLUMN forbidden_column integer`,
            `DROP TABLE ${targets}`,
          ]) {
            await client.query("SAVEPOINT diagnostic_read_only_probe");
            try {
              await assert.rejects(client.query(statement), (error) => error.code === "25006");
            } finally {
              await client.query("ROLLBACK TO SAVEPOINT diagnostic_read_only_probe");
              await client.query("RELEASE SAVEPOINT diagnostic_read_only_probe");
            }
          }
        }
        return client.query(sql, values);
      } };
      assertResult(await runTenantManagementPolicyIdentityDiagnostic(queryable));
      assert.equal(inspected, true);
      assert.deepEqual(await snapshot(), before);
    });

    await context.test("ten consumers succeed and eleven fail without truncated success", async () => {
      const additions = Array.from({ length: 5 }, (_, index) => ["targets", `bounded_${index}`,
        `FOR SELECT USING (${namespace}.is_management())`]);
      try {
        for (const policy of additions.slice(0, 4)) await createPolicy(policy);
        const ten = [...expected, ...additions.slice(0, 4).map(([table, policy]) => ({ schema, table, policy }))];
        const beforeTen = await snapshot();
        assertResult(await runTenantManagementPolicyIdentityDiagnostic(client), ten);
        assert.deepEqual(await snapshot(), beforeTen);
        await createPolicy(additions[4]);
        const beforeEleven = await snapshot();
        await assertFailure(client, "too_many_consumers");
        assert.deepEqual(await snapshot(), beforeEleven);
        await dropPolicy("targets", "bounded_4");
        assertResult(await runTenantManagementPolicyIdentityDiagnostic(client), ten);
      } finally {
        for (const [table, policy] of additions) {
          await client.query(`DROP POLICY IF EXISTS ${quoteIdentifier(policy)} ON ${namespace}.${quoteIdentifier(table)}`);
        }
      }
    });

    for (const field of ["schema", "table", "policy"]) {
      await context.test(`invalid catalog ${field} identifier fails closed and releases its transaction`, async () => {
        const invalidNamespace = quoteIdentifier(invalidSchema);
        try {
          if (field === "schema") {
            await client.query(`CREATE SCHEMA ${invalidNamespace};
              CREATE TABLE ${invalidNamespace}.target (id integer);
              CREATE POLICY invalid_fixture ON ${invalidNamespace}.target
              FOR SELECT USING (${namespace}.is_management())`);
          } else if (field === "table") {
            await client.query(`CREATE TABLE ${namespace}."invalid-table" (id integer);
              CREATE POLICY invalid_fixture ON ${namespace}."invalid-table"
              FOR SELECT USING (${namespace}.is_management())`);
          } else {
            await createPolicy(["targets", "invalid-policy", `FOR SELECT USING (${namespace}.is_management())`]);
          }
          const before = await snapshot();
          await assertFailure(client, "diagnostic_failed");
          assert.deepEqual(await snapshot(), before);
        } finally {
          if (field === "schema") await client.query(`DROP SCHEMA IF EXISTS ${invalidNamespace} CASCADE`);
          else if (field === "table") await client.query(`DROP TABLE IF EXISTS ${namespace}."invalid-table"`);
          else await client.query(`DROP POLICY IF EXISTS "invalid-policy" ON ${targets}`);
        }
        assertResult(await runTenantManagementPolicyIdentityDiagnostic(client));
      });
    }

    await context.test("a real PostgreSQL query failure is bounded, rolls back and permits the next diagnostic", async () => {
      const before = await snapshot();
      let rolledBack = false;
      const queryable = { async query(sql, values) {
        if (sql === "ROLLBACK") rolledBack = true;
        if (sql === querySql) {
          // PostgreSQL aborts the transaction; its column/query detail must never
          // escape through the diagnostic's bounded error result.
          return client.query(`SELECT ${canary} FROM ${targets}`);
        }
        return client.query(sql, values);
      } };
      await assertFailure(queryable, "diagnostic_failed");
      assert.equal(rolledBack, true);
      assert.deepEqual(await snapshot(), before);
      assertResult(await runTenantManagementPolicyIdentityDiagnostic(client));
    });
  } finally {
    await client.query("ROLLBACK");
    await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(invalidSchema)} CASCADE`);
    await client.query(`DROP SCHEMA IF EXISTS ${namespace} CASCADE`);
  }
  assert.equal(await policySnapshot(), originalPolicies);
  assert.deepEqual(await settings(), originalSettings);
  assert.deepEqual(await runTenantManagementPolicyIdentityDiagnostic(client), {
    unknownConsumerCount: 0, identities: [],
  });
}
