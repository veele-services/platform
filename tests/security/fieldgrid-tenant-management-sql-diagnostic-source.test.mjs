import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const script = readFileSync(
  "scripts/fieldgrid-staging-tenant-management-sql-diagnostic.mts",
  "utf8",
);
const workflow = readFileSync(
  ".github/workflows/fieldgrid-staging-tenant-management-authorization.yml",
  "utf8",
);

test("SQL diagnostic is catalog-only, read-only and secret-free", () => {
  assert.match(
    script,
    /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/u,
  );
  assert.match(script, /await queryable\.query\("ROLLBACK"\)/u);
  assert.match(script, /FROM pg_policies/u);
  assert.match(script, /FROM pg_proc/u);
  assert.match(script, /FROM pg_rewrite/u);
  assert.doesNotMatch(
    script,
    /\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE|ALTER TABLE|DROP TABLE|CREATE TABLE)\b/iu,
  );
  assert.doesNotMatch(script, /auth\.users|raw_user_meta_data|access_token|refresh_token/iu);
  assert.doesNotMatch(script, /error\.(?:message|stack)|String\(error\)/u);
  assert.match(script, /unknown_policy_consumer_count/u);
  assert.match(script, /platform_permission_helper_exact/u);
  assert.match(script, /legacy_tenant_helper_exact/u);
  assert.match(script, /legacy_function_consumer_count/u);
  assert.match(script, /legacy_rule_consumer_count/u);
});

test("failed apply reads its actual installed state and never reruns legacy preconditions unconditionally", () => {
  assert.match(
    workflow,
    /name: Diagnose or apply only the reviewed authorization migration\s+id: authorization_operation/u,
  );
  const recoveryStep = workflow.split("- name: Read canonical or prerequisite state after unsuccessful apply")[1]
    .split("- name: Upload secret-free authorization evidence")[0];
  assert.match(
    recoveryStep,
    /if: \$\{\{ always\(\) && inputs\.operation == 'apply' && steps\.authorization_operation\.outcome == 'failure' \}\}/u,
  );
  assert.match(recoveryStep, /fieldgrid-staging-tenant-management-authorization\.mts[\s\S]*--diagnose --expected-sha "\$EXPECTED_MAIN_SHA"/u);
  assert.doesNotMatch(recoveryStep, /--apply|fieldgrid-staging-tenant-management-sql-diagnostic\.mts/u);
  assert.doesNotMatch(workflow, /sql-diagnostic\.mts[\s\\\n]+--diagnose/u);
  assert.match(
    workflow,
    /FIELDGRID_MIGRATION_DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/u,
  );
  assert.match(
    workflow,
    /FIELDGRID_DATABASE_CONNECTION_PURPOSE: migration/u,
  );
  assert.match(
    workflow,
    /name: Upload secret-free authorization evidence[\s\S]*tenant-management-authorization-/u,
  );
});
