import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  compilePolicyDefinitionContract,
  compileSelfPinningPolicyDefinitionContractSql,
  readPolicyDefinitionContract,
  type PolicyDefinitionManifest,
  type PolicyDefinitionQueryable,
} from "../../scripts/fieldgrid-tenant-management-policy-definition-contract.mts";

const sourcePath = "lib/db/migrations/20260919000000_synthetic_contract.sql";
const sourceSql = "-- Synthetic trusted source\nSELECT 1;\n";
const sourceHash = createHash("sha256").update(sourceSql).digest("hex");
const sources = new Map([[sourcePath, sourceSql]]);
const effectiveRoles = ["$owner", "PUBLIC", "anon", "authenticated", "service_role", "fieldgrid_runtime_data", "fieldgrid_runtime_app"];
function fixture(): PolicyDefinitionManifest {
  return {
    version: 1, postgresMajor: 17,
    sources: [{ path: sourcePath, sha256: sourceHash }],
    relations: [{ schema: "public", table: "synthetic_relation", kind: "r", rowSecurity: true, forceRowSecurity: false,
      columns: [{ name: "id", typeName: "uuid", typeModifier: -1, notNull: true }] }],
    policies: [{ schema: "public", table: "synthetic_relation", name: "synthetic_policy", command: "*",
      permissive: true, roles: ["authenticated"], usingExpression: "(id IS NOT NULL)", checkExpression: null }],
    helpers: [{ schema: "public", name: "synthetic_helper", argumentTypes: ["uuid"], returnType: "bool",
      body: "\nSELECT p_id IS NOT NULL;\n", language: "sql", securityDefiner: true,
      volatility: "s", parallel: "u", strict: false, leakproof: false,
      config: ["search_path=pg_catalog, public, pg_temp"], argNames: ["p_id"], defaultCount: 0,
      ownerRelation: { schema: "public", table: "synthetic_relation" },
      directAcl: [
        { grantee: "$owner", grantor: "$owner", privilege: "EXECUTE", grantable: false },
        { grantee: "authenticated", grantor: "$owner", privilege: "EXECUTE", grantable: false },
      ],
      effectiveExecute: effectiveRoles.map((role) => ({ role, allowed: ["$owner", "authenticated"].includes(role) })),
    }],
  };
}
const goodResult = { postgresMajorMatches: true, policySetMatches: true, helperContractsMatch: true, relationsMatch: true };
function readerFixture(row: unknown = goodResult, path = "pg_catalog") {
  const calls: { sql: string; values?: unknown[] }[] = [];
  const queryable = { async query(sql: string, values?: unknown[]) {
    calls.push({ sql, values });
    return { rows: [calls.length === 1 ? { search_path: path } : row], rowCount: 1 };
  } } as PolicyDefinitionQueryable;
  return { calls, queryable };
}

test("source hash binding rejects missing or changed bytes and permits only repository newline normalization", () => {
  const manifest = fixture();
  assert.equal(compilePolicyDefinitionContract(manifest, sources).manifestHash.length, 64);
  assert.doesNotThrow(() => compilePolicyDefinitionContract(manifest, new Map([[sourcePath, sourceSql.replaceAll("\n", "\r\n")]])));
  for (const sourceBytes of [new Map(), new Map([[sourcePath, `${sourceSql} `]])]) {
    assert.throws(() => compilePolicyDefinitionContract(manifest, sourceBytes), { message: "policy_definition_source_hash_mismatch" });
  }
  manifest.sources[0]!.sha256 = "f".repeat(64);
  assert.throws(() => compilePolicyDefinitionContract(manifest, sources), { message: "policy_definition_source_hash_mismatch" });
});

