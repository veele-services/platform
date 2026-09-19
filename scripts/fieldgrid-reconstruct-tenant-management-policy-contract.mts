#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  compilePolicyDefinitionContract, readPolicyDefinitionContract,
  type PolicyDefinitionManifest, type PolicyDefinitionQueryable,
} from "./fieldgrid-tenant-management-policy-definition-contract.mts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = "tests/fixtures/fieldgrid-tenant-management-policy-manifests.json";
const localDatabase = "postgresql://postgres:postgres@127.0.0.1:55436/fieldgrid_runtime_safety";
const providerPath = "tests/fixtures/fieldgrid-supabase-auth-functions.sql";
const shimPath = "scripts/fieldgrid-runtime-safety-setup.mjs";
const phase2Path = "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql";
const boundaryPath = "lib/db/migrations/051_final_security_boundaries.sql";
const personnelPath = "lib/db/migrations/20260714120000_assignment_personnel_phase_b_direct_access_close.sql";
const runtimePath = "lib/db/migrations/20260909120000_runtime_least_privilege_principals.sql";
const sprintPath = "lib/db/migrations/002_sprint1_rls.sql";
const historicalObjectsPath = "migrations/023_objects_extended.sql";
const historicalPaymentsPath = "migrations/013_sprint5_payments.sql";
const sourcePaths = [historicalPaymentsPath, historicalObjectsPath, sprintPath,
  "lib/db/migrations/025_platform_schema_extensions.sql",
  "lib/db/migrations/037_tenant_customer_users_events_hardening.sql", boundaryPath,
  "lib/db/migrations/062_finance_reports_tenant_scope.sql",
  "lib/db/migrations/063_payments_batches_audit_tenant_scope.sql",
  "lib/db/migrations/20260710200000_invoice_canon_credit_collection_payments.sql",
  personnelPath, phase2Path, runtimePath, shimPath, providerPath].sort();
const effectiveRoles = ["$owner", "PUBLIC", "anon", "authenticated", "service_role", "fieldgrid_runtime_data", "fieldgrid_runtime_app"];
const targetTables = ["object_contacts", "object_personnel", "payments"];
const tableNames = ["invoices", "object_contacts", "object_personnel", "objects", "payments", "personnel"];
type State = "clean" | "legacy" | "targetClean" | "targetUpgrade";
type Helper = PolicyDefinitionManifest["helpers"][number];
type Client = PolicyDefinitionQueryable & { connect(): Promise<void>; end(): Promise<void> };
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

export const targetDDL = `DROP POLICY IF EXISTS object_contacts_management_all ON public.object_contacts;
DROP POLICY IF EXISTS object_personnel_management_all ON public.object_personnel;
DROP POLICY IF EXISTS object_personnel_management ON public.object_personnel;
CREATE POLICY object_personnel_management ON public.object_personnel
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.objects o JOIN public.personnel p ON p.id = object_personnel.personnel_id AND p.tenant_id = o.tenant_id WHERE o.id = object_personnel.object_id AND public.is_management_for_tenant(o.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.objects o JOIN public.personnel p ON p.id = object_personnel.personnel_id AND p.tenant_id = o.tenant_id WHERE o.id = object_personnel.object_id AND public.is_management_for_tenant(o.tenant_id)));
DROP POLICY IF EXISTS owner_or_staff_read_payments ON public.payments;
CREATE POLICY owner_or_staff_read_payments ON public.payments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = payments.invoice_id AND i.tenant_id = payments.tenant_id AND (i.created_by = auth.uid() OR public.is_management_for_tenant(i.tenant_id))));
`;

