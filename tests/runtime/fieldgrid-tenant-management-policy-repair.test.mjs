import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { sqlForManagedMigrationTransaction } from "../../lib/db/src/migration-transaction-retry.ts";
import { installHistoricalTenantManagementHelper } from "./fieldgrid-tenant-management-authorization.test.mjs";

const dbRequire = createRequire(new URL("../../lib/db/package.json", import.meta.url));
const { Client } = dbRequire("pg");
const { tsImport } = dbRequire("tsx/esm/api");
const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const migrationNames = [
  "20260914125400_reconcile_legacy_global_rbac_policies.sql",
  "20260914125503_scope_tenant_management_authorization.sql",
  "20260919220633_repair_tenant_management_policy_consumers.sql",
];

const legacyPolicySources = [
  ["../../migrations/023_objects_extended.sql", 'CREATE POLICY "object_contacts_management_all"'],
  ["../../migrations/023_objects_extended.sql", 'CREATE POLICY "object_personnel_management_all"'],
  ["../../migrations/013_sprint5_payments.sql", 'CREATE POLICY "owner_or_staff_read_payments"'],
];
function sourceStatement(relativePath, startText) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const start = source.indexOf(startText);
  assert.ok(start >= 0 && source.indexOf(startText, start + 1) === -1);
  const end = source.indexOf(";", start);
  assert.ok(end > start);
  return source.slice(start, end + 1);
}
const originalPersonnelPolicy = sourceStatement(
  "../../lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
  "CREATE POLICY object_personnel_management ON public.object_personnel",
);
const originalServicePaymentPolicy = sourceStatement(
  "../../migrations/013_sprint5_payments.sql", 'CREATE POLICY "service_role_all_payments"',
);

async function installHistoricalProviderRoleFixture(client) {
  const contactHelperAccess = async () => (await client.query(`SELECT expected.signature,
    has_function_privilege('authenticated',procedure.oid,'EXECUTE') AS authenticated,
    has_function_privilege('anon',procedure.oid,'EXECUTE') AS anon,
    has_function_privilege('service_role',procedure.oid,'EXECUTE') AS service_role
    FROM (VALUES ('auth.uid()'),('public.is_management_for_tenant(uuid)'),
      ('public.customer_has_access(uuid,uuid)')) AS expected(signature)
    JOIN pg_catalog.pg_proc procedure ON procedure.oid=to_regprocedure(expected.signature)
    ORDER BY expected.signature`)).rows;
  const retainedAccess = await contactHelperAccess();
  assert.equal(retainedAccess.length, 3);
  const bytes = readFileSync(new URL("../fixtures/fieldgrid-supabase-auth-functions.sql", import.meta.url));
  const provenance = JSON.parse(readFileSync(new URL("../fixtures/fieldgrid-supabase-auth-functions.provenance.json", import.meta.url), "utf8"));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.sha256);
  const source = bytes.toString("utf8");
  const start = source.indexOf('create or replace function {{ index .Options "Namespace" }}.role()');
  const end = source.indexOf("$$;", start);
  assert.ok(start >= 0 && end > start);
  await client.query(source.slice(start, end + 3).replaceAll('{{ index .Options "Namespace" }}', "auth"));
  // This disposable historical fixture reproduces the provider's original
  // default function ACL. Production SQL never grants any helper/table rights.
  await client.query("GRANT EXECUTE ON FUNCTION auth.role() TO PUBLIC");
  assert.deepEqual(await contactHelperAccess(), retainedAccess);
}

async function restoreOriginalCleanPolicies(client) {
  await client.query("DROP POLICY IF EXISTS owner_or_staff_read_payments ON public.payments");
  await client.query("DROP POLICY object_personnel_management ON public.object_personnel");
  await client.query(originalPersonnelPolicy);
}