test("the vendored provider fixture retains exact pinned upstream bytes and helper bodies", () => {
  const fixturePath = "tests/fixtures/fieldgrid-supabase-auth-functions.sql";
  const sql = readFileSync(resolve(__dirname, "../fixtures/fieldgrid-supabase-auth-functions.sql"), "utf8");
  const provenance = JSON.parse(readFileSync(resolve(__dirname, "../fixtures/fieldgrid-supabase-auth-functions.provenance.json"), "utf8"));
  assert.equal(provenance.revision, "2e9ce6c8e46532879ced1c6f9a7acdcde3815ea6");
  assert.equal(provenance.sourceUrl, `https://raw.githubusercontent.com/supabase/auth/${provenance.revision}/migrations/20220224000811_update_auth_functions.up.sql`);
  assert.equal(provenance.sha256, "5b72022d73e64a8e474d2122ac42f299bb7ce4d59755cdcc78e72abfe5d47dc0");
  assert.equal(Buffer.byteLength(sql), provenance.byteLength);
  assert.equal(createHash("sha256").update(sql).digest("hex"), provenance.sha256);
  const resolved = sql.replaceAll('{{ index .Options "Namespace" }}', "auth");
  for (const { signature: identity, sha256: expected } of provenance.helperBodies) {
    const functionName = identity.slice("auth.".length, -2);
    const body = resolved.match(new RegExp(`function auth\\.${functionName}\\(\\).*?as \\$\\$(.*?)\\$\\$;`, "su"))?.[1];
    assert.equal(typeof body, "string");
    assert.equal(createHash("sha256").update(body!).digest("hex"), expected);
  }
  const manifest = fixture(); manifest.sources = [{ path: fixturePath, sha256: provenance.sha256 }];
  assert.doesNotThrow(() => compilePolicyDefinitionContract(manifest, new Map([[fixturePath, sql]])));
  for (const changed of [sql.replaceAll("\n", "\r\n"), sql.replace("  select \n", "  select\n"), `${sql}\n`]) {
    assert.throws(() => compilePolicyDefinitionContract(manifest, new Map([[fixturePath, changed]])), /source_hash_mismatch/u);
  }
});

test("only the exact provider fixture and local compatibility shim extend migration source paths", () => {
  const shimPath = "scripts/fieldgrid-runtime-safety-setup.mjs";
  const shim = readFileSync(resolve(__dirname, "../..", shimPath), "utf8");
  const manifest = fixture(); manifest.sources = [{ path: shimPath, sha256: createHash("sha256").update(shim).digest("hex") }];
  assert.doesNotThrow(() => compilePolicyDefinitionContract(manifest, new Map([[shimPath, shim]])));
  assert.throws(() => compilePolicyDefinitionContract(manifest, new Map([[shimPath, `${shim} `]])), /source_hash_mismatch/u);
  for (const path of ["scripts/untrusted.mjs", "scripts/fieldgrid-runtime-safety-setup.mjs.sql",
    "tests/fixtures/untrusted.sql", "tests/fixtures/fieldgrid-supabase-auth-functions.provenance.json",
    "tests/fixtures/../fixtures/fieldgrid-supabase-auth-functions.sql"]) {
    manifest.sources[0]!.path = path;
    assert.throws(() => compilePolicyDefinitionContract(manifest, new Map([[path, shim]])), /manifest_invalid/u);
  }
});

test("provider admin names are allowed only in direct ACL grantees and grantors", () => {
  for (const role of ["postgres", "dashboard_user"]) {
    const manifest = fixture();
    manifest.helpers[0]!.directAcl.push({ grantee: role, grantor: role, privilege: "EXECUTE", grantable: false });
    assert.doesNotThrow(() => compilePolicyDefinitionContract(manifest, sources));
    manifest.policies[0]!.roles = [role];
    assert.throws(() => compilePolicyDefinitionContract(manifest, sources), /manifest_invalid/u);
    manifest.policies[0]!.roles = ["authenticated"];
    manifest.helpers[0]!.effectiveExecute[0]!.role = role;
    assert.throws(() => compilePolicyDefinitionContract(manifest, sources), /manifest_invalid/u);
  }
  for (const key of ["grantee", "grantor"] as const) {
    const manifest = fixture(); manifest.helpers[0]!.directAcl[0]![key] = "supabase_admin";
    assert.throws(() => compilePolicyDefinitionContract(manifest, sources), /manifest_invalid/u);
  }
});

test("auth.users is the sole provider owner reference outside the full relation policy set", () => {
  const manifest = fixture(); manifest.helpers[0]!.ownerRelation = { schema: "auth", table: "users" };
  const compiled = compilePolicyDefinitionContract(manifest, sources);
  assert.deepEqual(JSON.parse(compiled.values[0]).relations, manifest.relations);
  assert.equal(JSON.parse(compiled.values[0]).relations.some((relation: { schema: string }) => relation.schema === "auth"), false);
  for (const ownerRelation of [{ schema: "auth", table: "other_users" }, { schema: "public", table: "users" },
    { schema: "public", table: "unlisted_owner" }]) {
    manifest.helpers[0]!.ownerRelation = ownerRelation;
    assert.throws(() => compilePolicyDefinitionContract(manifest, sources), /manifest_invalid/u);
  }
});

