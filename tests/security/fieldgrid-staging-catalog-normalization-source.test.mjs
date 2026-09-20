import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
test("hosted compatibility preserves committed migrations and provider-owned helpers", () => {
  for (const [name, hash] of [
    ["20260914125400_reconcile_legacy_global_rbac_policies.sql", "421fde7810185af215b46b733bcf09878c78812a6a151850bb52536ddcc7ba5c"],
    ["20260914125503_scope_tenant_management_authorization.sql", "23b1aa33b626a114694a748e3e2d391ea02460071c865d2b20df2ec582df9902"],
    ["20260919220633_repair_tenant_management_policy_consumers.sql", "89bb90be5003c58085edb2688cfc8c9793e682e159edc0f3a656703bd86c3929"],
  ]) assert.equal(createHash("sha256").update(read(`lib/db/migrations/${name}`)).digest("hex"), hash);
  const migration = read("lib/db/migrations/20260920131458_reconcile_hosted_policy_contract.sql");
  assert.doesNotMatch(migration, /SET (?:LOCAL )?ROLE|ALTER (?:ROLE|FUNCTION)|GRANT\s+EXECUTE|CREATE OR REPLACE FUNCTION/iu);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.customer_has_access\(uuid,uuid\) FROM anon, service_role/u);
  assert.match(migration, /hosted_policy_personnel_path_not_closed/u);
});
test("bounded runner proves target before chronological compatibility journal writes", () => {
  const script = read("scripts/fieldgrid-hosted-policy-compatibility.mts");
  assert.ok(script.indexOf("verifyTenantManagementScopeCatalog(queryable)") < script.indexOf("INSERT INTO drizzle.veele_sql_migrations"));
  assert.match(script, /const baselined = migration\.name === HOSTED_POLICY_SUPERSEDED\.name/u);
  assert.match(script, /JSON\.stringify\(before\) !== JSON\.stringify\(after\)/u);
  assert.match(script, /ROLLBACK/u);
  const workflow = read(".github/workflows/fieldgrid-staging-catalog-normalization.yml");
  assert.match(workflow, /environment: staging/u);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/u);
  assert.match(workflow, /FIELDGRID_MIGRATION_DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/u);
  assert.match(workflow, /FIELDGRID_DATABASE_CONNECTION_PURPOSE: migration/u);
});