async function restoreLegacyPrescope(client) {
  await client.query("BEGIN");
  try {
    await installHistoricalTenantManagementHelper(client);
    await client.query("DROP FUNCTION app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid)");
    await restoreOriginalCleanPolicies(client);
    await installHistoricalProviderRoleFixture(client);
    await client.query("DROP POLICY IF EXISTS service_role_all_payments ON public.payments");
    await client.query(originalServicePaymentPolicy);
    for (const [path, start] of legacyPolicySources) await client.query(sourceStatement(path, start));
    const deleted = await client.query(
      "DELETE FROM drizzle.veele_sql_migrations WHERE name=ANY($1::text[])", [migrationNames],
    );
    assert.equal(deleted.rowCount, migrationNames.length);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function seedPreservedManagementPair(client) {
  const tenant = randomUUID(), user = randomUUID(), scopedRole = randomUUID();
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL session_replication_role=replica");
    let templates = (await client.query("SELECT id FROM public.roles WHERE name='Management'")).rows;
    if (templates.length === 0) {
      const template = randomUUID();
      await client.query("INSERT INTO public.roles(id,name,is_system) VALUES ($1,'Management',true)", [template]);
      templates = [{ id: template }];
    }
    assert.equal(templates.length, 1);
    const template = templates[0].id;
    const permissions = await client.query("SELECT permission_id FROM public.role_permissions WHERE role_id=$1", [template]);
    if (permissions.rows.length === 0) {
      const permission = randomUUID();
      await client.query("INSERT INTO public.permissions(id,resource,action) VALUES ($1,'policy_repair_synthetic','read')", [permission]);
      await client.query("INSERT INTO public.role_permissions(role_id,permission_id) VALUES ($1,$2)", [template, permission]);
    }
    await client.query("INSERT INTO auth.users(id,email) VALUES ($1,$2)", [user, `${user}@policy-repair.invalid`]);
    await client.query("INSERT INTO public.tenants(id,slug,name,is_active,status) VALUES ($1,$2,'Policy repair fixture',true,'active')", [tenant, `repair-${tenant}`]);
    await client.query("INSERT INTO public.tenant_users(tenant_id,user_id,role,status) VALUES ($1,$2,'owner','active')", [tenant, user]);
    await client.query(`INSERT INTO public.tenant_roles(id,tenant_id,template_role_id,name,is_system,is_custom)
      VALUES ($1,$2,$3,'Management',true,false)`, [scopedRole, tenant, template]);
    await client.query(`INSERT INTO public.tenant_role_permissions(tenant_role_id,permission_id)
      SELECT $1,permission_id FROM public.role_permissions WHERE role_id=$2`, [scopedRole, template]);
    await client.query("INSERT INTO public.tenant_user_roles(tenant_id,user_id,tenant_role_id) VALUES ($1,$2,$3)", [tenant, user, scopedRole]);
    await client.query("INSERT INTO public.user_roles(user_id,role_id) VALUES ($1,$2)", [user, template]);
    await client.query("SET LOCAL session_replication_role=origin");
    await client.query("COMMIT");
    return { tenant, user, scopedRole, template };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function seedContactAuthorizationActors(client) {
  const first = await seedPreservedManagementPair(client);
  const tenants = [first.tenant, randomUUID(), randomUUID()];
  const owner = first.user;
  const [scoped, member, outsider, globalOnly, platform] = Array.from({ length: 5 }, randomUUID);
  const roleB = randomUUID(), outsidePermission = randomUUID();
  const customers = tenants.map(() => randomUUID());
  const objects = tenants.map(() => randomUUID());
  const contacts = tenants.map(() => randomUUID());
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL session_replication_role=replica");
    for (const user of [scoped, member, outsider, globalOnly, platform]) {
      await client.query("INSERT INTO auth.users(id,email) VALUES ($1,$2)", [user, `${user}@policy-repair.invalid`]);
    }
    for (const tenant of tenants.slice(1)) {
      await client.query("INSERT INTO public.tenants(id,slug,name,is_active,status) VALUES ($1,$2,'Policy repair fixture',true,'active')", [tenant, `repair-${tenant}`]);
    }
    await client.query(`INSERT INTO public.tenant_users(tenant_id,user_id,role,status) VALUES
      ($1,$3,'owner','active'),($2,$4,'member','active'),($2,$5,'member','active'),($2,$6,'member','active')`,
    [tenants[1], tenants[0], owner, scoped, member, platform]);
    await client.query(`INSERT INTO public.tenant_roles(id,tenant_id,template_role_id,name,is_system,is_custom)
      VALUES ($1,$2,$3,'Management',true,false)`, [roleB, tenants[1], first.template]);
    await client.query(`INSERT INTO public.tenant_role_permissions(tenant_role_id,permission_id)
      SELECT $1,permission_id FROM public.role_permissions WHERE role_id=$2`, [roleB, first.template]);
    await client.query(`INSERT INTO public.tenant_user_roles(tenant_id,user_id,tenant_role_id) VALUES
      ($1,$3,$5),($2,$4,$6),($2,$7,$6)`,
    [tenants[1], tenants[0], owner, scoped, roleB, first.scopedRole, platform]);
    await client.query("INSERT INTO public.user_roles(user_id,role_id) VALUES ($1,$2)", [globalOnly, first.template]);
    await client.query("INSERT INTO public.platform_users(user_id,role,status) VALUES ($1,'support','suspended')", [platform]);
    await client.query("INSERT INTO public.permissions(id,resource,action) VALUES ($1,'policy_repair_outside','read')", [outsidePermission]);
    for (let index = 0; index < tenants.length; index++) {
      await client.query("INSERT INTO public.customers(id,tenant_id,name,code) VALUES ($1,$2,'Synthetic customer',$3)",
        [customers[index], tenants[index], `C-${customers[index]}`]);
      await client.query("INSERT INTO public.objects(id,tenant_id,customer_id,name,code) VALUES ($1,$2,$3,'Synthetic object',$4)",
        [objects[index], tenants[index], customers[index], `O-${objects[index]}`]);
      await client.query("INSERT INTO public.object_contacts(id,object_id,first_name,last_name) VALUES ($1,$2,'Synthetic','Contact')",
        [contacts[index], objects[index]]);
    }
    await client.query("SET LOCAL session_replication_role=origin");
    await client.query("COMMIT");
    return { ...first, tenants, owner, scoped, member, outsider, globalOnly, platform, roleB, outsidePermission, customers, objects, contacts };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function seedPolicyProbeRows(client, fixture) {
  const personnel = fixture.tenants.map(() => randomUUID());
  const sparePersonnel = fixture.tenants.map(() => randomUUID());
  const assignments = fixture.tenants.map(() => randomUUID());
  const invoices = fixture.tenants.map(() => randomUUID());
  const payments = fixture.tenants.map(() => randomUUID());
  const creator = randomUUID(), mismatchedPayment = randomUUID();
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL session_replication_role=replica");
    await client.query("INSERT INTO auth.users(id,email) VALUES ($1,$2)", [creator, `${creator}@policy-repair.invalid`]);
    await client.query(`INSERT INTO public.customer_users(tenant_id,customer_id,user_id,email,role,status)
      VALUES ($1,$2,$3,$4,'viewer','active')`,
    [fixture.tenants[0], fixture.customers[0], creator, `${creator}@policy-repair.invalid`]);
    for (let index = 0; index < fixture.tenants.length; index++) {
      for (const person of [personnel[index], sparePersonnel[index]]) {
        await client.query(`INSERT INTO public.personnel(id,tenant_id,first_name,last_name,email,code)
          VALUES ($1,$2,'Synthetic','Personnel',$3,$4)`,
        [person, fixture.tenants[index], `${person}@policy-repair.invalid`, `P-${person.slice(0, 16)}`]);
      }
      await client.query(`INSERT INTO public.assignments(id,tenant_id,customer_id,object_id,title,code)
        VALUES ($1,$2,$3,$4,'Synthetic assignment',$5)`,
      [assignments[index], fixture.tenants[index], fixture.customers[index], fixture.objects[index], `R-${assignments[index].slice(0, 16)}`]);
      await client.query(`INSERT INTO public.invoices(id,tenant_id,customer_id,assignment_id,due_date,status,created_by)
        VALUES ($1,$2,$3,$4,'2026-10-01','sent',$5)`,
      [invoices[index], fixture.tenants[index], fixture.customers[index], assignments[index], creator]);
      await client.query(`INSERT INTO public.payments(id,tenant_id,customer_id,invoice_id,source_id,amount_cents,payment_method)
        VALUES ($1,$2,$3,$4,$4,100,'manual_bank')`,
      [payments[index], fixture.tenants[index], fixture.customers[index], invoices[index]]);
      await client.query("INSERT INTO public.object_personnel(object_id,personnel_id) VALUES ($1,$2)",
        [fixture.objects[index], personnel[index]]);
    }
    // Historical cross-tenant corruption is a synthetic negative fixture. The
    // repair must hide it, not move or delete application rows to fit its policy.
    await client.query("INSERT INTO public.object_personnel(object_id,personnel_id) VALUES ($1,$2)",
      [fixture.objects[0], sparePersonnel[1]]);
    await client.query(`INSERT INTO public.payments(id,tenant_id,customer_id,invoice_id,source_id,amount_cents,payment_method)
      VALUES ($1,$2,$3,$4,$4,100,'manual_bank')`,
    [mismatchedPayment, fixture.tenants[0], fixture.customers[1], invoices[1]]);
    await client.query("SET LOCAL session_replication_role=origin");
    await client.query("COMMIT");
    return { personnel, sparePersonnel, invoices, payments, creator, mismatchedPayment };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function asAuthenticated(client, user, run) {
  await client.query("SAVEPOINT policy_repair_subject");
  try {
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user ?? ""]);
    await client.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user, role: "authenticated" })]);
    await client.query("SET LOCAL ROLE authenticated");
    await client.query("SET LOCAL row_security=on");
    const principal = (await client.query("SELECT current_user AS name,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
    assert.deepEqual(principal, { name: "authenticated", rolsuper: false, rolbypassrls: false });
    return await run();
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT policy_repair_subject");
    await client.query("RELEASE SAVEPOINT policy_repair_subject");
  }
}

function disposableConnection() {
  const address = new URL(process.env.DATABASE_URL ?? "postgresql://invalid.invalid/invalid");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(address.hostname),
    "Composite repair fixtures require a local disposable PostgreSQL server");
  const database = decodeURIComponent(address.pathname.slice(1));
  assert.ok(["fieldgrid_runtime_safety", "fieldgrid_runtime_safety_test"].includes(database),
    "Composite repair fixtures require the disposable safety database");
  assert.equal(process.env.FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET, "1",
    "Composite repair fixtures require explicit disposable-database reset authorization");
  return { address, database };
}