test("compiled representation is deterministic, immutable and sensitive to exact expression/null differences", () => {
  const manifest = fixture();
  const first = compilePolicyDefinitionContract(manifest, sources);
  const reorderedKeys = Object.fromEntries(Object.entries(manifest).reverse()) as PolicyDefinitionManifest;
  assert.equal(compilePolicyDefinitionContract(reorderedKeys, sources).manifestHash, first.manifestHash);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.values), true);
  manifest.policies[0]!.usingExpression = "(id  IS NOT NULL)";
  assert.notEqual(compilePolicyDefinitionContract(manifest, sources).manifestHash, first.manifestHash);
  manifest.policies[0]!.checkExpression = "(id IS NOT NULL)";
  assert.notEqual(compilePolicyDefinitionContract(manifest, sources).manifestHash, first.manifestHash);
  assert.equal(JSON.parse(first.values[0]).policies[0].checkExpression, null);
});

test("source expression and function body text are parameters and never executable SQL fragments", () => {
  const manifest = fixture();
  const canary = "synthetic') ; DROP TABLE private; -- \\ $tag$";
  manifest.policies[0]!.usingExpression = canary;
  manifest.helpers[0]!.body = canary;
  const contract = compilePolicyDefinitionContract(manifest, sources);
  assert.ok(!contract.sql.includes(canary));
  assert.equal(JSON.parse(contract.values[0]).helpers[0].body, canary);
  assert.equal(contract.values.length, 1);
  assert.match(contract.sql, /SELECT \$1::pg_catalog\.jsonb/u);
  assert.doesNotMatch(contract.sql, /\b(?:EXECUTE|CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE)\s+(?:TABLE|FUNCTION|POLICY|INTO|FROM)/iu);
});