const applicationPolicies = [
  ["object_contacts", "object_contacts_management", phase2Path],
  ["object_personnel", "object_personnel_management", phase2Path],
  ["objects", "objects_management", phase2Path],
  ["personnel", "personnel_management", sprintPath],
  ["personnel", "personnel_select_own", sprintPath],
  ["objects", "objects_customer_users_select", boundaryPath],
  ["objects", "objects_customer_users_insert", boundaryPath],
  ["objects", "objects_customer_users_update", boundaryPath],
  ["objects", "personnel_select_assigned_objects", personnelPath],
  ["invoices", "invoices_management_all", boundaryPath],
  ["invoices", "invoices_customer_sent_select", boundaryPath],
  ...["select", "insert", "update", "delete"].map((command) =>
    ["object_contacts", `object_contacts_customer_users_${command}`, boundaryPath]),
];
const runtimeOperations: Record<string, string[]> = {
  invoices: ["select", "insert", "update"], object_contacts: ["select", "insert", "update", "delete"],
  object_personnel: ["select", "insert", "delete"], objects: ["select", "insert", "update", "delete"],
  payments: ["select", "insert", "update"], personnel: ["select", "insert", "update", "delete"],
};
const columnDefinitions: Record<string, [string, boolean][]> = {
  invoices: [["created_by", false], ["id", true], ["tenant_id", true]],
  object_contacts: [["id", true], ["object_id", true]],
  object_personnel: [["object_id", true], ["personnel_id", true]],
  objects: [["id", true], ["tenant_id", true]], payments: [["id", true], ["invoice_id", false], ["tenant_id", true]],
  personnel: [["id", true], ["tenant_id", true]],
};
function oneMatch(source: string, expression: RegExp): RegExpMatchArray {
  const matches = [...source.matchAll(expression)];
  assert.equal(matches.length, 1, "source_fragment_count_invalid");
  return matches[0]!;
}
function policySql(source: string, name: string): string {
  assert.match(name, /^[a-z_]+$/u);
  return oneMatch(source, new RegExp(`CREATE POLICY "?${name}"?\\s+ON\\s+[\\s\\S]*?;`, "gu"))[0];
}
function functionSql(source: string, qualifiedName: string): { sql: string; body: string } {
  assert.match(qualifiedName, /^(?:auth|public)\.[a-z_]+$/u);
  const escaped = qualifiedName.replace(".", "\\.");
  const match = oneMatch(source, new RegExp(`create or replace function ${escaped}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`, "giu"));
  return { sql: match[0], body: match[1]! };
}
const policyReadSql = `SELECT namespace.nspname AS schema, relation.relname AS table, policy.polname AS name,
  policy.polcmd::text AS command, policy.polpermissive AS permissive,
  ARRAY(SELECT role_name FROM (SELECT CASE role_oid WHEN 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role_oid)::text END AS role_name
    FROM pg_catalog.unnest(policy.polroles) role_oid) role_names ORDER BY role_name COLLATE "C") AS roles,
  pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, false) AS "usingExpression",
  pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid, false) AS "checkExpression"
FROM pg_catalog.pg_policy policy JOIN pg_catalog.pg_class relation ON relation.oid = policy.polrelid
JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[])
ORDER BY relation.relname COLLATE "C", policy.polname COLLATE "C"`;