async function connected(address) {
  const client = new Client({ connectionString: address.toString(), ssl: false });
  await client.connect();
  return client;
}

// Each case owns a real database and real COMMIT boundaries. In particular,
// wrapping BEGIN/COMMIT in savepoints would not prove uncertain-commit recovery.
// The caller registers this gate before opening any source-database connection.
async function withClonedDatabase(run) {
  const { address, database } = disposableConnection();
  const fixtureDatabase = `fg_policy_repair_${randomUUID().replaceAll("-", "")}`;
  const adminAddress = new URL(address);
  adminAddress.pathname = "/postgres";
  const fixtureAddress = new URL(address);
  fixtureAddress.pathname = `/${fixtureDatabase}`;
  const admin = await connected(adminAddress);
  let created = false;
  let client;
  try {
    await admin.query(`CREATE DATABASE ${quoteIdentifier(fixtureDatabase)} TEMPLATE ${quoteIdentifier(database)}`);
    created = true;
    client = await connected(fixtureAddress);
    return await run(client, () => connected(fixtureAddress));
  } finally {
    try {
      await client?.end();
    } finally {
      try {
        if (created) {
          // FORCE applies exclusively to this generated, task-owned fixture DB.
          await admin.query(`DROP DATABASE ${quoteIdentifier(fixtureDatabase)} WITH (FORCE)`);
        }
      } finally {
        await admin.end();
      }
    }
  }
}

async function dataSnapshot(client) {
  const tables = (await client.query(`SELECT namespace.nspname AS schema, relation.relname AS name
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname IN ('public','auth','app_private','storage')
      AND relation.relkind IN ('r','p') ORDER BY namespace.nspname,relation.relname`)).rows;
  const result = {};
  for (const { schema, name } of tables) {
    const rows = (await client.query(`SELECT to_jsonb(fixture) AS row
      FROM ${quoteIdentifier(schema)}.${quoteIdentifier(name)} fixture
      ORDER BY to_jsonb(fixture)::text`)).rows;
    // Assertion diagnostics contain only counts and SHA-256 hashes, including
    // for synthetic auth/account rows and synthetic policy-expression canaries.
    result[`${schema}.${name}`] = { count: rows.length, hash: digest(rows) };
  }
  return result;
}

async function catalogSnapshot(client) {
  const result = await client.query(`SELECT
    (SELECT coalesce(jsonb_agg(to_jsonb(policy) ORDER BY policy.oid),'[]'::jsonb)
      FROM pg_catalog.pg_policy policy) AS policies,
    (SELECT coalesce(jsonb_agg(to_jsonb(procedure) ORDER BY procedure.oid),'[]'::jsonb)
      FROM pg_catalog.pg_proc procedure JOIN pg_catalog.pg_namespace namespace
        ON namespace.oid=procedure.pronamespace
      WHERE namespace.nspname IN ('public','auth','app_private','storage')) AS functions,
    (SELECT coalesce(jsonb_agg(to_jsonb(relation) ORDER BY relation.oid),'[]'::jsonb)
      FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace
        ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname IN ('public','auth','app_private','storage')) AS relations,
    (SELECT coalesce(jsonb_agg(to_jsonb(attribute) ORDER BY attribute.attrelid,attribute.attnum),'[]'::jsonb)
      FROM pg_catalog.pg_attribute attribute JOIN pg_catalog.pg_class relation ON relation.oid=attribute.attrelid
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname IN ('public','auth','app_private','storage')) AS columns,
    (SELECT coalesce(jsonb_agg(to_jsonb(journal) ORDER BY journal.name),'[]'::jsonb)
      FROM drizzle.veele_sql_migrations journal) AS history`);
  return digest(result.rows);
}

async function fullSnapshot(client) {
  return { catalog: await catalogSnapshot(client), data: await dataSnapshot(client) };
}

function observingQueryable(client, observe) {
  return { async query(sql, values) {
    await observe?.({ when: "before", sql, values, client });
    const result = await client.query(sql, values);
    await observe?.({ when: "after", sql, values, client, result });
    return result;
  } };
}