test("comparison includes the entire policy set, exact non-pretty deparsing, flags and listed dependency types", () => {
  const { sql } = compilePolicyDefinitionContract(fixture(), sources);
  assert.match(sql, /pg_get_expr\(policy\.polqual, policy\.polrelid, false\)/u);
  assert.match(sql, /pg_get_expr\(policy\.polwithcheck, policy\.polrelid, false\)/u);
  assert.match(sql, /actual_policies EXCEPT SELECT value FROM expected_policies/u);
  assert.match(sql, /expected_policies EXCEPT SELECT value FROM actual_policies/u);
  assert.match(sql, /policy\.polcmd::pg_catalog\.text/u);
  assert.match(sql, /policy\.polpermissive/u);
  assert.match(sql, /role_oid = 0 THEN 'PUBLIC'/u);
  assert.match(sql, /ORDER BY role_name COLLATE pg_catalog\."C"/u);
  assert.match(sql, /relation\.relrowsecurity/u);
  assert.match(sql, /relation\.relforcerowsecurity/u);
  assert.match(sql, /attribute\.attnotnull/u);
  assert.match(sql, /attribute\.atttypmod/u);
  assert.match(sql, /type_schema\.nspname = 'pg_catalog'/u);
  assert.doesNotMatch(sql, /regexp_replace|LIMIT|md5\(/iu);
});

test("helper comparison includes identity, scalar semantics, ownership and direct/default/inherited ACLs", () => {
  const { sql } = compilePolicyDefinitionContract(fixture(), sources);
  for (const token of ["helper.proargtypes", "helper.pronargs", "helper.prorettype", "helper.prosrc", "helper.prosqlbody IS NULL",
    "helper.prokind = 'f'", "helper.proargmodes IS NULL", "helper.proallargtypes IS NULL", "NOT helper.proretset", "helper.prosupport = 0",
    "helper.pronargdefaults = 0", "helper.proargdefaults IS NULL", "helper.proisstrict", "helper.proleakproof", "helper.proparallel",
    "helper.proconfig", "helper.proargnames", "helper.proowner = owner_relation.relowner", "acldefault('f', helper.proowner)",
    "acl.grantor", "acl.grantee", "acl.is_grantable", "pg_catalog.has_function_privilege", "pg_catalog.to_regrole"]) assert.ok(sql.includes(token), token);
});

test("self-pinning SQL has a required pin dependency at each deparser and retains parameter data", () => {
  const manifest = fixture();
  const canary = "synthetic policy expression must remain parameter data";
  manifest.policies[0]!.usingExpression = canary;
  const contract = compilePolicyDefinitionContract(manifest, sources);
  const sql = compileSelfPinningPolicyDefinitionContractSql(contract);
  assert.match(sql, /SELECT \$1::pg_catalog\.jsonb/u);
  assert.ok(!sql.includes(canary));
  assert.equal(JSON.parse(contract.values[0]).policies[0].usingExpression, canary);
  assert.match(sql, /SELECT pg_catalog\.set_config\('search_path', 'pg_catalog', true\) OPERATOR\(pg_catalog\.=\) 'pg_catalog' AS path_matches/u);
  for (const expression of ["polqual", "polwithcheck"]) {
    assert.ok(sql.includes(`pg_catalog.pg_get_expr(policy.${expression}, (CASE WHEN pg_catalog.set_config('search_path', 'pg_catalog', true) OPERATOR(pg_catalog.=) 'pg_catalog' THEN policy.polrelid END), false)`));
  }
  assert.equal(sql.match(/pg_catalog\.set_config\(/gu)?.length, 3);
  assert.equal(sql.match(/pg_catalog\.pg_get_expr\(/gu)?.length, 2);
  assert.doesNotMatch(sql, /pg_catalog\.pg_get_expr\(policy\.[a-z]+, policy\.polrelid,/u);
  assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE)\s+(?:TABLE|FUNCTION|POLICY|INTO|FROM)/iu);
  assert.doesNotMatch(sql, /::(?:jsonb|integer|text|boolean|oid)\b/u);
  assert.equal(compileSelfPinningPolicyDefinitionContractSql(contract), sql);
});

test("self-pinning compilation cannot turn an untrusted reconstructed contract into executable SQL", async () => {
  const contract = compilePolicyDefinitionContract(fixture(), sources);
  const forgedValues = [JSON.stringify({ privateSql: "must not execute" })] as const;
  for (const untrusted of [
    { ...contract }, Object.freeze({ ...contract }),
    { ...contract, sql: "SELECT private_function()" },
    Object.freeze({ sql: contract.sql, values: Object.freeze(forgedValues),
      manifestHash: createHash("sha256").update(forgedValues[0]).digest("hex") }),
  ]) {
    assert.throws(() => compileSelfPinningPolicyDefinitionContractSql(untrusted), { message: "policy_definition_catalog_invalid" });
    const reader = readerFixture();
    await assert.rejects(readPolicyDefinitionContract(reader.queryable, untrusted), { message: "policy_definition_catalog_invalid" });
    assert.equal(reader.calls.length, 0);
  }
});

test("compiling a self-pinning variant leaves the explicit-path reader unchanged", async () => {
  const contract = compilePolicyDefinitionContract(fixture(), sources);
  const beforeSql = contract.sql;
  compileSelfPinningPolicyDefinitionContractSql(contract);
  assert.equal(contract.sql, beforeSql);
  assert.doesNotMatch(contract.sql, /set_config/u);
  const reader = readerFixture();
  assert.deepEqual(await readPolicyDefinitionContract(reader.queryable, contract), goodResult);
  assert.deepEqual(reader.calls.map(({ sql }) => sql), [
    "SELECT pg_catalog.current_setting('search_path') AS search_path", beforeSql,
  ]);
  const wrongPath = readerFixture(goodResult, "public, pg_catalog");
  await assert.rejects(readPolicyDefinitionContract(wrongPath.queryable, contract), { message: "policy_definition_search_path_invalid" });
  assert.equal(wrongPath.calls.length, 1);
});

test("manifest validation rejects unbound schemas, unsafe identifiers, source paths, roles, types and unexpected fields", () => {
  const mutations: ((m: PolicyDefinitionManifest) => void)[] = [
    (m) => { m.version = 2 as 1; }, (m) => { m.postgresMajor = 18 as 17; },
    (m) => { m.sources[0]!.path = "../untrusted.sql"; },
    (m) => { m.relations[0]!.schema = "foreign_schema"; },
    (m) => { m.relations[0]!.table = "table;drop"; },
    (m) => { m.relations[0]!.columns[0]!.typeName = "public.uuid"; },
    (m) => { m.relations[0]!.columns[0]!.typeModifier = NaN; },
    (m) => { m.policies[0]!.roles = ["postgres"]; },
    (m) => { m.policies[0]!.roles = ["authenticated", "PUBLIC"]; },
    (m) => { m.policies[0]!.table = "unlisted_table"; },
    (m) => { m.helpers[0]!.argumentTypes = ["uuid);drop"]; },
    (m) => { m.helpers[0]!.ownerRelation.table = "unlisted_owner"; },
    (m) => { m.helpers[0]!.config = ["search_path=$user, public"]; },
    (m) => { m.helpers[0]!.body = "bad\0body"; },
    (m) => { (m as unknown as Record<string, unknown>).rawSql = "private"; },
  ];
  for (const mutate of mutations) {
    const manifest = fixture(); mutate(manifest);
    assert.throws(() => compilePolicyDefinitionContract(manifest, sources), { message: "policy_definition_manifest_invalid" });
  }
});

test("manifest validation rejects ambiguous duplicate contracts and incomplete effective ACL coverage", () => {
  const mutations: ((m: PolicyDefinitionManifest) => void)[] = [
    (m) => { m.sources.push(m.sources[0]!); },
    (m) => { m.relations.push(m.relations[0]!); },
    (m) => { m.relations[0]!.columns.push(m.relations[0]!.columns[0]!); },
    (m) => { m.policies.push(m.policies[0]!); },
    (m) => { m.policies[0]!.roles.push("authenticated"); },
    (m) => { m.helpers.push(m.helpers[0]!); },
    (m) => { m.helpers[0]!.directAcl.push(m.helpers[0]!.directAcl[0]!); },
    (m) => { m.helpers[0]!.effectiveExecute.pop(); },
    (m) => { m.helpers[0]!.effectiveExecute[0] = m.helpers[0]!.effectiveExecute[1]!; },
    (m) => { m.helpers[0]!.argNames = []; },
    (m) => { m.helpers[0]!.config = ["search_path=pg_catalog, public, public"]; },
    (m) => { m.relations = new Array(1); },
  ];
  for (const mutate of mutations) {
    const manifest = fixture(); mutate(manifest);
    assert.throws(() => compilePolicyDefinitionContract(manifest, sources), { message: "policy_definition_manifest_invalid" });
  }
});

test("manifest rejects command-incompatible expressions and retains omitted ALL checks", () => {
  for (const command of ["r", "d"] as const) {
    const manifest = fixture(); manifest.policies[0]!.command = command; manifest.policies[0]!.checkExpression = "true";
    assert.throws(() => compilePolicyDefinitionContract(manifest, sources), /manifest_invalid/u);
  }
  const insert = fixture(); insert.policies[0]!.command = "a";
  assert.throws(() => compilePolicyDefinitionContract(insert, sources), /manifest_invalid/u);
  insert.policies[0]!.usingExpression = null;
  assert.doesNotThrow(() => compilePolicyDefinitionContract(insert, sources));
  assert.doesNotThrow(() => compilePolicyDefinitionContract(fixture(), sources));
});

test("reader requires an explicitly fixed search path before any catalog comparison", async () => {
  const contract = compilePolicyDefinitionContract(fixture(), sources);
  for (const path of ["public", "pg_catalog, public", '"$user", public', "pg_catalog, pg_temp"]) {
    const reader = readerFixture(goodResult, path);
    await assert.rejects(readPolicyDefinitionContract(reader.queryable, contract), { message: "policy_definition_search_path_invalid" });
    assert.equal(reader.calls.length, 1);
  }
});

test("reader returns only four boolean flags and preserves negative comparison results", async () => {
  const contract = compilePolicyDefinitionContract(fixture(), sources);
  for (const row of [goodResult, { postgresMajorMatches: false, policySetMatches: false, helperContractsMatch: false, relationsMatch: false }]) {
    const reader = readerFixture(row);
    assert.deepEqual(await readPolicyDefinitionContract(reader.queryable, contract), row);
    assert.deepEqual(reader.calls[1]!.values, [...contract.values]);
    assert.equal(reader.calls.length, 2);
  }
  for (const row of [{}, { ...goodResult, policySetMatches: "true" }, { ...goodResult, policySql: "sensitive" }]) {
    await assert.rejects(readPolicyDefinitionContract(readerFixture(row).queryable, contract), { message: "policy_definition_catalog_invalid" });
  }
});

test("reader refuses tampered SQL/manifest values before executing and suppresses driver details", async () => {
  const contract = compilePolicyDefinitionContract(fixture(), sources);
  for (const invalid of [{ ...contract, sql: "DROP TABLE private" }, { ...contract, manifestHash: "f".repeat(64) }]) {
    const reader = readerFixture();
    await assert.rejects(readPolicyDefinitionContract(reader.queryable, invalid), { message: "policy_definition_catalog_invalid" });
    assert.equal(reader.calls.length, 0);
  }
  const queryable = { async query() { throw new Error("sensitive-driver-policy-or-token"); } };
  await assert.rejects(readPolicyDefinitionContract(queryable, contract), { message: "policy_definition_catalog_read_failed" });
});
