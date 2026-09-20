import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const dbRequire = createRequire(new URL("../../lib/db/package.json", import.meta.url));
const { Client } = dbRequire("pg");
const { tsImport } = dbRequire("tsx/esm/api");
const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const canary = "synthetic_policy_definition_must_not_escape";
const historicalPolicyIdentity = {
  schema: "public", table: "personnel", name: "personnel_update_own_phone",
};

function sourceStatement(relativePath, startText, expectedHash) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  if (expectedHash) assert.equal(createHash("sha256").update(source).digest("hex"), expectedHash);
  const start = source.indexOf(startText);
  assert.ok(start >= 0 && source.indexOf(startText, start + 1) === -1);
  const end = source.indexOf(";", start);
  assert.ok(end > start);
  return source.slice(start, end + 1);
}

const historicalOwnUpdate = sourceStatement(
  "../../migrations/015_pwa_rls_policies.sql", 'CREATE POLICY "personnel_update_own_phone"',
  "75d9ccd99bfb5fab852bf891216859e489958b234bf6c3aec0d8a551cec35fdf",
);
const originalPersonnelPolicy = sourceStatement(
  "../../lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
  "CREATE POLICY object_personnel_management ON public.object_personnel",
);
const targetManifest = JSON.parse(readFileSync(new URL(
  "../fixtures/fieldgrid-tenant-management-policy-manifests.json", import.meta.url,
), "utf8")).variants.find(({ state, profile }) => state === "targetClean" && profile === "localShim").manifest;
const contactPolicy = targetManifest.policies.find(({ name }) => name === "object_contacts_management");

