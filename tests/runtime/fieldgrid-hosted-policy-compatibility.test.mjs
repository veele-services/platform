import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withClonedDatabase, restoreLegacyPrescope, restoreOriginalCleanPolicies,
  seedPreservedManagementPair, fullSnapshot } from "./fieldgrid-tenant-management-policy-repair.test.mjs";
const require = createRequire(new URL("../../lib/db/package.json", import.meta.url));
const { tsImport } = require("tsx/esm/api");
const { runHostedPolicyCompatibility, loadHostedPolicyPersonnelClosureSource, loadHostedCleanHelperClosureSource } = await tsImport("../../scripts/fieldgrid-hosted-policy-compatibility.mts", import.meta.url);
const { HOSTED_POLICY_CLEAN_HELPER_CLOSURE, HOSTED_POLICY_PERSONNEL_CLOSURE, HOSTED_POLICY_REPLACEMENT, HOSTED_POLICY_SUPERSEDED } = await tsImport("../../lib/db/src/hosted-policy-compatibility-identity.ts", import.meta.url);
const { loadTenantManagementPolicyDriftDiagnosticSource } = await tsImport("../../scripts/fieldgrid-tenant-management-policy-drift-diagnostic.mts", import.meta.url);
const { assertMatchingMigrationHistory } = await import("../../scripts/fieldgrid-phase2e-staging-preflight.mjs");
const { loadPlatformPrivilegeMigrationFrontier } = await tsImport("../../scripts/fieldgrid-staging-field-demo-owner-binding-repair.mts", import.meta.url);

