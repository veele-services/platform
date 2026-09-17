import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const script = readFileSync(
  "scripts/fieldgrid-staging-tenant-management-policy-identity-diagnostic.mts",
  "utf8",
);
const workflow = readFileSync(
  ".github/workflows/fieldgrid-staging-tenant-management-policy-identity-diagnostic.yml",
  "utf8",
);

test("policy identity diagnostic remains read-only and metadata-only", () => {
  assert.match(script, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/u);
  assert.match(script, /FROM pg_policies/u);
  assert.match(script, /schemaname AS schema/u);
  assert.match(script, /tablename AS table/u);
  assert.match(script, /policyname AS policy/u);
  assert.match(script, /LIMIT \$\{MAX_UNKNOWN_POLICY_CONSUMERS \+ 1\}/u);
  assert.match(script, /MAX_UNKNOWN_POLICY_CONSUMERS = 10/u);
  assert.match(script, /await queryable\.query\("ROLLBACK"\)/u);
  assert.doesNotMatch(
    script,
    /\b(?:INSERT INTO|UPDATE\s+public\.|DELETE FROM|TRUNCATE|ALTER TABLE|CREATE TABLE|DROP TABLE)\b/iu,
  );
  assert.doesNotMatch(
    script,
    /auth\.users|raw_user_meta_data|access_token|refresh_token|password|DATABASE_URL\s*[:=]\s*process/u,
  );
  assert.doesNotMatch(script, /error\.(?:message|stack)|String\(error\)/u);
});

test("workflow exposes no mutation mode and keeps database credentials after static checks", () => {
  assert.match(workflow, /^name: Staging Tenant Management Policy Identity Diagnostic$/mu);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /expected_main_sha:/u);
  assert.match(workflow, /confirmation:/u);
  assert.doesNotMatch(workflow, /operation:/u);
  assert.doesNotMatch(workflow, /\bapply\b/u);
  assert.match(workflow, /group: veele-staging\s+cancel-in-progress: false/u);
  assert.match(workflow, /environment: staging/u);
  assert.match(workflow, /retention-days: 1\b/u);
  assert.match(workflow, /fieldgrid-staging-tenant-management-policy-identity-diagnostic\.test\.ts/u);
  assert.match(workflow, /fieldgrid-tenant-management-policy-identity-diagnostic-source\.test\.mjs/u);
  assert.ok(
    workflow.indexOf("Validate read-only diagnostic without database credentials") <
      workflow.indexOf("FIELDGRID_MIGRATION_DATABASE_URL:"),
  );
  assert.doesNotMatch(
    workflow,
    /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_AUTH|db:migrate|repair-platform-privilege/u,
  );
});

test("dispatch confirmation stays data even with shell metacharacters", () => {
  const step = workflow.split("- name: Reject non-main diagnostic dispatch")[1]
    .split("- name: Checkout exact reviewed main source")[0];
  assert.match(step, /DIAGNOSTIC_CONFIRMATION: \$\{\{ inputs\.confirmation \}\}/u);
  const shell = step.split("run: |\n")[1].split("\n")
    .map((line) => line.replace(/^          /u, "")).join("\n");
  assert.doesNotMatch(shell, /\$\{\{/u, "untrusted workflow expressions must not enter shell source");
  const confirmation = "fieldgrid-staging-tenant-management-policy-identity-diagnostic-v1";
  for (const value of [
    confirmation,
    "$(printf injected >&2)",
    "`printf injected >&2`",
    '\"; printf injected >&2; #',
    "wrong\nvalue",
  ]) {
    const result = spawnSync("bash", ["--noprofile", "--norc", "-c", shell], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_REPOSITORY: "veele-services/platform",
        GITHUB_REF: "refs/heads/main",
        GITHUB_SHA: "a".repeat(40),
        EXPECTED_MAIN_SHA: "a".repeat(40),
        DIAGNOSTIC_CONFIRMATION: value,
      },
    });
    assert.equal(result.status, value === confirmation ? 0 : 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  }
});
