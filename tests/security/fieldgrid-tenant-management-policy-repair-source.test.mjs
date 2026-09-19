import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  loadTenantManagementPolicyRepairSource,
  policyRepairReadinessSql,
  validateRepairVariants,
  tenantManagementPolicyRepairContractSql,
} from "../../scripts/fieldgrid-tenant-management-policy-repair-contract.mts";
import { tenantManagementAuthorizationContractSql } from "../../scripts/fieldgrid-tenant-management-authorization-contract.mts";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const digest = (value) => createHash("sha256").update(value.replaceAll("\r\n", "\n")).digest("hex");

test("repair does not replace immutable historical migration hashes", () => {
  assert.equal(digest(read("lib/db/migrations/20260914125400_reconcile_legacy_global_rbac_policies.sql")),
    "421fde7810185af215b46b733bcf09878c78812a6a151850bb52536ddcc7ba5c");
  assert.equal(digest(read("lib/db/migrations/20260914125503_scope_tenant_management_authorization.sql")),
    "23b1aa33b626a114694a748e3e2d391ea02460071c865d2b20df2ec582df9902");
});

test("SQL and read-only diagnostics use the same source-bound full definition comparator", async () => {
  const source = await loadTenantManagementPolicyRepairSource();
  const variants = validateRepairVariants(JSON.parse(source.sql.split("$policy_repair_manifest$")[1]));
  const reconstructed = JSON.parse(read("tests/fixtures/fieldgrid-tenant-management-policy-manifests.json"));
  assert.deepEqual(variants, reconstructed.variants);
  assert.ok(source.sql.includes(reconstructed.targetDDL));
  assert.ok(source.sql.includes(policyRepairReadinessSql(variants, "repair_manifest")));
  assert.doesNotMatch(policyRepairReadinessSql(variants), /\$1\b/u);
  assert.equal(source.hash, digest(source.sql));
  const invalid = structuredClone(variants);
  invalid[0].manifest.sources[0].sha256 = "0".repeat(64);
  assert.throws(() => validateRepairVariants(invalid), /source_hash_mismatch/u);
});

test("owner and replay gates include repair journal and target policy evidence", async () => {
  const source = await loadTenantManagementPolicyRepairSource();
  const repair = tenantManagementPolicyRepairContractSql();
  const full = tenantManagementAuthorizationContractSql();
  assert.ok(full.includes(repair));
  assert.ok(repair.includes(source.hash));
  assert.ok(repair.includes(source.name));
  assert.match(repair, /repair\."targetDefinitionMatches" AND repair\."dependenciesValid"/u);
  const smoke = read("tests/fieldgrid-realtime-projection-migration.test.mjs");
  assert.ok(smoke.indexOf("verifyTenantManagementPolicyRepair);") < smoke.indexOf("await client.connect()"));
});
