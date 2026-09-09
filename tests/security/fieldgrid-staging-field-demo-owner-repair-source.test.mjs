import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const script = readFileSync(
  "scripts/fieldgrid-staging-field-demo-owner-repair.mts",
  "utf8",
).replaceAll("\r\n", "\n");
const workflow = readFileSync(
  ".github/workflows/fieldgrid-staging-field-demo-owner-repair.yml",
  "utf8",
).replaceAll("\r\n", "\n");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

test("field-demo owner repair is a fixed staging-only create operation", () => {
  assert.match(script, /fieldgrid-staging-field-demo-owner-repair-v1/u);
  assert.match(script, /olyfmekyqozxrbrwwszu/u);
  assert.match(script, /https:\/\/olyfmekyqozxrbrwwszu\.supabase\.co/u);
  assert.match(script, /FIELD_DEMO_OWNER_EMAIL/u);
  assert.match(script, /auth\.admin\.createUser/u);
  assert.match(script, /generateInternalAuthPassword/u);
  assert.match(script, /email_confirm: true/u);
  assert.match(script, /portal: "tenant-admin"/u);
  assert.match(script, /credential_activation_pending: true/u);
  assert.match(script, /backoffice_profile_name_required: true/u);
  assert.match(script, /fieldgrid_automation_contract/u);
  assert.match(script, /fieldgrid_environment: "staging"/u);

  assert.doesNotMatch(script, /\.listUsers\s*\(/u);
  assert.doesNotMatch(script, /\.updateUserById\s*\(/u);
  assert.doesNotMatch(script, /\.deleteUser\s*\(/u);
  assert.doesNotMatch(script, /platform_role/u);
  assert.doesNotMatch(script, /tenant_id/u);
  assert.doesNotMatch(script, /role:\s*"(?:owner|admin|service_role)"/u);
  assert.doesNotMatch(
    script,
    /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+auth\.(?:users|identities)/iu,
  );
});

test("owner repair proves exact absence, identity and zero platform privilege", () => {
  assert.match(script, /FROM auth\.users AS auth_user/u);
  assert.match(
    script,
    /coalesce\(length\(encrypted_password\), 0\) > 0 AS password_set/u,
  );
  assert.match(script, /FROM auth\.identities AS identity/u);
  assert.match(script, /identity\.provider = 'email'/u);
  assert.match(script, /AS email_identity_count/u);
  assert.match(script, /FROM public\.platform_users AS platform_user/u);
  assert.match(script, /AS platform_user_count/u);
  assert.match(script, /fieldDemoOwnerFailureReason\(before\)/u);
  assert.match(script, /field_demo_owner_not_found/u);
  assert.match(script, /fieldDemoOwnerRepairCandidateIsExact/u);
  assert.match(script, /pg_try_advisory_lock\(hashtextextended\(\$1, 0\)\)/u);
  assert.match(script, /pg_advisory_unlock\(hashtextextended\(\$1, 0\)\)/u);
  assert.match(script, /POSTCHECK_ATTEMPTS = 20/u);
  assert.match(script, /createOutcome = await dependencies\.createOwner\(\)/u);
  assert.doesNotMatch(
    script,
    /dependencies\.createOwner\(\).*dependencies\.createOwner\(/su,
  );
});

test("provider failures and evidence stay bounded and secret-free", () => {
  assert.match(script, /catch \{\n\s+return "uncertain";/u);
  assert.match(script, /isAuthRetryableFetchError\(error\)/u);
  assert.match(script, /status >= 400/u);
  assert.match(script, /status < 500/u);
  assert.match(
    script,
    /fieldDemoOwnerCreateOutcome\(Boolean\(data\.user\), error\)/u,
  );
  assert.match(script, /fetch: fieldDemoOwnerRepairFetch/u);
  assert.match(script, /field_demo_owner_transport_unavailable/u);
  assert.match(script, /password = ""/u);
  assert.match(script, /safeFieldDemoOwnerRepairErrorCode/u);
  assert.match(script, /safeFieldDemoOwnerRepairFailureReason/u);
  assert.match(
    script,
    /console\.error\(formatSafeFieldDemoOwnerRepairError\(error\)\)/u,
  );
  assert.doesNotMatch(script, /console\.(?:log|error)\([^\n]*error\.message/u);
  assert.doesNotMatch(script, /JSON\.stringify\(error/u);

  const evidenceTypeStart = script.indexOf("type RepairEvidence = {");
  const evidenceTypeEnd = script.indexOf("};", evidenceTypeStart);
  const evidenceType = script.slice(evidenceTypeStart, evidenceTypeEnd);
  assert.ok(evidenceTypeStart >= 0 && evidenceTypeEnd > evidenceTypeStart);
  assert.doesNotMatch(
    evidenceType,
    /email|userId|user_id|password|credential|provider|url|metadata/iu,
  );
  assert.match(script, /mode: 0o700/u);
  assert.match(script, /mode: 0o600/u);
  assert.match(script, /await chmod\(evidencePath, 0o600\)/u);
});

test("repair workflow binds the privileged step to exact protected main", () => {
  assert.match(workflow, /^  workflow_dispatch:$/mu);
  assert.match(workflow, /^permissions:\n  contents: read$/mu);
  assert.match(workflow, /group: veele-staging/u);
  assert.match(workflow, /cancel-in-progress: false/u);
  assert.match(workflow, /^    environment: staging$/mu);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/u);
  assert.match(workflow, /test "\$GITHUB_SHA" = "\$EXPECTED_MAIN_SHA"/u);
  assert.match(workflow, /git\/ref\/heads\/main/u);
  assert.match(workflow, /Remote main advanced before owner repair/u);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(workflow, /fieldgrid-staging-field-demo-owner-repair-v1/u);

  const applyStep = workflow.indexOf(
    "- name: Create and verify only the missing reserved owner",
  );
  const reverifyStep = workflow.indexOf(
    "- name: Reverify exact main immediately before owner repair",
  );
  assert.ok(reverifyStep >= 0 && applyStep > reverifyStep);
  assert.doesNotMatch(
    workflow.slice(0, applyStep),
    /SUPABASE_SERVICE_ROLE_KEY|FIELDGRID_MIGRATION_DATABASE_URL:\s*\$\{\{/u,
  );
  const applyEnd = workflow.indexOf("\n      - name:", applyStep + 1);
  const applySource = workflow.slice(applyStep, applyEnd);
  assert.match(
    applySource,
    /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/u,
  );
  assert.match(
    applySource,
    /FIELDGRID_MIGRATION_DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/u,
  );
  assert.match(
    applySource,
    /DATABASE_URL: \$\{\{ secrets\.FIELDGRID_RUNTIME_DATABASE_URL \}\}/u,
  );
  assert.doesNotMatch(workflow, /systemctl|docker\s+(?:compose|run)|deploy/i);
  assert.match(workflow, /retention-days: 1/u);
  assert.match(
    workflow,
    /create-missing-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}\.json/u,
  );
  assert.doesNotMatch(workflow, /path: .*create-missing\.json/u);
  assert.match(script, /RUN_NUMBER_PATTERN/u);
  assert.match(script, /create-missing-\$\{runId\}-\$\{runAttempt\}\.json/u);
});

test("the root check pins the already reviewed Supabase SDK version", () => {
  assert.equal(packageJson.devDependencies["@supabase/supabase-js"], "2.106.2");
  assert.match(
    packageJson.scripts["fieldgrid:staging-field-demo-owner-repair:check"],
    /fieldgrid-staging-field-demo-owner-repair/u,
  );
});