async function hostedProvider(client) {
  await client.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='dashboard_user') THEN CREATE ROLE dashboard_user NOLOGIN; END IF;
  END $$`);
  const sql = readFileSync(new URL("../fixtures/fieldgrid-supabase-auth-functions.sql", import.meta.url), "utf8")
    .replaceAll('{{ index .Options "Namespace" }}', "auth");
  await client.query(sql);
  await client.query(`ALTER TABLE auth.users OWNER TO supabase_auth_admin;
    ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;
    ALTER FUNCTION auth.role() OWNER TO supabase_auth_admin;
    REVOKE ALL ON FUNCTION auth.uid(),auth.role() FROM postgres,anon,authenticated,service_role;
    GRANT EXECUTE ON FUNCTION auth.uid(),auth.role() TO PUBLIC,dashboard_user`);
}
async function authSnapshot(client) {
  return (await client.query(`SELECT p.oid,p.proowner,p.prosrc,p.proacl FROM pg_proc p
    WHERE p.oid IN ('auth.uid()'::regprocedure,'auth.role()'::regprocedure) ORDER BY p.oid`)).rows;
}
async function preservedPersonnelPrivileges(client) {
  return (await client.query(`SELECT c.relowner, c.relrowsecurity, c.relforcerowsecurity,
    has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
    has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
    has_table_privilege('fieldgrid_runtime_app',c.oid,'SELECT') AS runtime_select,
    has_table_privilege('fieldgrid_runtime_app',c.oid,'UPDATE') AS runtime_update,
    (SELECT jsonb_agg(to_jsonb(acl) ORDER BY acl.grantor,acl.grantee,acl.privilege_type)
      FROM aclexplode(c.relacl) acl WHERE NOT (acl.privilege_type='UPDATE'
        AND acl.grantee IN ('anon'::regrole::oid,'authenticated'::regrole::oid))) AS retained_table_acl,
    (SELECT jsonb_agg(jsonb_build_object('column',a.attnum,'acl',to_jsonb(acl))
        ORDER BY a.attnum,acl.grantor,acl.grantee,acl.privilege_type)
      FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) acl WHERE a.attrelid=c.oid
        AND NOT (acl.privilege_type='UPDATE' AND acl.grantee IN ('anon'::regrole::oid,'authenticated'::regrole::oid))) AS retained_column_acl,
    (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member,m.grantor) FROM pg_auth_members m) AS memberships,
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r
      WHERE rolname IN ('anon','authenticated','fieldgrid_runtime_app','fieldgrid_runtime_data')) AS roles
    FROM pg_class c WHERE c.oid='public.personnel'::regclass`)).rows;
}
async function stagingFixture(client) {
  await restoreLegacyPrescope(client);
  await seedPreservedManagementPair(client);
  await hostedProvider(client);
  const own = JSON.parse(loadTenantManagementPolicyDriftDiagnosticSource().values[1]);
  await client.query(`CREATE POLICY personnel_update_own_phone ON public.personnel FOR UPDATE TO authenticated
    USING (${own.usingExpression}) WITH CHECK (${own.checkExpression})`);
  await client.query("GRANT SELECT, UPDATE ON public.personnel TO anon,authenticated");
  await client.query("GRANT SELECT(phone), UPDATE(phone) ON public.personnel TO anon,authenticated");
  await client.query("GRANT EXECUTE ON FUNCTION public.customer_has_access(uuid,uuid) TO anon,service_role");
}
async function cleanProviderDefaultsFixture(client) {
  await restoreOriginalCleanPolicies(client);
  await client.query("DELETE FROM drizzle.veele_sql_migrations WHERE name=ANY($1::text[])",
    [[HOSTED_POLICY_REPLACEMENT.name, HOSTED_POLICY_SUPERSEDED.name, HOSTED_POLICY_PERSONNEL_CLOSURE.name,
      HOSTED_POLICY_CLEAN_HELPER_CLOSURE.name]]);
  await hostedProvider(client);
  // Reproduce the documented provider public-function default ACL on the exact
  // existing helper. All other catalog contracts retain their fresh-clean shape.
  await client.query("GRANT EXECUTE ON FUNCTION public.customer_has_access(uuid,uuid) TO anon,service_role");
}
async function verifyResult(client) {
  const records = (await client.query("SELECT name,hash,baselined,applied_at FROM drizzle.veele_sql_migrations ORDER BY applied_at,name")).rows;
  assert.equal(records.find((r) => r.name === HOSTED_POLICY_REPLACEMENT.name)?.baselined, false);
  assert.equal(records.find((r) => r.name === HOSTED_POLICY_PERSONNEL_CLOSURE.name)?.baselined, false);
  assert.equal(records.find((r) => r.name === HOSTED_POLICY_CLEAN_HELPER_CLOSURE.name)?.baselined, false);
  assert.equal(records.find((r) => r.name === HOSTED_POLICY_SUPERSEDED.name)?.baselined, true);
  assertMatchingMigrationHistory(records.map(({ applied_at, ...record }) => ({ ...record, appliedAt: applied_at.toISOString() })),
    (await loadPlatformPrivilegeMigrationFrontier()).committed.map((m) => m.name));
  const historyBefore = JSON.stringify(records);
  assert.equal((await runHostedPolicyCompatibility(client, "apply")).changed, false);
  assert.equal(JSON.stringify((await client.query("SELECT name,hash,baselined,applied_at FROM drizzle.veele_sql_migrations ORDER BY applied_at,name")).rows), historyBefore);
}
async function runMigrationCommand(client, root = fileURLToPath(new URL("../../", import.meta.url))) {
  const address = new URL(process.env.DATABASE_URL);
  address.pathname = `/${client.database}`;
  return promisify(execFile)(process.execPath,
    ["--import", require.resolve("tsx"), "src/migrate.ts", "migrate"], {
      cwd: join(root, "lib/db"),
      env: { ...process.env, DATABASE_URL: address.href, DB_SSL: "false", PGSSLMODE: "disable" },
      maxBuffer: 2_000_000,
    });
}
export async function verifyHostedPolicyCompatibility(context) {
  await context.test("exact hosted staging drift migrates atomically and leaves provider helpers unchanged", () =>
    withClonedDatabase(async (client) => {
      await stagingFixture(client);
      const auth = await authSnapshot(client);
      const data = (await fullSnapshot(client)).data;
      const preserved = await preservedPersonnelPrivileges(client);
      const diagnosis = await runHostedPolicyCompatibility(client, "diagnose");
      assert.equal(diagnosis.ready, true);
      assert.equal(diagnosis.personnelClosureRepairable, true);
      assert.equal(diagnosis.personnelPath.closed, false);
      assert.equal((await runHostedPolicyCompatibility(client, "apply")).changed, true);
      assert.deepEqual(await authSnapshot(client), auth);
      assert.deepEqual((await fullSnapshot(client)).data, data);
      assert.deepEqual(await preservedPersonnelPrivileges(client), preserved);
      const closed = (await runHostedPolicyCompatibility(client, "diagnose")).personnelPath;
      assert.equal(closed.anonTableUpdate, false);
      assert.equal(closed.anonColumnUpdate, false);
      assert.equal(closed.authenticatedTableUpdate, false);
      assert.equal(closed.authenticatedColumnUpdate, false);
      await verifyResult(client);
    }));
  await context.test("clean hosted provider install supersedes only the incompatible historical repair", () =>
    withClonedDatabase(async (client) => {
      await restoreOriginalCleanPolicies(client);
      await client.query("DELETE FROM drizzle.veele_sql_migrations WHERE name=ANY($1::text[])",
        [[HOSTED_POLICY_REPLACEMENT.name, HOSTED_POLICY_SUPERSEDED.name, HOSTED_POLICY_PERSONNEL_CLOSURE.name, HOSTED_POLICY_CLEAN_HELPER_CLOSURE.name]]);
      await hostedProvider(client);
      const auth = await authSnapshot(client);
      assert.match((await runMigrationCommand(client)).stdout, /SQL exact hosted-policy compatibility applied/u);
      assert.deepEqual(await authSnapshot(client), auth);
      await verifyResult(client);
    }));
  await context.test("empty application schema with exact hosted provider defaults completes ordinary installation", () =>
    withClonedDatabase(async (client) => {
      await hostedProvider(client);
      await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_admin')
        THEN CREATE ROLE supabase_admin NOLOGIN; END IF; END $$`);
      await client.query(`DROP SCHEMA IF EXISTS app_private, public, drizzle CASCADE;
        CREATE SCHEMA public AUTHORIZATION postgres; GRANT USAGE ON SCHEMA public TO PUBLIC;
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC`);
      for (const owner of ["postgres", "supabase_admin"]) {
        for (const kind of ["TABLES", "SEQUENCES", "FUNCTIONS"]) {
          await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public
            GRANT ALL ON ${kind} TO postgres,anon,authenticated,service_role`);
        }
      }
      assert.deepEqual((await client.query(`SELECT count(*) FILTER(WHERE defaclnamespace='public'::regnamespace)::int AS scoped,
        count(*) FILTER(WHERE defaclnamespace=0)::int AS global FROM pg_default_acl`)).rows[0], { scoped: 6, global: 0 });
      const auth = await authSnapshot(client);
      assert.match((await runMigrationCommand(client)).stdout, /SQL exact hosted-policy compatibility applied/u);
      assert.deepEqual(await authSnapshot(client), auth);
      await verifyResult(client);
    }));
  await context.test("fresh clean provider helper default grants close through ordinary migration command", () =>
    withClonedDatabase(async (client) => {
      await cleanProviderDefaultsFixture(client);
      const auth = await authSnapshot(client);
      const before = await runHostedPolicyCompatibility(client, "diagnose");
      assert.equal(before.ready, true);
      assert.equal(before.cleanHelperClosureRepairable, true);
      assert.equal(before.state.dependenciesValid, false);
      assert.match((await runMigrationCommand(client)).stdout, /SQL exact hosted-policy compatibility applied/u);
      assert.deepEqual(await authSnapshot(client), auth);
      const acl = (await client.query(`SELECT has_function_privilege('anon','public.customer_has_access(uuid,uuid)','EXECUTE') AS anon,
        has_function_privilege('service_role','public.customer_has_access(uuid,uuid)','EXECUTE') AS service_role,
        has_function_privilege('authenticated','public.customer_has_access(uuid,uuid)','EXECUTE') AS authenticated`)).rows[0];
      assert.deepEqual(acl, { anon: false, service_role: false, authenticated: true });
      await verifyResult(client);
    }));
  await context.test("unknown clean helper PUBLIC grant remains blocked without journal or ACL changes", () =>
    withClonedDatabase(async (client) => {
      await cleanProviderDefaultsFixture(client);
      await client.query("GRANT EXECUTE ON FUNCTION public.customer_has_access(uuid,uuid) TO PUBLIC");
      const before = await fullSnapshot(client);
      assert.equal((await runHostedPolicyCompatibility(client, "diagnose")).ready, false);
      await assert.rejects(runMigrationCommand(client));
      assert.deepEqual(await fullSnapshot(client), before);
      await assert.rejects(client.query(loadHostedCleanHelperClosureSource().sql),
        /hosted_policy_clean_helper_precondition_failed/u);
      await client.query("ROLLBACK");
      assert.deepEqual(await fullSnapshot(client), before);
    }));
  await context.test("final clean helper journal failure rolls back the new revokes and all repair changes", () =>
    withClonedDatabase(async (client) => {
      await cleanProviderDefaultsFixture(client);
      const before = await fullSnapshot(client);
      const queryable = { query(sql, values) {
        if (sql.startsWith("INSERT INTO drizzle.veele_sql_migrations") && values?.[0] === HOSTED_POLICY_CLEAN_HELPER_CLOSURE.name) {
          throw new Error("synthetic clean helper journal failure");
        }
        return client.query(sql, values);
      } };
      await assert.rejects(runHostedPolicyCompatibility(queryable, "apply"), /synthetic clean helper journal failure/u);
      assert.deepEqual(await fullSnapshot(client), before);
    }));
  await context.test("ordinary migration command repairs a restored staging prefix and replays idempotently", () =>
    withClonedDatabase(async (client) => {
      await stagingFixture(client);
      const { stdout } = await runMigrationCommand(client);
      assert.match(stdout, /SQL exact hosted-policy compatibility applied/u);
      await verifyResult(client);
    }));
  await context.test("ordinary migration command stops before prerequisite commits when personnel closure is unsafe", () =>
    withClonedDatabase(async (client) => {
      await stagingFixture(client);
      await client.query("REVOKE UPDATE ON public.personnel FROM anon,authenticated");
      await client.query("GRANT UPDATE(phone) ON public.personnel TO PUBLIC");
      const before = await fullSnapshot(client);
      const diagnosis = await runHostedPolicyCompatibility(client, "diagnose");
      assert.equal(diagnosis.ready, false);
      assert.equal(diagnosis.personnelPath.authenticatedTableUpdate, false);
      assert.equal(diagnosis.personnelPath.authenticatedColumnUpdate, true);
      assert.equal(diagnosis.personnelClosureRepairable, false);
      await assert.rejects(runMigrationCommand(client), /hosted_policy_personnel_path_not_closed/u);
      assert.deepEqual(await fullSnapshot(client), before);
    }));
  await context.test("completed hosted baseline permits later forward migrations and exact replay", () =>
    withClonedDatabase(async (client) => {
      await stagingFixture(client);
      await runHostedPolicyCompatibility(client, "apply");
      const fixtureRoot = await mkdtemp(join(tmpdir(), "fieldgrid-hosted-forward-"));
      const repo = fileURLToPath(new URL("../../", import.meta.url));
      try {
        for (const path of ["scripts", "lib/db/src", "lib/db/migrations", "tests/fixtures", "migrations"])
          await cp(join(repo, path), join(fixtureRoot, path), { recursive: true });
        await cp(join(repo, "package.json"), join(fixtureRoot, "package.json"));
        await cp(join(repo, "lib/db/package.json"), join(fixtureRoot, "lib/db/package.json"));
        await symlink(join(repo, "lib/db/node_modules"), join(fixtureRoot, "lib/db/node_modules"));
        await symlink(join(repo, "node_modules"), join(fixtureRoot, "node_modules"));
        const futureName = "20260921131458_hosted_policy_future_fixture.sql";
        await writeFile(join(fixtureRoot, "lib/db/migrations", futureName), "BEGIN;\nSELECT 1;\nCOMMIT;\n");
        const first = await runMigrationCommand(client, fixtureRoot);
        assert.ok(first.stdout.includes(`SQL applying: ${futureName}`));
        assert.equal((await client.query("SELECT baselined FROM drizzle.veele_sql_migrations WHERE name=$1", [futureName])).rows[0]?.baselined, false);
        const second = await runMigrationCommand(client, fixtureRoot);
        assert.ok(second.stdout.includes(`SQL skipped: ${futureName}`));
      } finally { await rm(fixtureRoot, { recursive: true, force: true }); }
    }));
  await context.test("inherited browser UPDATE remains blocked and roles/memberships are untouched", () =>
    withClonedDatabase(async (client) => {
      await stagingFixture(client);
      const parentRole = `personnel_closure_${randomUUID().replaceAll("-", "")}`;
      await client.query(`CREATE ROLE "${parentRole}" NOLOGIN`);
      try {
        await client.query(`GRANT "${parentRole}" TO authenticated WITH INHERIT TRUE, SET FALSE`);
        await client.query(`GRANT UPDATE ON public.personnel TO "${parentRole}"`);
        const before = await fullSnapshot(client);
        const roles = await preservedPersonnelPrivileges(client);
        await assert.rejects(runMigrationCommand(client), /hosted_policy_personnel_path_not_closed/u);
        assert.deepEqual(await fullSnapshot(client), before);
        assert.deepEqual(await preservedPersonnelPrivileges(client), roles);
      } finally {
        await client.query(`REVOKE "${parentRole}" FROM authenticated`);
        await client.query(`REVOKE UPDATE ON public.personnel FROM "${parentRole}"`);
        await client.query(`DROP ROLE "${parentRole}"`);
      }
    }));
  await context.test("standalone closure rejects an unknown policy and leaves its ACL intact", () =>
    withClonedDatabase(async (client) => {
      await stagingFixture(client);
      await client.query("ALTER POLICY personnel_update_own_phone ON public.personnel USING (true)");
      const before = await fullSnapshot(client);
      await assert.rejects(client.query(loadHostedPolicyPersonnelClosureSource().sql),
        /hosted_policy_personnel_closure_precondition_failed/u);
      await client.query("ROLLBACK");
      assert.deepEqual(await fullSnapshot(client), before);
    }));
  await context.test("unknown permissive policy and unexpected helper execute grants remain blocked", () =>
    withClonedDatabase(async (client) => {
      await stagingFixture(client);
      await client.query("CREATE POLICY unexpected_access ON public.personnel FOR SELECT TO authenticated USING(true)");
      const before = await fullSnapshot(client);
      assert.equal((await runHostedPolicyCompatibility(client, "apply")).changed, false);
      assert.deepEqual(await fullSnapshot(client), before);
      await client.query("DROP POLICY unexpected_access ON public.personnel");
      await client.query("GRANT EXECUTE ON FUNCTION public.customer_has_access(uuid,uuid) TO PUBLIC");
      const helperDrift = await fullSnapshot(client);
      assert.equal((await runHostedPolicyCompatibility(client, "apply")).changed, false);
      assert.deepEqual(await fullSnapshot(client), helperDrift);
    }));
  await context.test("late journal failure rolls back policy changes and records no compatibility baseline", () =>
    withClonedDatabase(async (client) => {
      await stagingFixture(client);
      const before = await fullSnapshot(client);
      const queryable = { query(sql, values) {
        if (sql.startsWith("INSERT INTO drizzle.veele_sql_migrations") && values?.[0] === HOSTED_POLICY_CLEAN_HELPER_CLOSURE.name) {
          throw new Error("synthetic history failure");
        }
        return client.query(sql, values);
      } };
      await assert.rejects(runHostedPolicyCompatibility(queryable, "apply"), /synthetic history failure/u);
      assert.deepEqual(await fullSnapshot(client), before);
    }));
}