// Fixtures are committed in their own disposable databases so every diagnosis
// runs in an actual READ ONLY transaction, never a savepoint in a write fixture.
// Register this gate before the parent suite opens its template connection.
async function withClonedDatabase(run) {
  const sourceAddress = new URL(process.env.DATABASE_URL ?? "postgresql://invalid.invalid/invalid");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(sourceAddress.hostname),
    "Policy drift fixtures require a local disposable PostgreSQL server");
  const sourceDatabase = decodeURIComponent(sourceAddress.pathname.slice(1));
  assert.ok(["fieldgrid_runtime_safety", "fieldgrid_runtime_safety_test"].includes(sourceDatabase),
    "Policy drift fixtures require the disposable safety database");
  assert.equal(process.env.FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET, "1",
    "Policy drift fixtures require disposable-database reset authorization");
  const fixtureDatabase = `fg_policy_drift_${randomUUID().replaceAll("-", "")}`;
  const adminAddress = new URL(sourceAddress);
  adminAddress.pathname = "/postgres";
  const fixtureAddress = new URL(sourceAddress);
  fixtureAddress.pathname = `/${fixtureDatabase}`;
  const admin = new Client({ connectionString: adminAddress.toString(), ssl: false });
  let created = false;
  let client;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${quoteIdentifier(fixtureDatabase)} TEMPLATE ${quoteIdentifier(sourceDatabase)}`);
    created = true;
    client = new Client({ connectionString: fixtureAddress.toString(), ssl: false });
    await client.connect();
    return await run(client);
  } finally {
    try {
      await client?.end();
    } finally {
      try {
        if (created) await admin.query(`DROP DATABASE ${quoteIdentifier(fixtureDatabase)} WITH (FORCE)`);
      } finally {
        await admin.end();
      }
    }
  }
}

async function fullSnapshot(client) {
  const schemas = ["public", "auth", "app_private", "storage", "drizzle"];
  const tables = (await client.query(`SELECT namespace.nspname AS schema, relation.relname AS name
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname=ANY($1::text[]) AND relation.relkind IN ('r','p')
    ORDER BY namespace.nspname,relation.relname`, [schemas])).rows;
  const data = {};
  for (const { schema, name } of tables) {
    const rows = (await client.query(`SELECT to_jsonb(fixture) AS row
      FROM ${quoteIdentifier(schema)}.${quoteIdentifier(name)} fixture
      ORDER BY to_jsonb(fixture)::text`)).rows;
    // Never include row contents, helper bodies, or policy expressions in test
    // failure output. Counts plus whole-content hashes include the journal.
    data[`${schema}.${name}`] = { count: rows.length, hash: digest(rows) };
  }
  const catalog = await client.query(`SELECT
    (SELECT coalesce(jsonb_agg(to_jsonb(policy) ORDER BY policy.oid),'[]'::jsonb)
      FROM pg_catalog.pg_policy policy) AS policies,
    (SELECT coalesce(jsonb_agg(to_jsonb(procedure) ORDER BY procedure.oid),'[]'::jsonb)
      FROM pg_catalog.pg_proc procedure JOIN pg_catalog.pg_namespace namespace
        ON namespace.oid=procedure.pronamespace WHERE namespace.nspname=ANY($1::text[])) AS functions,
    (SELECT coalesce(jsonb_agg(to_jsonb(relation) ORDER BY relation.oid),'[]'::jsonb)
      FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace
        ON namespace.oid=relation.relnamespace WHERE namespace.nspname=ANY($1::text[])) AS relations,
    (SELECT coalesce(jsonb_agg(to_jsonb(attribute) ORDER BY attribute.attrelid,attribute.attnum),'[]'::jsonb)
      FROM pg_catalog.pg_attribute attribute JOIN pg_catalog.pg_class relation ON relation.oid=attribute.attrelid
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname=ANY($1::text[])) AS columns,
    (SELECT coalesce(jsonb_agg(to_jsonb(constraint_row) ORDER BY constraint_row.oid),'[]'::jsonb)
      FROM pg_catalog.pg_constraint constraint_row JOIN pg_catalog.pg_namespace namespace
        ON namespace.oid=constraint_row.connamespace WHERE namespace.nspname=ANY($1::text[])) AS constraints,
    (SELECT coalesce(jsonb_agg(to_jsonb(trigger_row) ORDER BY trigger_row.oid),'[]'::jsonb)
      FROM pg_catalog.pg_trigger trigger_row JOIN pg_catalog.pg_class relation ON relation.oid=trigger_row.tgrelid
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname=ANY($1::text[])) AS triggers,
    (SELECT coalesce(jsonb_agg(to_jsonb(default_row) ORDER BY default_row.oid),'[]'::jsonb)
      FROM pg_catalog.pg_attrdef default_row JOIN pg_catalog.pg_class relation ON relation.oid=default_row.adrelid
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname=ANY($1::text[])) AS defaults,
    (SELECT coalesce(jsonb_agg(to_jsonb(namespace) ORDER BY namespace.oid),'[]'::jsonb)
      FROM pg_catalog.pg_namespace namespace WHERE namespace.nspname=ANY($1::text[])) AS namespaces`, [schemas]);
  return { catalog: digest(catalog.rows), data };
}

function variant(result, state = "targetClean") {
  const matches = result.variants.filter((entry) => entry.state === state && entry.profile === "localShim");
  assert.equal(matches.length, 1);
  return matches[0];
}

function policy(result) {
  const matches = variant(result).policies.filter((entry) => entry.name === contactPolicy.name);
  assert.equal(matches.length, 1);
  return matches[0];
}

function helper(result) {
  const matches = variant(result).helpers.filter((entry) => entry.name === "customer_has_access");
  assert.equal(matches.length, 1);
  return matches[0];
}

function relation(result) {
  const matches = variant(result).relations.filter((entry) => entry.table === "object_contacts");
  assert.equal(matches.length, 1);
  return matches[0];
}

function assertComponentBooleans(entry, falseFields = []) {
  for (const [key, value] of Object.entries(entry)) {
    if (typeof value === "boolean") assert.equal(value, !falseFields.includes(key), key);
  }
  for (const key of falseFields) assert.equal(entry[key], false, key);
}

function assertSafeFailure(error, suffix) {
  assert.equal(error?.message, `tenant_management_policy_drift_${suffix}`);
  assert.equal(JSON.stringify(error).includes(canary), false);
  return true;
}

export async function verifyTenantManagementPolicyDrift(context) {
  const { readTenantManagementPolicyDriftDiagnostic, loadTenantManagementPolicyDriftDiagnosticSource } = await tsImport(
    "../../scripts/fieldgrid-tenant-management-policy-drift-diagnostic.mts", import.meta.url,
  );
  const { readTenantManagementPolicyRepairReadiness } = await tsImport(
    "../../scripts/fieldgrid-tenant-management-policy-repair-contract.mts", import.meta.url,
  );
  const { runTenantManagementAuthorization } = await tsImport(
    "../../scripts/fieldgrid-staging-tenant-management-authorization.mts", import.meta.url,
  );
  const diagnose = async (client, afterRead) => {
    const before = await fullSnapshot(client);
    const searchPath = (await client.query("SHOW search_path")).rows;
    let result;
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    try {
      result = await readTenantManagementPolicyDriftDiagnostic(client);
      assert.equal(result.transactionReadOnly, true);
      assert.equal(result.repeatableRead, true);
      assert.equal(result.postgresMajorMatches, true);
      assert.equal(result.postgresMajor, 17);
      assert.equal(result.searchPathMatches, true);
      assert.equal(result.variants.length, 8);
      assert.equal(JSON.stringify(result).includes(canary), false);
      await afterRead?.();
    } finally {
      await client.query("ROLLBACK");
      assert.deepEqual((await client.query("SHOW search_path")).rows, searchPath);
      assert.deepEqual(await fullSnapshot(client), before);
    }
    return result;
  };

  await context.test("canonical metadata matches every component and diagnosis preserves all rows and catalog definitions", () =>
    withClonedDatabase(async (client) => {
      const result = await diagnose(client);
      const expected = variant(result);
      assert.equal(result.exactHistoricalOwnUpdateMatches, false);
      assert.equal(expected.policySetMatches, true);
      assert.equal(expected.helperContractsMatch, true);
      assert.equal(expected.relationsMatch, true);
      assert.equal(expected.baselinePlusHistoricalOwnUpdateSetMatches, false);
      assert.deepEqual(expected.unexpectedPolicies, []);
      for (const entry of [...expected.policies, ...expected.helpers, ...expected.relations]) {
        assertComponentBooleans(entry);
        for (const column of entry.columns ?? []) assertComponentBooleans(column);
        for (const acl of entry.directAclEntries ?? []) assertComponentBooleans(acl);
        for (const permission of entry.effectiveExecute ?? []) assertComponentBooleans(permission);
      }
      assert.deepEqual(await diagnose(client), result);
    }),
  );

  await context.test("the source-defined pre-repair clean state remains distinguishable from the repaired target", () =>
    withClonedDatabase(async (client) => {
      await client.query("DROP POLICY owner_or_staff_read_payments ON public.payments");
      await client.query("DROP POLICY object_personnel_management ON public.object_personnel");
      await client.query(originalPersonnelPolicy);
      const result = await diagnose(client);
      assert.equal(variant(result, "clean").policySetMatches, true);
      assert.equal(variant(result, "clean").helperContractsMatch, true);
      assert.equal(variant(result, "clean").relationsMatch, true);
      assert.equal(variant(result).policySetMatches, false);
    }),
  );

  await context.test("the exact historical own-update policy explains an extra identity without satisfying the repair policy set", () =>
    withClonedDatabase(async (client) => {
      await client.query(historicalOwnUpdate);
      const result = await diagnose(client, async () => {
        assert.deepEqual(await readTenantManagementPolicyRepairReadiness(client), {
          legacyDefinitionMatches: false,
          cleanDefinitionMatches: false,
          targetDefinitionMatches: false,
          dependenciesValid: false,
        });
      });
      assert.equal(result.exactHistoricalOwnUpdateMatches, true);
      assert.equal(variant(result).policySetMatches, false);
      assert.equal(variant(result).baselinePlusHistoricalOwnUpdateSetMatches, true);
      assert.equal(variant(result).helperContractsMatch, true);
      assert.equal(variant(result).relationsMatch, true);
      assert.deepEqual(variant(result).unexpectedPolicies, [historicalPolicyIdentity]);
      for (const entry of variant(result).policies) assertComponentBooleans(entry);
    }),
  );

  await context.test("a historical policy name with a changed predicate is never treated as source-exact", () =>
    withClonedDatabase(async (client) => {
      await client.query(historicalOwnUpdate);
      await client.query("ALTER POLICY personnel_update_own_phone ON public.personnel WITH CHECK (true)");
      const result = await diagnose(client);
      assert.equal(result.exactHistoricalOwnUpdateMatches, false);
      assert.equal(variant(result).baselinePlusHistoricalOwnUpdateSetMatches, false);
      assert.deepEqual(variant(result).unexpectedPolicies, [historicalPolicyIdentity]);
    }),
  );

  const recreateContactPolicy = (command = "ALL", permissive = "PERMISSIVE") => `
    DROP POLICY object_contacts_management ON public.object_contacts;
    CREATE POLICY object_contacts_management ON public.object_contacts AS ${permissive}
    FOR ${command} TO authenticated
    USING (${contactPolicy.usingExpression}) WITH CHECK (${contactPolicy.checkExpression})`;
  const policyCases = [
    ["missing", "DROP POLICY object_contacts_management ON public.object_contacts", "present"],
    ["command", recreateContactPolicy("UPDATE"), "commandMatches"],
    ["permissiveness", recreateContactPolicy("ALL", "RESTRICTIVE"), "permissiveMatches"],
    ["roles", "ALTER POLICY object_contacts_management ON public.object_contacts TO anon", "rolesMatch"],
    ["USING", `ALTER POLICY object_contacts_management ON public.object_contacts USING (false AND '${canary}'::text IS NULL)`, "usingMatches"],
    ["WITH CHECK", "ALTER POLICY object_contacts_management ON public.object_contacts WITH CHECK (false)", "checkMatches"],
  ];
  for (const [label, mutation, field] of policyCases) {
    await context.test(`expected policy ${label} drift is identified independently`, () =>
      withClonedDatabase(async (client) => {
        await client.query(mutation);
        const result = await diagnose(client);
        assert.equal(variant(result).policySetMatches, false);
        assert.equal(variant(result).helperContractsMatch, true);
        assert.equal(variant(result).relationsMatch, true);
        if (field === "present") assert.equal(policy(result).present, false);
        else assertComponentBooleans(policy(result), [field]);
      }),
    );
  }

  const helperCases = [
    ["body", `CREATE OR REPLACE FUNCTION public.customer_has_access(p_customer_id uuid,p_tenant_id uuid)
      RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,auth
      AS $fixture$ SELECT false /* ${canary} */ $fixture$`, ["bodyMatches"]],
    ["owner", "ALTER FUNCTION public.customer_has_access(uuid,uuid) OWNER TO authenticated", ["ownerMatches"]],
    ["configuration", "ALTER FUNCTION public.customer_has_access(uuid,uuid) SET search_path=pg_catalog", ["configMatches"]],
    // Grant option changes the exact direct ACL without changing effective
    // EXECUTE access. No cluster-wide roles/memberships are modified in fixtures.
    ["direct ACL", "GRANT EXECUTE ON FUNCTION public.customer_has_access(uuid,uuid) TO authenticated WITH GRANT OPTION", ["directAclMatches"]],
    ["effective ACL", "REVOKE EXECUTE ON FUNCTION public.customer_has_access(uuid,uuid) FROM authenticated", ["effectiveExecuteMatches", "directAclMatches", "directAclCountMatches"]],
  ];
  for (const [label, mutation, fields] of helperCases) {
    await context.test(`helper ${label} drift is reported without emitting its definition`, () =>
      withClonedDatabase(async (client) => {
        await client.query(mutation);
        const result = await diagnose(client);
        assert.equal(variant(result).helperContractsMatch, false);
        assert.equal(variant(result).policySetMatches, true);
        assert.equal(variant(result).relationsMatch, true);
        for (const field of fields) assert.equal(helper(result)[field], false, field);
        if (label === "direct ACL") {
          assert.equal(helper(result).directAclCountMatches, true);
          assert.equal(helper(result).effectiveExecuteMatches, true);
          assert.equal(helper(result).directAclEntries.find(({ grantee }) => grantee === "authenticated").matches, false);
          for (const permission of helper(result).effectiveExecute) assertComponentBooleans(permission);
        }
        if (label === "effective ACL") {
          const authenticated = helper(result).effectiveExecute.find(({ role }) => role === "authenticated");
          assertComponentBooleans(authenticated, ["matches"]);
          assert.equal(helper(result).directAclEntries.find(({ grantee }) => grantee === "authenticated").matches, false);
        }
        if (label === "body" || label === "configuration") assertComponentBooleans(helper(result), fields);
      }),
    );
  }

  await context.test("relation nullability drift leaves policy text intact and identifies the exact column", () =>
    withClonedDatabase(async (client) => {
      await client.query("ALTER TABLE public.object_contacts ALTER COLUMN object_id DROP NOT NULL");
      const result = await diagnose(client);
      assert.equal(variant(result).relationsMatch, false);
      assert.equal(variant(result).policySetMatches, true);
      assertComponentBooleans(relation(result));
      const column = relation(result).columns.find(({ name }) => name === "object_id");
      assertComponentBooleans(column, ["notNullMatches"]);
    }),
  );

  await context.test("a renamed required column is explicitly absent instead of losing the relation diagnostic", () =>
    withClonedDatabase(async (client) => {
      await client.query("ALTER TABLE public.object_contacts RENAME COLUMN object_id TO synthetic_object_id");
      const result = await diagnose(client);
      assert.equal(variant(result).relationsMatch, false);
      assert.equal(relation(result).present, true);
      assert.equal(relation(result).columns.find(({ name }) => name === "object_id").present, false);
    }),
  );

  await context.test("PostgreSQL itself refuses row and catalog writes in the diagnosis transaction", () =>
    withClonedDatabase(async (client) => {
      const before = await fullSnapshot(client);
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      try {
        for (const mutation of [
          "UPDATE public.object_contacts SET first_name=first_name WHERE false",
          "ALTER TABLE public.object_contacts FORCE ROW LEVEL SECURITY",
          "CREATE POLICY synthetic_read_only_violation ON public.object_contacts USING (false)",
        ]) {
          await client.query("SAVEPOINT forbidden_write");
          await assert.rejects(client.query(mutation), (error) => error.code === "25006");
          await client.query("ROLLBACK TO SAVEPOINT forbidden_write");
          await client.query("RELEASE SAVEPOINT forbidden_write");
        }
        const result = await readTenantManagementPolicyDriftDiagnostic(client);
        assert.equal(result.transactionReadOnly, true);
        assert.equal(result.repeatableRead, true);
        assert.equal(variant(result).policySetMatches, true);
      } finally {
        await client.query("ROLLBACK");
      }
      assert.deepEqual(await fullSnapshot(client), before);
    }),
  );

  for (const mode of ["REPEATABLE READ READ WRITE", "READ COMMITTED READ ONLY"]) {
    await context.test(`the guarded reader rejects ${mode} before returning catalog details`, () =>
      withClonedDatabase(async (client) => {
        const before = await fullSnapshot(client);
        await client.query(`BEGIN TRANSACTION ISOLATION LEVEL ${mode}`);
        try {
          await assert.rejects(readTenantManagementPolicyDriftDiagnostic(client),
            (error) => assertSafeFailure(error, "transaction_invalid"));
        } finally {
          await client.query("ROLLBACK");
        }
        assert.deepEqual(await fullSnapshot(client), before);
      }),
    );
  }

  await context.test("up to ten extra identities per source variant are bounded and overflow fails closed", () =>
    withClonedDatabase(async (client) => {
      const baseline = await diagnose(client);
      const maximumExisting = Math.max(...baseline.variants.map(({ unexpectedPolicies }) => unexpectedPolicies.length));
      assert.ok(maximumExisting >= 0 && maximumExisting < 10);
      const acceptedCount = 10 - maximumExisting;
      for (let index = 0; index < acceptedCount; index++) {
        await client.query(`CREATE POLICY synthetic_drift_extra_${index} ON public.object_contacts USING (false)`);
      }
      const bounded = await diagnose(client);
      assert.equal(Math.max(...bounded.variants.map(({ unexpectedPolicies }) => unexpectedPolicies.length)), 10);
      await client.query("CREATE POLICY synthetic_drift_overflow ON public.object_contacts USING (false)");
      await assert.rejects(diagnose(client), (error) => assertSafeFailure(error, "policy_limit_exceeded"));
    }),
  );

  await context.test("an unsafe catalog identity yields a fixed error without copying the identity or expression", () =>
    withClonedDatabase(async (client) => {
      await client.query(`CREATE POLICY "synthetic-unsafe-policy" ON public.personnel USING ('${canary}'::text IS NULL)`);
      await assert.rejects(diagnose(client), (error) => {
        assert.equal(error.message.includes("synthetic-unsafe-policy"), false);
        return assertSafeFailure(error, "catalog_invalid");
      });
    }),
  );

  const migrationNames = [
    "20260914125400_reconcile_legacy_global_rbac_policies.sql",
    "20260914125503_scope_tenant_management_authorization.sql",
    "20260919220633_repair_tenant_management_policy_consumers.sql",
  ];
  const driftSql = loadTenantManagementPolicyDriftDiagnosticSource().sql;
  const assertRunnerDiagnosesAndBlocks = async (client, {
    repairRecorded = true, scopeMatches = true, inspectDetails,
  }) => {
    const before = await fullSnapshot(client);
    const searchPath = (await client.query("SHOW search_path")).rows;
    const readJournal = async () => (await client.query(`SELECT name,hash,baselined
      FROM drizzle.veele_sql_migrations WHERE name=ANY($1::text[]) ORDER BY name`, [migrationNames])).rows;
    const journal = await readJournal();
    const recordedNames = repairRecorded ? migrationNames : migrationNames.slice(0, 2);
    assert.deepEqual(journal.map(({ name }) => name), recordedNames);
    assert.equal(journal.every(({ hash, baselined }) => /^[a-f0-9]{64}$/u.test(hash) && baselined === false), true);

    const statements = [];
    const snapshots = [];
    const transactionState = async () => (await client.query(`SELECT
      pg_catalog.current_setting('transaction_read_only')='on' AS readonly,
      pg_catalog.current_setting('transaction_isolation')='repeatable read' AS repeatable,
      pg_catalog.pg_current_snapshot()::text AS snapshot`)).rows[0];
    const queryable = { async query(sql, values) {
      statements.push(sql);
      const result = await client.query(sql, values);
      if (sql === "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY" || sql === driftSql) {
        snapshots.push(await transactionState());
      }
      return result;
    } };
    const diagnosed = await runTenantManagementAuthorization(queryable, "diagnose");
    assert.equal(diagnosed.result, "diagnosed");
    assert.equal(diagnosed.state, "unknown-state");
    assert.equal(diagnosed.migrationRecorded, repairRecorded);
    assert.equal(diagnosed.scopeMigrationRecorded, true);
    assert.equal(diagnosed.repairMigrationRecorded, repairRecorded);
    assert.equal(diagnosed.contractVerified, false);
    assert.equal(diagnosed.readyForApply, false);
    assert.equal(diagnosed.readyForPrerequisiteRepair, false);
    assert.equal(diagnosed.repairReadiness.dependenciesValid, false);
    assert.deepEqual(diagnosed.catalogChecks, {
      scopeContractMatches: scopeMatches,
      scopeCatalogMatches: scopeMatches,
      repairCatalogMatches: false,
    });
    assert.ok(diagnosed.driftDiagnostic);
    assert.equal(diagnosed.driftDiagnostic.transactionReadOnly, true);
    assert.equal(diagnosed.driftDiagnostic.repeatableRead, true);
    assert.equal(diagnosed.driftDiagnostic.postgresMajor, 17);
    assert.equal(diagnosed.driftDiagnostic.searchPathMatches, true);
    assert.equal(JSON.stringify(diagnosed).includes(canary), false);
    assert.equal(snapshots.length, 2);
    assert.equal(snapshots[0].readonly, true);
    assert.equal(snapshots[0].repeatable, true);
    assert.deepEqual(snapshots[1], snapshots[0]);
    assert.equal(statements.includes("ROLLBACK"), true);
    assert.equal(statements.includes("COMMIT"), false);
    inspectDetails(diagnosed.driftDiagnostic);
    assert.deepEqual(await readJournal(), journal);
    assert.deepEqual((await client.query("SHOW search_path")).rows, searchPath);
    assert.deepEqual(await fullSnapshot(client), before);

    statements.length = 0;
    await assert.rejects(runTenantManagementAuthorization(queryable, "apply"), { message: "catalog_invalid" });
    assert.equal(statements.some((sql) => /\bWITH\s+access_pairs\s+AS\b/u.test(sql)), false,
      "inconsistent recorded catalogs must be refused before reading impact");
    assert.equal(statements.includes(driftSql), false);
    assert.equal(statements.some((sql) => /^\s*(?:DO|CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/imu.test(sql)), false,
      "refused apply must execute no migration or journal mutation");
    assert.equal(statements.includes("ROLLBACK"), true);
    assert.equal(statements.includes("COMMIT"), false);
    assert.deepEqual(await readJournal(), journal);
    assert.deepEqual((await client.query("SHOW search_path")).rows, searchPath);
    assert.deepEqual(await fullSnapshot(client), before);
    assert.equal((await client.query(`SELECT count(*)::int AS count FROM pg_catalog.pg_locks
      WHERE pid=pg_catalog.pg_backend_pid() AND locktype='advisory'`)).rows[0].count, 0);
  };

  for (const [label, mutation, scopeMatches, inspectDetails] of [
    ["policy", "ALTER POLICY object_contacts_management ON public.object_contacts USING (false)", true,
      (details) => {
        assert.equal(variant(details).policySetMatches, false);
        assertComponentBooleans(policy(details), ["usingMatches"]);
      }],
    ["helper", "ALTER FUNCTION public.customer_has_access(uuid,uuid) SET search_path=pg_catalog", true,
      (details) => {
        assert.equal(variant(details).helperContractsMatch, false);
        assertComponentBooleans(helper(details), ["configMatches"]);
      }],
    ["scope wrapper", "ALTER FUNCTION public.is_management_for_tenant(uuid) SET search_path=pg_catalog,public", false,
      (details) => {
        // This wrapper belongs to the separate scope contract. Its failure must
        // remain explicit even when all policy-manifest components still match.
        assert.equal(variant(details).policySetMatches, true);
        assert.equal(variant(details).helperContractsMatch, true);
        assert.equal(variant(details).relationsMatch, true);
      }],
  ]) {
    await context.test(`fully recorded ${label} drift is diagnosed by the runner and apply remains blocked`, () =>
      withClonedDatabase(async (client) => {
        await client.query(mutation);
        await assertRunnerDiagnosesAndBlocks(client, { scopeMatches, inspectDetails });
      }),
    );
  }

  await context.test("an installed clean pair with a pending repair and historical extra stays diagnosable but cannot apply", () =>
    withClonedDatabase(async (client) => {
      await client.query("BEGIN");
      try {
        await client.query("DROP POLICY owner_or_staff_read_payments ON public.payments");
        await client.query("DROP POLICY object_personnel_management ON public.object_personnel");
        await client.query(originalPersonnelPolicy);
        await client.query(historicalOwnUpdate);
        assert.equal((await client.query("DELETE FROM drizzle.veele_sql_migrations WHERE name=$1", [migrationNames[2]])).rowCount, 1);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      await assertRunnerDiagnosesAndBlocks(client, {
        repairRecorded: false,
        inspectDetails: (details) => {
          assert.equal(details.exactHistoricalOwnUpdateMatches, true);
          assert.equal(variant(details, "clean").policySetMatches, false);
          assert.equal(variant(details, "clean").baselinePlusHistoricalOwnUpdateSetMatches, true);
          assert.deepEqual(variant(details, "clean").unexpectedPolicies, [historicalPolicyIdentity]);
        },
      });
    }),
  );
}
