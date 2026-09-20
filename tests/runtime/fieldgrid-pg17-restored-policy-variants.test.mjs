import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { withClonedDatabase, restoreLegacyPrescope, fullSnapshot } from "./fieldgrid-tenant-management-policy-repair.test.mjs";

const require = createRequire(new URL("../../lib/db/package.json", import.meta.url));
const { Client } = require("pg");
const { tsImport } = require("tsx/esm/api");
const { readTenantManagementPolicyRepairReadiness, tenantManagementPolicyRepairContractSql } =
  await tsImport("../../scripts/fieldgrid-tenant-management-policy-repair-contract.mts", import.meta.url);
const { runHostedPolicyCompatibility } = await tsImport("../../scripts/fieldgrid-hosted-policy-compatibility.mts", import.meta.url);
const { HOSTED_POLICY_SUPERSEDED } = await tsImport("../../lib/db/src/hosted-policy-compatibility-identity.ts", import.meta.url);

// Credentials remain in the child environment. Never include tool stderr or
// driver connection details in an assertion/error; fixtures contain auth data.
function command(binary, args, env, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(binary, args, { env, encoding: "buffer", maxBuffer: 32 * 1024 * 1024, timeout: 120_000 },
      (error, stdout) => error ? reject(new Error("pg17_restore_fixture_command_failed")) : resolve(stdout));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

function postgresCommand(binary, args, env, input) {
  assert.ok(["pg_dump", "pg_restore"].includes(binary));
  const container = process.env.FIELDGRID_PG17_TOOLS_CONTAINER;
  if (!container) return command(binary, args, env, input);
  assert.match(container, /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u);
  // GitHub's postgres:17 service supplies exactly matching tools. Only variable
  // names cross argv; the private archive uses stdout/stdin, never host paths.
  return command("docker", ["exec", "-i", "--env", "PGUSER", "--env", "PGPASSWORD",
    "--env", "PGSSLMODE", "--env", "PGHOST=127.0.0.1", "--env", "PGPORT=5432",
    container, binary, ...args], env, input);
}

async function provider(client) {
  await client.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='dashboard_user') THEN CREATE ROLE dashboard_user NOLOGIN; END IF;
  END $$`);
  await client.query(readFileSync(new URL("../fixtures/fieldgrid-supabase-auth-functions.sql", import.meta.url), "utf8")
    .replaceAll('{{ index .Options "Namespace" }}', "auth"));
  await client.query(`ALTER TABLE auth.users OWNER TO supabase_auth_admin;
    ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;
    ALTER FUNCTION auth.role() OWNER TO supabase_auth_admin;
    REVOKE ALL ON FUNCTION auth.uid(),auth.role() FROM postgres,anon,authenticated,service_role;
    GRANT EXECUTE ON FUNCTION auth.uid(),auth.role() TO PUBLIC,dashboard_user`);
}

async function migrate(address) {
  return (await command(process.execPath, ["--import", require.resolve("tsx"),
    fileURLToPath(new URL("../../lib/db/src/migrate.ts", import.meta.url)), "migrate"], {
    ...process.env, DATABASE_URL: address.href, FIELDGRID_MIGRATION_DATABASE_URL: address.href,
    DB_SSL: "false", PGSSLMODE: "disable", APP_ENV: "development", TARGET_ENVIRONMENT: "development",
    FIELDGRID_DATABASE_CONNECTION_PURPOSE: "migration",
  })).toString("utf8");
}

async function readOnlyContract(client) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const readiness = await readTenantManagementPolicyRepairReadiness(client);
    const contract = (await client.query(`SELECT ${tenantManagementPolicyRepairContractSql()} AS valid`)).rows[0].valid;
    return { readiness, contract };
  } finally { await client.query("ROLLBACK"); }
}

async function retainedSnapshot(client) {
  // Restore triggers autovacuum/analyze. Physical pg_class statistics can
  // change independently; pin security metadata, definitions, journal and data.
  const catalog = (await client.query(`SELECT
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p) AS policies,
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('public','auth','app_private','storage')) AS functions,
    (SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'namespace',c.relnamespace,'name',c.relname,
      'owner',c.relowner,'acl',c.relacl,'kind',c.relkind,'rls',c.relrowsecurity,
      'forced',c.relforcerowsecurity,'options',c.reloptions) ORDER BY c.oid)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','auth','app_private','storage')) AS relations,
    (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a
      JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','auth','app_private','storage')) AS columns,
    (SELECT jsonb_agg(to_jsonb(j) ORDER BY j.name) FROM drizzle.veele_sql_migrations j) AS journal`)).rows;
  return createHash("sha256").update(JSON.stringify({ catalog, data: (await fullSnapshot(client)).data })).digest("hex");
}

export async function verifyPg17RestoredPolicyVariants(context) {
  for (const target of ["clean", "upgrade"]) {
    await context.test(`completed hosted ${target} target survives both PG17 owner restore modes`, () =>
      withClonedDatabase(async (source) => {
        assert.equal(Math.trunc(Number((await source.query("SHOW server_version_num")).rows[0].server_version_num) / 10000), 17);
        if (target === "upgrade") await restoreLegacyPrescope(source);
        await provider(source);
        if (target === "upgrade") assert.equal((await runHostedPolicyCompatibility(source, "apply")).changed, true);
        else await source.query("UPDATE drizzle.veele_sql_migrations SET baselined=true WHERE name=$1", [HOSTED_POLICY_SUPERSEDED.name]);
        const address = new URL(process.env.DATABASE_URL);
        address.pathname = `/${source.database}`;
        await migrate(address);
        const originalExpression = (await source.query(`SELECT pg_get_expr(polqual,polrelid) AS expression FROM pg_policy
          WHERE polrelid='public.invoices'::regclass AND polname='invoices_customer_sent_select'`)).rows[0].expression;
        assert.match(originalExpression, /\(ARRAY\['sent'::character varying/u);
        const childEnv = { ...process.env, PGHOST: address.hostname, PGPORT: address.port,
          PGUSER: decodeURIComponent(address.username), PGPASSWORD: decodeURIComponent(address.password), PGSSLMODE: "disable" };
        for (const binary of ["pg_dump", "pg_restore"]) {
          assert.match((await postgresCommand(binary, ["--version"], childEnv)).toString("utf8"), /\(PostgreSQL\) 17\./u);
        }
        const archive = await postgresCommand("pg_dump", ["--format=custom", "--dbname", source.database], childEnv);
        for (const noOwner of [false, true]) {
          const database = `fg_restore_${randomUUID().replaceAll("-", "")}`;
          await source.query(`CREATE DATABASE "${database}"`);
          let restored;
          try {
            await postgresCommand("pg_restore", ["--exit-on-error", ...(noOwner ? ["--no-owner"] : []), "--dbname", database], childEnv, archive);
            const restoredAddress = new URL(address);
            restoredAddress.pathname = `/${database}`;
            restored = new Client({ connectionString: restoredAddress.href, ssl: false });
            await restored.connect();
            const expression = (await restored.query(`SELECT pg_get_expr(polqual,polrelid) AS expression FROM pg_policy
              WHERE polrelid='public.invoices'::regclass AND polname='invoices_customer_sent_select'`)).rows[0].expression;
            assert.notEqual(expression, originalExpression);
            assert.match(expression, /ARRAY\[\('sent'::character varying\)::text/u);
            assert.equal((await restored.query("SELECT pg_get_userbyid(proowner) AS owner FROM pg_proc WHERE oid='auth.uid()'::regprocedure")).rows[0].owner,
              noOwner ? decodeURIComponent(address.username) : "supabase_auth_admin");
            const before = await retainedSnapshot(restored);
            const result = await readOnlyContract(restored);
            assert.equal(result.readiness.targetDefinitionMatches, true);
            assert.equal(result.readiness.dependenciesValid, true);
            assert.equal(result.contract, true);
            assert.equal(await retainedSnapshot(restored), before);
            // A baselined repair is verified before subsequent migrations;
            // repeated ordinary CLI calls must accept the restored full target.
            await migrate(restoredAddress);
            await migrate(restoredAddress);
            assert.equal(await retainedSnapshot(restored), before);
            await restored.query("ALTER POLICY invoices_customer_sent_select ON public.invoices USING (true)");
            const drift = await retainedSnapshot(restored);
            const rejected = await readOnlyContract(restored);
            assert.equal(rejected.readiness.targetDefinitionMatches, false);
            assert.equal(rejected.contract, false);
            await assert.rejects(migrate(restoredAddress), /pg17_restore_fixture_command_failed/u);
            assert.equal(await retainedSnapshot(restored), drift);
          } finally {
            await restored?.end();
            await source.query(`DROP DATABASE "${database}" WITH (FORCE)`);
          }
        }
      }));
  }
}