export async function reconstructPolicyManifests() {
  const sourceBytes = new Map(await Promise.all(sourcePaths.map(async (path) =>
    [path, await readFile(join(root, path), "utf8")] as const)));
  const source = (path: string) => { const value = sourceBytes.get(path); assert.ok(value); return value; };
  assert.equal(sha(source(providerPath)), "5b72022d73e64a8e474d2122ac42f299bb7ce4d59755cdcc78e72abfe5d47dc0");
  const providerSource = source(providerPath).replaceAll('{{ index .Options "Namespace" }}', "auth");
  const providerUid = functionSql(providerSource, "auth.uid");
  const providerRole = functionSql(providerSource, "auth.role");
  const localUid = functionSql(source(shimPath), "auth.uid");
  const sources = sourcePaths.map((path) => ({ path, sha256: sha(path === providerPath ? source(path) : source(path).replaceAll("\r\n", "\n")) }));
  const helper = (name: string, path: string, argumentTypes: string[], argNames: string[], config: string[], securityDefiner: boolean): Helper => ({
    schema: "public", name, argumentTypes, returnType: "bool", body: functionSql(source(path), `public.${name}`).body,
    language: "sql", securityDefiner, volatility: "s", parallel: "u", strict: false, leakproof: false,
    config, argNames, defaultCount: 0, ownerRelation: { schema: "public", table: "object_contacts" },
    directAcl: ["$owner", "authenticated"].map((grantee) => ({ grantee, grantor: "$owner", privilege: "EXECUTE", grantable: false })),
    effectiveExecute: effectiveRoles.map((role) => ({ role, allowed: ["$owner", "authenticated"].includes(role) })),
  });
  const publicHelpers = [
    helper("customer_has_access", boundaryPath, ["uuid", "uuid"], ["p_customer_id", "p_tenant_id"], ["search_path=public, auth"], false),
    helper("personnel_assigned_to_assignment", personnelPath, ["uuid"], ["p_assignment_id"], ["search_path=pg_catalog, public, auth"], true),
    helper("fieldgrid_has_platform_permission", phase2Path, ["text"], ["p_permission"], ["search_path=pg_catalog, public, pg_temp"], true),
  ];
  const authHelper = (name: "uid" | "role", provider: boolean): Helper => ({
    schema: "auth", name, argumentTypes: [], returnType: name === "uid" ? "uuid" : "text",
    body: name === "role" ? providerRole.body : provider ? providerUid.body : localUid.body,
    language: "sql", securityDefiner: false, volatility: "s", parallel: "u", strict: false, leakproof: false,
    config: null, argNames: null, defaultCount: 0, ownerRelation: { schema: "auth", table: "users" },
    directAcl: (provider ? ["$owner", "PUBLIC", "postgres", "dashboard_user"] : ["$owner", "PUBLIC"])
      .map((grantee) => ({ grantee, grantor: "$owner", privilege: "EXECUTE", grantable: false })),
    effectiveExecute: effectiveRoles.map((role) => ({ role, allowed: true })),
  });
  const variants: { state: State; profile: string; manifest: PolicyDefinitionManifest }[] = [];
  const manifestHashes: Record<string, string> = {};
  const { Client } = createRequire(join(root, "lib/db/package.json"))("pg") as { Client: new (options: { connectionString: string }) => Client };
  const client = new Client({ connectionString: localDatabase });
  let connected = false, transaction = false;
  try {
    await client.connect(); connected = true;
    await client.query("BEGIN"); transaction = true;
    await client.query("SET LOCAL statement_timeout = '20s'; SET LOCAL lock_timeout = '3s'; SET LOCAL search_path = pg_catalog");
    const guard = await client.query<{ safe: boolean }>(`SELECT current_database() = 'fieldgrid_runtime_safety'
      AND current_user = 'postgres' AND current_setting('server_version_num')::int / 10000 = 17
      AND pg_try_advisory_xact_lock(hashtext('fieldgrid:policy-contract-reconstruction:v1')) AS safe`);
    assert.equal(guard.rows[0]?.safe, true, "disposable_database_guard_failed");
    await client.query("LOCK TABLE public.invoices, public.object_contacts, public.object_personnel, public.objects, public.payments, public.personnel IN ACCESS EXCLUSIVE MODE");
    const initialPolicies = (await client.query(policyReadSql, [tableNames])).rows;
    const expectedNames = [...applicationPolicies.map(([table, name]) => `${table}.${name}`),
      ...Object.entries(runtimeOperations).flatMap(([table, operations]) => operations.map((operation) => `${table}.fieldgrid_runtime_data_${operation}`))].sort();
    assert.deepEqual(initialPolicies.map((policy) => `${policy.table}.${policy.name}`).sort(), expectedNames, "local_clean_policy_set_invalid");
    await client.query("SET LOCAL search_path = public, pg_catalog");
    // Reparse only fixed tracked source fragments, never installed policy expressions.
    for (const [table, name, path] of applicationPolicies) {
      let ddl = policySql(source(path!), name!);
      if (name === "personnel_management" || name === "invoices_management_all") {
        assert.ok(source(phase2Path).includes("'is_management()', 'public.is_management_for_tenant(tenant_id)'"));
        ddl = ddl.replaceAll("is_management()", "public.is_management_for_tenant(tenant_id)");
      }
      await client.query(`DROP POLICY ${name} ON public.${table};\n${ddl}`);
    }
    for (const [table, operations] of Object.entries(runtimeOperations)) {
      const capability = `('public', '${table}', 'direct', ARRAY[${operations.map((operation) => `'${operation.toUpperCase()}'`).join(", ")}]::text[])`;
      assert.ok(source(runtimePath).includes(capability), "runtime_capability_source_mismatch");
      for (const operation of operations) {
        const policyName = `fieldgrid_runtime_data_${operation}`;
        const clause = operation === "insert" ? "WITH CHECK (true)" : operation === "update" ? "USING (true) WITH CHECK (true)" : "USING (true)";
        assert.ok(source(runtimePath).includes(`FOR ${operation.toUpperCase()} TO fieldgrid_runtime_data ${clause}`));
        await client.query(`DROP POLICY ${policyName} ON public.${table}; CREATE POLICY ${policyName} ON public.${table} FOR ${operation.toUpperCase()} TO fieldgrid_runtime_data ${clause}`);
      }
    }
    await client.query("SET LOCAL search_path = pg_catalog");
    assert.deepEqual((await client.query(policyReadSql, [tableNames])).rows, initialPolicies, "local_source_reconstruction_mismatch");
    // The role helper is absent from the local shim. Restore only its fixture ACL;
    // the runtime migration has already revoked default PUBLIC EXECUTE locally.
    await client.query(providerRole.sql);
    await client.query("GRANT EXECUTE ON FUNCTION auth.role() TO PUBLIC");

    async function capture(state: State, expectedTargetCount: number) {
      await client.query("SET LOCAL search_path = pg_catalog");
      const policies = (await client.query(policyReadSql, [tableNames])).rows as PolicyDefinitionManifest["policies"];
      assert.equal(policies.filter((policy) => targetTables.includes(policy.table)).length, expectedTargetCount);
      assert.equal(policies.length, expectedTargetCount + 20);
      for (const provider of [false, true]) {
        const profile = provider ? "providerSource" : "localShim";
        const hasServicePolicy = state === "legacy" || state === "targetUpgrade";
        const manifest: PolicyDefinitionManifest = {
          version: 1, postgresMajor: 17, sources,
          relations: tableNames.map((table) => ({ schema: "public", table, kind: "r", rowSecurity: true, forceRowSecurity: false,
            columns: columnDefinitions[table]!.map(([name, notNull]) => ({ name, notNull, typeName: "uuid", typeModifier: -1 })) })),
          policies, helpers: [...publicHelpers, authHelper("uid", provider), ...(hasServicePolicy ? [authHelper("role", provider)] : [])],
        };
        const contract = compilePolicyDefinitionContract(manifest, sourceBytes);
        assert.equal(compilePolicyDefinitionContract(structuredClone(manifest), sourceBytes).manifestHash, contract.manifestHash);
        if (provider) {
          await client.query("SAVEPOINT provider_profile");
          await client.query(`DO $$ BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin NOLOGIN; END IF;
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'dashboard_user') THEN CREATE ROLE dashboard_user NOLOGIN; END IF;
          END $$`);
          await client.query(providerUid.sql);
          await client.query("ALTER TABLE auth.users OWNER TO supabase_auth_admin");
          for (const name of ["uid", "role"]) {
            await client.query(`ALTER FUNCTION auth.${name}() OWNER TO supabase_auth_admin;
              GRANT EXECUTE ON FUNCTION auth.${name}() TO PUBLIC, postgres, dashboard_user`);
          }
        }
        const result = await readPolicyDefinitionContract(client, contract);
        assert.deepEqual(result, { postgresMajorMatches: true, policySetMatches: true, helperContractsMatch: true, relationsMatch: true }, `reconstruction_contract_failed_${state}_${profile}`);
        if (provider) await client.query("ROLLBACK TO SAVEPOINT provider_profile; RELEASE SAVEPOINT provider_profile");
        variants.push({ state, profile, manifest }); manifestHashes[`${state}/${profile}`] = contract.manifestHash;
      }
    }
    await capture("clean", 16);
    await client.query("SAVEPOINT clean_state");
    await client.query(targetDDL);
    await capture("targetClean", 17);
    await client.query("ROLLBACK TO SAVEPOINT clean_state; RELEASE SAVEPOINT clean_state");
    await client.query("SET LOCAL search_path = public, pg_catalog");
    for (const name of ["object_contacts_management_all", "object_personnel_management_all"]) await client.query(policySql(source(historicalObjectsPath), name));
    for (const name of ["owner_or_staff_read_payments", "service_role_all_payments"]) await client.query(policySql(source(historicalPaymentsPath), name));
    await capture("legacy", 20);
    await client.query(targetDDL);
    await capture("targetUpgrade", 18);
    await client.query("ROLLBACK"); transaction = false;
    return {
      version: 1, variants, targetDDL,
      provenance: {
        generator: "scripts/fieldgrid-reconstruct-tenant-management-policy-contract.mts",
        generatorSha256: sha(await readFile(fileURLToPath(import.meta.url), "utf8")),
        targetDdlSha256: sha(targetDDL), manifestHashes, postgresMajor: 17,
        reconstruction: "Fixed loopback disposable database only; tracked source policy fragments are reparsed under public, pg_catalog and compared under pg_catalog. All local catalog/role/owner changes are rolled back before the connection closes.",
        policyCounts: { clean: 16, legacy: 20, targetClean: 17, targetUpgrade: 18, additionalParentPolicies: 20 },
        excludedHelper: "is_management_for_tenant and its private implementation are independently checked by the strict immutable scope contract. They are deliberately excluded here; their permitted state depends on the runner phase.",
        sourceBinding: "Historical and existing definitions bind the listed source bytes. The new targetDDL binds its explicit SHA256 and reviewed migration bytes; embedding that migration's own hash would create a self-hash cycle.",
        profiles: {
          localShim: "Exact repository auth.uid shim and local owner/PUBLIC function ACL; auth.role, when needed, uses the exact official provider body. This fixture profile does not prove hosted Supabase state.",
          providerSource: "Exact pinned provider auth.uid/auth.role bodies, auth.users owner, and owner/PUBLIC/postgres/dashboard_user ACL. Hosted acceptance still requires an exact live boolean match.",
        },
        providerPermissionsSource: "https://github.com/supabase/postgres/blob/e030a881977672675b2e51eef587075cdb320ee6/migrations/db/migrations/20211115181400_update-auth-permissions.sql",
        providerOwnerSource: "https://github.com/supabase/postgres/blob/e030a881977672675b2e51eef587075cdb320ee6/migrations/db/migrations/20211124212715_update-auth-owner.sql",
      },
    };
  } finally {
    try { if (transaction) await client.query("ROLLBACK"); }
    finally { if (connected) await client.end(); }
  }
}

async function main() {
  assert.deepEqual(process.argv.slice(2).length, 1, "reconstruction_mode_required");
  const mode = process.argv[2]; assert.ok(mode === "--write" || mode === "--check", "reconstruction_mode_invalid");
  const bundle = await reconstructPolicyManifests();
  const serialized = `${JSON.stringify(bundle, null, 2)}\n`;
  if (mode === "--write") await writeFile(join(root, outputPath), serialized);
  else assert.equal(await readFile(join(root, outputPath), "utf8"), serialized, "reconstruction_output_drift");
  process.stdout.write(`Policy reconstruction ${mode === "--write" ? "written" : "verified"}: 8 exact variants, all local changes rolled back.\n`);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => { process.stderr.write("policy_contract_reconstruction_failed\n"); process.exitCode = 1; });
}