export async function verifyTenantManagementPolicyRepair(context) {
  const { runTenantManagementAuthorization } = await tsImport(
    "../../scripts/fieldgrid-staging-tenant-management-authorization.mts", import.meta.url,
  );
  const { readTenantManagementPolicyRepairReadiness } = await tsImport(
    "../../scripts/fieldgrid-tenant-management-policy-repair-contract.mts", import.meta.url,
  );
  const sources = migrationNames.map((name) => {
    const sql = readFileSync(new URL(`../../lib/db/migrations/${name}`, import.meta.url), "utf8")
      .replaceAll("\r\n", "\n");
    return { name, sql: sqlForManagedMigrationTransaction(sql), hash: createHash("sha256").update(sql).digest("hex") };
  });
  const assertCanonical = async (client) => {
    const result = await runTenantManagementAuthorization(client, "diagnose");
    assert.equal(result.result, "diagnosed");
    assert.equal(result.contractVerified, true);
    assert.equal(result.migrationRecorded, true);
    const history = await client.query(`SELECT name,hash,baselined
      FROM drizzle.veele_sql_migrations WHERE name=ANY($1::text[]) ORDER BY name`, [migrationNames]);
    assert.deepEqual(history.rows, sources.map(({ name, hash }) => ({ name, hash, baselined: false })));
  };
  await context.test("canonical clean install is diagnosed and repeated without database changes", () =>
    withClonedDatabase(async (client) => {
      const before = await fullSnapshot(client);
      const observed = [];
      const queryable = observingQueryable(client, ({ when, sql }) => {
        if (when === "before") observed.push(sql);
      });
      const diagnostic = await runTenantManagementAuthorization(queryable, "diagnose");
      assert.equal(diagnostic.result, "diagnosed");
      assert.equal(diagnostic.contractVerified, true);
      assert.equal(diagnostic.migrationRecorded, true);
      assert.ok(observed.includes("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"));
      assert.equal((await runTenantManagementAuthorization(client, "apply")).result, "already-applied");
      assert.deepEqual(await fullSnapshot(client), before);
    }),
  );

  await context.test("source manifest comparison pins deparsing locally and restores the caller search path", () =>
    withClonedDatabase(async (client) => {
      await client.query("SET search_path=public");
      const currentPath = async () => (await client.query("SHOW search_path")).rows[0].search_path;
      const before = await fullSnapshot(client);
      const expected = {
        legacyDefinitionMatches: false, cleanDefinitionMatches: false,
        targetDefinitionMatches: true, dependenciesValid: true,
      };
      assert.deepEqual(await readTenantManagementPolicyRepairReadiness(client), expected);
      assert.equal(await currentPath(), "public");
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      try {
        assert.deepEqual(await readTenantManagementPolicyRepairReadiness(client), expected);
      } finally {
        await client.query("ROLLBACK");
      }
      assert.equal(await currentPath(), "public");
      assert.equal((await runTenantManagementAuthorization(client, "diagnose")).contractVerified, true);
      assert.equal(await currentPath(), "public");
      assert.deepEqual(await fullSnapshot(client), before);
    }),
  );

  await context.test("proven legacy policies reproduce the immutable blocker and the prerequisite repairs it before chronological journaling", () =>
    withClonedDatabase(async (client) => {
      await restoreLegacyPrescope(client);
      const before = await dataSnapshot(client);
      await client.query("BEGIN");
      await assert.rejects(client.query(sources[0].sql), {
        code: "P0001", message: "tenant_management_legacy_policy_consumer_drift",
      });
      await client.query("ROLLBACK");
      const executionOrder = [];
      const journalOrder = [];
      const queryable = observingQueryable(client, ({ when, sql, values }) => {
        if (when !== "before") return;
        const source = sources.find((candidate) => candidate.sql === sql);
        if (source) executionOrder.push(source.name);
        if (sql.startsWith("INSERT INTO drizzle.veele_sql_migrations")) journalOrder.push(values[0]);
      });
      assert.equal((await runTenantManagementAuthorization(queryable, "apply")).result, "applied");
      assert.deepEqual(executionOrder, [migrationNames[2], migrationNames[0], migrationNames[1]]);
      assert.deepEqual(journalOrder, migrationNames);
      await assertCanonical(client);
      assert.deepEqual(await dataSnapshot(client), before);
    }),
  );

  await context.test("runner diagnostics enforce PostgreSQL read-only DDL and DML rejection", () =>
    withClonedDatabase(async (client) => {
      const before = await fullSnapshot(client);
      let verified = false;
      const queryable = observingQueryable(client, async ({ when, sql }) => {
        if (when !== "after" || sql !== "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY") return;
        verified = true;
        const settings = (await client.query(`SELECT current_setting('transaction_read_only') AS read_only,
          current_setting('transaction_isolation') AS isolation`)).rows[0];
        assert.deepEqual(settings, { read_only: "on", isolation: "repeatable read" });
        for (const statement of [
          "UPDATE public.tenant_users SET status=status WHERE false",
          "CREATE TABLE public.synthetic_forbidden_diagnostic_table (id integer)",
        ]) {
          await client.query("SAVEPOINT diagnostic_write_probe");
          await assert.rejects(client.query(statement), { code: "25006" });
          await client.query("ROLLBACK TO SAVEPOINT diagnostic_write_probe");
          await client.query("RELEASE SAVEPOINT diagnostic_write_probe");
        }
      });
      assert.equal((await runTenantManagementAuthorization(queryable, "diagnose")).contractVerified, true);
      assert.equal(verified, true);
      assert.deepEqual(await fullSnapshot(client), before);
    }),
  );

  await context.test("previously installed immutable pair runs only the new verification migration", () =>
    withClonedDatabase(async (client) => {
      await client.query("DELETE FROM drizzle.veele_sql_migrations WHERE name=$1", [migrationNames[2]]);
      const before = await dataSnapshot(client);
      const executionOrder = [];
      const journalOrder = [];
      const queryable = observingQueryable(client, ({ when, sql, values }) => {
        if (when !== "before") return;
        const source = sources.find((candidate) => candidate.sql === sql);
        if (source) executionOrder.push(source.name);
        if (sql.startsWith("INSERT INTO drizzle.veele_sql_migrations")) journalOrder.push(values[0]);
      });
      assert.equal((await runTenantManagementAuthorization(queryable, "apply")).result, "applied");
      assert.deepEqual(executionOrder, [migrationNames[2]]);
      assert.deepEqual(journalOrder, [migrationNames[2]]);
      await assertCanonical(client);
      assert.deepEqual(await dataSnapshot(client), before);
    }),
  );

  await context.test("an installed immutable pair accepts the exact clean policy model and reaches the target", () =>
    withClonedDatabase(async (client) => {
      await client.query("BEGIN");
      await restoreOriginalCleanPolicies(client);
      await client.query("DELETE FROM drizzle.veele_sql_migrations WHERE name=$1", [migrationNames[2]]);
      await client.query("COMMIT");
      const before = await dataSnapshot(client);
      const diagnostic = await runTenantManagementAuthorization(client, "diagnose");
      assert.equal(diagnostic.state, "clean-state");
      assert.equal(diagnostic.repairReadiness.cleanDefinitionMatches, true);
      assert.equal(diagnostic.readyForPrerequisiteRepair, true);
      assert.equal((await runTenantManagementAuthorization(client, "apply")).result, "applied");
      await assertCanonical(client);
      assert.deepEqual(await dataSnapshot(client), before);
    }),
  );

  for (const [label, sql] of [
    ["clean pre-scope state", `DROP POLICY object_contacts_management_all ON public.object_contacts;
      DROP POLICY object_personnel_management_all ON public.object_personnel;
      DROP POLICY owner_or_staff_read_payments ON public.payments;
      DROP POLICY service_role_all_payments ON public.payments;
      DROP FUNCTION auth.role()`],
    ["missing proven legacy policy", "DROP POLICY object_contacts_management_all ON public.object_contacts"],
    ["legacy policy expression drift", "ALTER POLICY object_contacts_management_all ON public.object_contacts USING (false)"],
    ["legacy role applicability drift", "ALTER POLICY object_contacts_management_all ON public.object_contacts TO authenticated"],
    ["unexpected overlapping permissive policy", "CREATE POLICY synthetic_unexpected_overlap ON public.object_contacts FOR SELECT TO authenticated USING (true)"],
  ]) {
    await context.test(`pre-scope ${label} remains blocked without metadata or row changes`, () =>
      withClonedDatabase(async (client) => {
        await restoreLegacyPrescope(client);
        await client.query(sql);
        const before = await fullSnapshot(client);
        await assert.rejects(runTenantManagementAuthorization(client, "apply"), { message: "repair_not_ready" });
        assert.deepEqual(await fullSnapshot(client), before);
      }),
    );
  }

  await context.test("actual authenticated ACL and RLS preserve owner access in both tenants and enforce scoped contact CRUD", (authorizationContext) =>
    withClonedDatabase(async (client) => {
      const fixture = await seedContactAuthorizationActors(client);
      await restoreLegacyPrescope(client);
      const preRepairData = await dataSnapshot(client);
      assert.equal((await runTenantManagementAuthorization(client, "apply")).result, "applied");
      await assertCanonical(client);
      assert.deepEqual(await dataSnapshot(client), preRepairData);
      const afterRepair = await fullSnapshot(client);
      const visible = (user) => asAuthenticated(client, user, async () =>
        (await client.query("SELECT id::text FROM public.object_contacts WHERE id=ANY($1::uuid[]) ORDER BY id", [fixture.contacts]))
          .rows.map((row) => row.id));
      const insert = (user, object) => asAuthenticated(client, user, () => client.query(
        "INSERT INTO public.object_contacts(object_id,first_name,last_name) VALUES ($1,'Synthetic','Inserted') RETURNING id", [object],
      ));
      const update = (user, contact) => asAuthenticated(client, user, () => client.query(
        "UPDATE public.object_contacts SET first_name='Synthetic updated' WHERE id=$1", [contact],
      ));
      const remove = (user, contact) => asAuthenticated(client, user, () => client.query(
        "DELETE FROM public.object_contacts WHERE id=$1", [contact],
      ));
      const denied = async (user) => {
        assert.deepEqual(await visible(user), []);
        await assert.rejects(insert(user, fixture.objects[0]), { code: "42501" });
        assert.equal((await update(user, fixture.contacts[0])).rowCount, 0);
        assert.equal((await remove(user, fixture.contacts[0])).rowCount, 0);
      };
      await client.query("BEGIN");
      try {
        for (const [user, allowedIndexes] of [[fixture.owner, [0, 1]], [fixture.scoped, [0]]]) {
          assert.deepEqual(await visible(user), allowedIndexes.map((index) => fixture.contacts[index]).sort());
          for (const index of allowedIndexes) {
            assert.equal((await insert(user, fixture.objects[index])).rowCount, 1);
            assert.equal((await update(user, fixture.contacts[index])).rowCount, 1);
            assert.equal((await remove(user, fixture.contacts[index])).rowCount, 1);
          }
          await assert.rejects(insert(user, fixture.objects[2]), { code: "42501" });
          assert.equal((await update(user, fixture.contacts[2])).rowCount, 0);
          assert.equal((await remove(user, fixture.contacts[2])).rowCount, 0);
        }
        await assert.rejects(asAuthenticated(client, fixture.scoped, () => client.query(
          "UPDATE public.object_contacts SET object_id=$2 WHERE id=$1", [fixture.contacts[0], fixture.objects[1]],
        )), { code: "42501" });
        for (const user of [fixture.member, fixture.outsider, fixture.globalOnly, fixture.platform, null]) await denied(user);

        const permission = (await client.query("SELECT permission_id FROM public.role_permissions WHERE role_id=$1 ORDER BY permission_id LIMIT 1", [fixture.template])).rows[0].permission_id;
        const variants = [
          ["inactive membership", "UPDATE public.tenant_users SET status='disabled' WHERE tenant_id=$1 AND user_id=$2", [fixture.tenant, fixture.scoped]],
          ["inactive tenant", "UPDATE public.tenants SET is_active=false WHERE id=$1", [fixture.tenant]],
          ["suspended tenant", "UPDATE public.tenants SET status='suspended' WHERE id=$1", [fixture.tenant]],
          ["custom Management", "UPDATE public.tenant_roles SET is_custom=true WHERE id=$1", [fixture.scopedRole]],
          ["non-system Management", "UPDATE public.tenant_roles SET is_system=false WHERE id=$1", [fixture.scopedRole]],
          ["renamed Management", "UPDATE public.tenant_roles SET name='Synthetic lookalike' WHERE id=$1", [fixture.scopedRole]],
          ["missing template", "UPDATE public.tenant_roles SET template_role_id=NULL WHERE id=$1", [fixture.scopedRole]],
          ["foreign tenant role", "UPDATE public.tenant_user_roles SET tenant_role_id=$3 WHERE tenant_id=$1 AND user_id=$2", [fixture.tenant, fixture.scoped, fixture.roleB]],
          ["missing canonical permission", "DELETE FROM public.tenant_role_permissions WHERE tenant_role_id=$1 AND permission_id=$2", [fixture.scopedRole, permission]],
          ["extra permission", "INSERT INTO public.tenant_role_permissions(tenant_role_id,permission_id) VALUES ($1,$2)", [fixture.scopedRole, fixture.outsidePermission]],
        ];
        for (const [label, sql, values] of variants) {
          await authorizationContext.test(`contact CRUD denies ${label} through the real authenticated principal`, async () => {
            await client.query("SAVEPOINT policy_repair_actor_variant");
            try {
              await client.query("SET LOCAL session_replication_role=replica");
              assert.ok((await client.query(sql, values)).rowCount > 0);
              await client.query("SET LOCAL session_replication_role=origin");
              await denied(fixture.scoped);
            } finally {
              await client.query("ROLLBACK TO SAVEPOINT policy_repair_actor_variant");
              await client.query("RELEASE SAVEPOINT policy_repair_actor_variant");
            }
          });
        }
        for (const table of ["object_personnel", "payments"]) {
          for (const operation of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
            const grant = (await client.query("SELECT has_table_privilege('authenticated',$1,$2) AS granted", [`public.${table}`, operation])).rows[0].granted;
            assert.equal(grant, false, "The repair must not broaden existing authenticated table privileges");
          }
          const statements = table === "object_personnel" ? [
            "SELECT * FROM public.object_personnel",
            "INSERT INTO public.object_personnel(object_id,personnel_id) VALUES (gen_random_uuid(),gen_random_uuid())",
            "UPDATE public.object_personnel SET object_id=object_id WHERE false",
            "DELETE FROM public.object_personnel WHERE false",
          ] : [
            "SELECT * FROM public.payments",
            "INSERT INTO public.payments(amount_cents,tenant_id) VALUES (1,gen_random_uuid())",
            "UPDATE public.payments SET amount_cents=amount_cents WHERE false",
            "DELETE FROM public.payments WHERE false",
          ];
          for (const sql of statements) {
            await assert.rejects(asAuthenticated(client, fixture.owner, () => client.query(sql)), { code: "42501" });
          }
        }
      } finally {
        await client.query("ROLLBACK");
      }
      assert.deepEqual(await fullSnapshot(client), afterRepair);
    }),
  );

  await context.test("simulated hosted table ACLs expose personnel and payment RLS semantics without changing actual clean ACLs", () =>
    withClonedDatabase(async (client) => {
      const fixture = await seedContactAuthorizationActors(client);
      const probe = await seedPolicyProbeRows(client, fixture);
      await restoreLegacyPrescope(client);
      const preRepairData = await dataSnapshot(client);
      assert.equal((await runTenantManagementAuthorization(client, "apply")).result, "applied");
      assert.deepEqual(await dataSnapshot(client), preRepairData);
      await assertCanonical(client);
      const before = await fullSnapshot(client);
      const visiblePersonnel = (user) => asAuthenticated(client, user, async () =>
        (await client.query(`SELECT object_id::text,personnel_id::text FROM public.object_personnel
          WHERE object_id=ANY($1::uuid[]) ORDER BY object_id,personnel_id`, [fixture.objects])).rows);
      const visiblePayments = (user) => asAuthenticated(client, user, async () =>
        (await client.query("SELECT id::text FROM public.payments WHERE id=ANY($1::uuid[]) ORDER BY id",
          [[...probe.payments, probe.mismatchedPayment]])).rows.map((row) => row.id));
      const insertPersonnel = (user, object, person) => asAuthenticated(client, user, () => client.query(
        "INSERT INTO public.object_personnel(object_id,personnel_id) VALUES ($1,$2)", [object, person],
      ));
      const updatePersonnel = (user, object, person) => asAuthenticated(client, user, () => client.query(
        "UPDATE public.object_personnel SET linked_at=linked_at+interval '1 second' WHERE object_id=$1 AND personnel_id=$2", [object, person],
      ));
      const deletePersonnel = (user, object, person) => asAuthenticated(client, user, () => client.query(
        "DELETE FROM public.object_personnel WHERE object_id=$1 AND personnel_id=$2", [object, person],
      ));
      await client.query("BEGIN");
      try {
        // This probe deliberately models the hosted table-ACL surface solely
        // inside an always-rolled-back transaction. It proves policy semantics,
        // not that hosted ACLs or the clean install grant these privileges.
        // The preceding actual-ACL test separately proves their denial.
        await client.query("GRANT SELECT,INSERT,UPDATE,DELETE ON public.object_personnel TO authenticated");
        await client.query("GRANT SELECT ON public.payments,public.invoices TO authenticated");
        for (const [user, allowedIndexes] of [[fixture.owner, [0, 1]], [fixture.scoped, [0]]]) {
          const expectedLinks = allowedIndexes.map((index) => ({
            object_id: fixture.objects[index], personnel_id: probe.personnel[index],
          })).sort((left, right) => left.object_id.localeCompare(right.object_id));
          assert.deepEqual(await visiblePersonnel(user), expectedLinks);
          assert.deepEqual(await visiblePayments(user), allowedIndexes.map((index) => probe.payments[index]).sort());
          for (const index of allowedIndexes) {
            assert.equal((await insertPersonnel(user, fixture.objects[index], probe.sparePersonnel[index])).rowCount, 1);
            assert.equal((await updatePersonnel(user, fixture.objects[index], probe.personnel[index])).rowCount, 1);
            assert.equal((await deletePersonnel(user, fixture.objects[index], probe.personnel[index])).rowCount, 1);
          }
          await assert.rejects(insertPersonnel(user, fixture.objects[2], probe.sparePersonnel[2]), { code: "42501" });
          assert.equal((await updatePersonnel(user, fixture.objects[2], probe.personnel[2])).rowCount, 0);
          assert.equal((await deletePersonnel(user, fixture.objects[2], probe.personnel[2])).rowCount, 0);
          await assert.rejects(insertPersonnel(user, fixture.objects[0], probe.personnel[1]), { code: "42501" });
          await assert.rejects(asAuthenticated(client, user, () => client.query(`UPDATE public.object_personnel
            SET object_id=$3 WHERE object_id=$1 AND personnel_id=$2`,
          [fixture.objects[0], probe.personnel[0], fixture.objects[1]])), { code: "42501" });
          await assert.rejects(asAuthenticated(client, user, () => client.query(`UPDATE public.object_personnel
            SET personnel_id=$3 WHERE object_id=$1 AND personnel_id=$2`,
          [fixture.objects[0], probe.personnel[0], probe.personnel[1]])), { code: "42501" });
        }
        for (const user of [fixture.member, fixture.outsider, fixture.globalOnly, fixture.platform, null]) {
          assert.deepEqual(await visiblePersonnel(user), []);
          assert.deepEqual(await visiblePayments(user), []);
          await assert.rejects(insertPersonnel(user, fixture.objects[0], probe.sparePersonnel[0]), { code: "42501" });
          assert.equal((await updatePersonnel(user, fixture.objects[0], probe.personnel[0])).rowCount, 0);
          assert.equal((await deletePersonnel(user, fixture.objects[0], probe.personnel[0])).rowCount, 0);
        }
        // A real customer link makes the sent invoice visible through its own
        // existing RLS policy, allowing the preserved invoice-creator branch.
        assert.deepEqual(await visiblePayments(probe.creator), [probe.payments[0]]);
        assert.deepEqual(await visiblePersonnel(probe.creator), []);
      } finally {
        await client.query("ROLLBACK");
      }
      // Includes relation ACLs, helper ACLs, every policy and complete row hashes.
      assert.deepEqual(await fullSnapshot(client), before);
    }),
  );

  await context.test("shared advisory lock refuses a concurrent migration connection without mutation", () =>
    withClonedDatabase(async (client, connectSecond) => {
      const second = await connectSecond();
      const lockKey = "fieldgrid:database-migrations:v1";
      try {
        await second.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [lockKey]);
        const before = await fullSnapshot(client);
        await assert.rejects(runTenantManagementAuthorization(client, "apply"), { message: "lock_unavailable" });
        assert.deepEqual(await fullSnapshot(client), before);
      } finally {
        await second.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [lockKey]);
        await second.end();
      }
    }),
  );

  await context.test("already-applied verification preserves a subsequent legitimate tenant-role revocation", () =>
    withClonedDatabase(async (client) => {
      const actor = await seedPreservedManagementPair(client);
      await client.query("DELETE FROM public.tenant_user_roles WHERE tenant_id=$1 AND user_id=$2", [actor.tenant, actor.user]);
      const before = await fullSnapshot(client);
      const diagnostic = await runTenantManagementAuthorization(client, "diagnose");
      assert.equal(diagnostic.contractVerified, true);
      assert.ok(diagnostic.impact.missing_pairs > 0);
      assert.equal((await runTenantManagementAuthorization(client, "apply")).result, "already-applied");
      assert.deepEqual(await fullSnapshot(client), before);
    }),
  );

  await context.test("an incomplete immutable pair journal remains an unsupported history", () =>
    withClonedDatabase(async (client) => {
      await restoreLegacyPrescope(client);
      await client.query("INSERT INTO drizzle.veele_sql_migrations(name,hash,baselined) VALUES ($1,$2,false)",
        [sources[0].name, sources[0].hash]);
      const before = await fullSnapshot(client);
      await assert.rejects(runTenantManagementAuthorization(client, "apply"), { message: "history_invalid" });
      assert.deepEqual(await fullSnapshot(client), before);
    }),
  );

  await context.test("membership lock contention times out before catalog or journal changes", () =>
    withClonedDatabase(async (client, connectSecond) => {
      await restoreLegacyPrescope(client);
      const before = await fullSnapshot(client);
      const second = await connectSecond();
      try {
        await second.query("BEGIN");
        await second.query("LOCK TABLE public.tenant_users IN ROW EXCLUSIVE MODE");
        const queryable = observingQueryable(client, async ({ when, sql }) => {
          if (when === "after" && sql === "SET LOCAL lock_timeout = '5s'") {
            await client.query("SET LOCAL lock_timeout = '100ms'");
          }
        });
        await assert.rejects(runTenantManagementAuthorization(queryable, "apply"), { message: "history_invalid" });
        assert.deepEqual(await fullSnapshot(client), before);
      } finally {
        await second.query("ROLLBACK");
        await second.end();
      }
    }),
  );

  await context.test("held authorization barriers reject simultaneous membership and permission writes", () =>
    withClonedDatabase(async (client, connectSecond) => {
      await restoreLegacyPrescope(client);
      const before = await dataSnapshot(client);
      const second = await connectSecond();
      let verified = false;
      try {
        const queryable = observingQueryable(client, async ({ when, sql }) => {
          if (when !== "after" || !sql.startsWith("LOCK TABLE\n")) return;
          verified = true;
          for (const statement of [
            "UPDATE public.tenant_users SET status=status WHERE false",
            "UPDATE public.tenant_role_permissions SET permission_id=permission_id WHERE false",
            "UPDATE public.roles SET name=name WHERE false",
          ]) {
            await second.query("BEGIN");
            try {
              await second.query("SET LOCAL lock_timeout = '100ms'");
              await assert.rejects(second.query(statement), { code: "55P03" });
            } finally {
              await second.query("ROLLBACK");
            }
          }
        });
        assert.equal((await runTenantManagementAuthorization(queryable, "apply")).result, "applied");
        assert.equal(verified, true);
        await assertCanonical(client);
        assert.deepEqual(await dataSnapshot(client), before);
      } finally {
        await second.end();
      }
    }),
  );

  await context.test("policy-table barriers block concurrent DDL before inspecting or replacing policy definitions", () =>
    withClonedDatabase(async (client, connectSecond) => {
      await restoreLegacyPrescope(client);
      const before = await dataSnapshot(client);
      const second = await connectSecond();
      let verified = false;
      try {
        const queryable = observingQueryable(client, async ({ when, sql }) => {
          if (when !== "after" || !sql.startsWith("LOCK TABLE public.invoices IN SHARE MODE;")) return;
          verified = true;
          for (const statement of [
            "ALTER POLICY object_contacts_management_all ON public.object_contacts USING (false)",
            "ALTER POLICY object_personnel_management_all ON public.object_personnel USING (false)",
            "ALTER POLICY owner_or_staff_read_payments ON public.payments USING (false)",
          ]) {
            await second.query("BEGIN");
            try {
              await second.query("SET LOCAL lock_timeout = '100ms'");
              await assert.rejects(second.query(statement), { code: "55P03" });
            } finally {
              await second.query("ROLLBACK");
            }
          }
        });
        assert.equal((await runTenantManagementAuthorization(queryable, "apply")).result, "applied");
        assert.equal(verified, true);
        await assertCanonical(client);
        assert.deepEqual(await dataSnapshot(client), before);
      } finally {
        await second.end();
      }
    }),
  );

  await context.test("preservation reads observe a role revocation committed while apply waits for its authorization lock", () =>
    withClonedDatabase(async (client, connectSecond) => {
      const actor = await seedPreservedManagementPair(client);
      await restoreLegacyPrescope(client);
      const second = await connectSecond();
      let outcome;
      try {
        const runnerPid = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        await second.query("BEGIN");
        assert.equal((await second.query("DELETE FROM public.tenant_user_roles WHERE tenant_id=$1 AND user_id=$2",
          [actor.tenant, actor.user])).rowCount, 1);
        const expectedAfterRevocation = await fullSnapshot(second);
        let establishedSnapshot = false;
        const queryable = observingQueryable(client, async ({ when, sql }) => {
          if (when === "after" && sql === "BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED READ WRITE") {
            // The concurrent DELETE is still uncommitted. A stale transaction
            // snapshot would continue observing this grant after the SHARE wait.
            const visible = await client.query("SELECT count(*)::integer AS count FROM public.tenant_user_roles WHERE tenant_id=$1 AND user_id=$2",
              [actor.tenant, actor.user]);
            assert.equal(visible.rows[0].count, 1);
            establishedSnapshot = true;
          }
        });
        outcome = runTenantManagementAuthorization(queryable, "apply")
          .then((result) => ({ result }), (error) => ({ error }));
        let waitingForLock = false;
        for (let attempt = 0; attempt < 200; attempt++) {
          await second.query("SELECT pg_catalog.pg_stat_clear_snapshot()");
          const state = (await second.query(`SELECT wait_event_type FROM pg_catalog.pg_stat_activity WHERE pid=$1`, [runnerPid])).rows[0];
          if (state?.wait_event_type === "Lock") {
            waitingForLock = true;
            break;
          }
          await delay(10);
        }
        assert.equal(establishedSnapshot, true);
        assert.equal(waitingForLock, true, "The runner must actually wait behind the concurrent authorization write");
        await second.query("COMMIT");
        const completed = await outcome;
        assert.equal(completed.error?.message, "access_preservation_failed");
        assert.deepEqual(await fullSnapshot(client), expectedAfterRevocation);
      } finally {
        await second.query("ROLLBACK");
        await outcome;
        await second.end();
      }
    }),
  );

  for (const [label, sql, values, errorCode] of [
    ["missing predecessor", "DELETE FROM drizzle.veele_sql_migrations WHERE name=(SELECT name FROM drizzle.veele_sql_migrations WHERE name < $1 ORDER BY name DESC LIMIT 1)", [migrationNames[0]], "history_invalid"],
    ["wrong predecessor hash", "UPDATE drizzle.veele_sql_migrations SET hash=$2 WHERE name=(SELECT name FROM drizzle.veele_sql_migrations WHERE name < $1 ORDER BY name DESC LIMIT 1)", [migrationNames[0], "0".repeat(64)], "history_invalid"],
    ["wrong repair hash", "UPDATE drizzle.veele_sql_migrations SET hash=$2 WHERE name=$1", [migrationNames[2], "0".repeat(64)], "history_invalid"],
    ["baselined repair", "UPDATE drizzle.veele_sql_migrations SET baselined=true WHERE name=$1", [migrationNames[2]], "history_invalid"],
    ["private helper ACL drift", "GRANT EXECUTE ON FUNCTION app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid) TO authenticated", [], "catalog_invalid"],
    ["public helper ACL drift", "GRANT EXECUTE ON FUNCTION public.is_management_for_tenant(uuid) TO anon", [], "catalog_invalid"],
    ["private helper security-mode drift", "ALTER FUNCTION app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid) SECURITY DEFINER", [], "catalog_invalid"],
    ["public helper search-path drift", "ALTER FUNCTION public.is_management_for_tenant(uuid) SET search_path=public", [], "catalog_invalid"],
    ["canonical contact policy drift", "ALTER POLICY object_contacts_management ON public.object_contacts USING (false)", [], "catalog_invalid"],
    ["canonical personnel policy drift", "ALTER POLICY object_personnel_management ON public.object_personnel WITH CHECK (false)", [], "catalog_invalid"],
    ["canonical payment policy role drift", "ALTER POLICY owner_or_staff_read_payments ON public.payments TO PUBLIC", [], "catalog_invalid"],
    ["forbidden material usage policy", "CREATE POLICY assignment_material_usage_backoffice_all ON public.assignment_material_usage FOR SELECT TO authenticated USING (false)", [], "catalog_invalid"],
    ["unrelated unknown journal entry", "INSERT INTO drizzle.veele_sql_migrations(name,hash,baselined) VALUES ('29990101000000_synthetic_unrelated.sql',$1,false)", ["0".repeat(64)], "history_invalid"],
  ]) {
    await context.test(`canonical runner fails closed for ${label} without mutation`, () =>
      withClonedDatabase(async (client) => {
        await client.query(sql, values);
        const before = await fullSnapshot(client);
        await assert.rejects(runTenantManagementAuthorization(client, "apply"), { message: errorCode });
        assert.deepEqual(await fullSnapshot(client), before);
      }),
    );
  }

  const rollbackPoints = [
    ...[sources[2], sources[0], sources[1]].map((source) => ({
      label: `after ${source.name}`,
      matches: ({ when, sql }) => when === "after" && sql === source.sql,
      errorCode: source.name === migrationNames[1] ? "scope_failed" : "repair_failed",
    })),
    {
      label: "before first journal write",
      matches: ({ when, sql }) => when === "before" && sql.startsWith("INSERT INTO drizzle.veele_sql_migrations"),
      errorCode: "history_write_failed",
    },
    ...migrationNames.map((name, index) => ({
      label: `after journal write ${index + 1}`,
      matches: ({ when, sql, values }) => when === "after" &&
        sql.startsWith("INSERT INTO drizzle.veele_sql_migrations") && values?.[0] === name,
      errorCode: "history_write_failed",
    })),
    {
      label: "before COMMIT",
      matches: ({ when, sql }) => when === "before" && sql === "COMMIT",
      errorCode: "commit_uncertain",
    },
  ];
  for (const point of rollbackPoints) {
    await context.test(`real transaction fully rolls back injected failure ${point.label}`, () =>
      withClonedDatabase(async (client) => {
        await restoreLegacyPrescope(client);
        const before = await fullSnapshot(client);
        let injected = 0;
        const queryable = observingQueryable(client, (event) => {
          if (point.matches(event)) {
            injected++;
            throw new Error("synthetic_driver_detail_must_not_escape");
          }
        });
        await assert.rejects(runTenantManagementAuthorization(queryable, "apply"), (error) => {
          assert.doesNotMatch(error.message, /synthetic_driver_detail/u);
          assert.equal(error.message, point.errorCode);
          return true;
        });
        assert.equal(injected, 1, "A failed migration phase must never be retried blindly");
        assert.deepEqual(await fullSnapshot(client), before);
      }),
    );
  }

  await context.test("lost acknowledgement after real COMMIT requires diagnosis and never repeats the transaction", () =>
    withClonedDatabase(async (client, connectSecond) => {
      await restoreLegacyPrescope(client);
      const before = await dataSnapshot(client);
      let commits = 0;
      const queryable = observingQueryable(client, ({ when, sql }) => {
        if (when === "after" && sql === "COMMIT") {
          commits++;
          throw new Error("synthetic_lost_commit_acknowledgement");
        }
      });
      await assert.rejects(runTenantManagementAuthorization(queryable, "apply"), { message: "commit_uncertain" });
      assert.equal(commits, 1);
      const fresh = await connectSecond();
      try {
        await assertCanonical(fresh);
        assert.deepEqual(await dataSnapshot(fresh), before);
        assert.equal((await runTenantManagementAuthorization(fresh, "apply")).result, "already-applied");
      } finally {
        await fresh.end();
      }
    }),
  );
}
