import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const script = readFileSync(
  "scripts/fieldgrid-staging-field-demo-owner-binding-repair.mts",
  "utf8",
).replaceAll("\r\n", "\n");
const workflow = readFileSync(
  ".github/workflows/fieldgrid-staging-field-demo-owner-binding-repair.yml",
  "utf8",
).replaceAll("\r\n", "\n");

test("owner-binding repair exposes one fixed staging-only contract", () => {
  assert.match(
    script,
    /FIELD_DEMO_OWNER_BINDING_VERSION\s*=\s*[\n\s]*"fieldgrid-staging-field-demo-owner-binding-repair-v1"/u,
  );
  assert.match(
    script,
    /FIELD_DEMO_OWNER_BINDING_CONFIRMATION\s*=\s*[\n\s]*"fieldgrid-staging-field-demo-owner-binding-repair-v1"/u,
  );
  assert.match(script, /olyfmekyqozxrbrwwszu/u);
  assert.match(script, /https:\/\/olyfmekyqozxrbrwwszu\.supabase\.co/u);

  for (const exportedName of [
    "FieldDemoOwnerBindingSnapshot",
    "FieldDemoOwnerBindingState",
    "FieldDemoOwnerBindingDecision",
    "FieldDemoOwnerBindingRepairResult",
    "FieldDemoOwnerBindingFailureReason",
    "validateFieldDemoOwnerBindingConfig",
    "classifyFieldDemoOwnerBinding",
    "repairFieldDemoOwnerBinding",
    "safeFieldDemoOwnerBindingErrorCode",
    "safeFieldDemoOwnerBindingFailureReason",
    "formatSafeFieldDemoOwnerBindingError",
    "FIELD_DEMO_OWNER_BINDING_SNAPSHOT_QUERY",
    "loadFieldDemoOwnerBindingSnapshot",
  ]) {
    assert.match(
      script,
      new RegExp(
        `export (?:async )?(?:const|type|function) ${exportedName}\\b`,
        "u",
      ),
      `${exportedName} must remain independently testable`,
    );
  }
});

test("snapshot and classification prove the exact owner and Management binding", () => {
  assert.match(script, /FROM public\.tenants AS/u);
  assert.match(script, /FROM auth\.users AS/u);
  assert.match(script, /FROM public\.tenant_users AS/u);
  assert.match(script, /FROM public\.tenant_roles AS/u);
  assert.match(script, /(?:FROM|JOIN) public\.roles AS/u);
  assert.match(script, /FROM public\.tenant_user_roles AS/u);
  assert.match(script, /role\.name = 'Management'/u);
  assert.match(script, /membership\.role = 'owner'/u);
  assert.match(script, /membership\.status = 'active'/u);
  assert.match(script, /auth_user\.email_confirmed_at IS NOT NULL/u);
  assert.match(
    script,
    /coalesce\(length\(auth_user\.encrypted_password\), 0\) > 0/u,
  );
  assert.match(script, /auth_user\.deleted_at IS NULL/u);
  assert.match(script, /FROM public\.platform_users AS/u);
});

test("repair is a locked singular insert-only transaction", () => {
  assert.match(script, /BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE/u);
  assert.match(
    script,
    /pg_try_advisory_xact_lock\(hashtextextended\(\$1,\s*0\)\)/u,
  );
  assert.ok(
    [...script.matchAll(/ORDER BY[\s\S]{0,500}?FOR UPDATE/gu)].length >= 2,
    "mutable identities and bindings must be locked in deterministic order",
  );
  assert.match(
    script,
    /INSERT INTO public\.tenant_users\s*\(\s*tenant_id,\s*user_id,\s*role,\s*status\s*\)\s*SELECT[\s\S]*?WHERE NOT EXISTS/u,
  );
  assert.match(
    script,
    /INSERT INTO public\.tenant_user_roles\s*\(\s*tenant_id,\s*user_id,\s*tenant_role_id\s*\)\s*SELECT[\s\S]*?\bNOT EXISTS/u,
  );

  const insertedTables = [
    ...script.matchAll(/\bINSERT INTO\s+((?:public|auth)\.[a-z_]+)/giu),
  ].map((match) => match[1].toLowerCase());
  assert.deepEqual(insertedTables.sort(), [
    "public.tenant_user_roles",
    "public.tenant_users",
  ]);
  assert.equal(
    [...script.matchAll(/\.rowCount !== 1/gu)].length,
    2,
    "each approved insert must affect exactly one row",
  );
  assert.doesNotMatch(
    script,
    /\b(?:UPDATE|DELETE\s+FROM)\s+(?:public|auth)\./iu,
  );
  assert.doesNotMatch(script, /\bON CONFLICT\b/iu);
  assert.doesNotMatch(script, /\bINSERT INTO\s+public\.audit_log\b/iu);
  assert.doesNotMatch(
    script,
    /\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+auth\./iu,
  );
  assert.match(script, /await client\.query\("COMMIT"\)/u);
  assert.match(
    script,
    /const freshSnapshot = await loadFieldDemoOwnerBindingSnapshot/u,
  );
  assert.equal(
    [...script.matchAll(/repairFieldDemoOwnerBinding\(/gu)].length,
    2,
    "repair must be invoked once after its exported definition",
  );
});

test("diagnosis and workflow evidence remain categorical and secret-free", () => {
  assert.match(
    script,
    /BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY/u,
  );
  assert.match(script, /await client\.query\("ROLLBACK"\)/u);
  assert.match(script, /"artifacts"[\s\S]*"field-demo-owner-binding-repair"/u);
  assert.match(script, /`\$\{operation\}-\$\{runId\}-\$\{runAttempt\}\.json`/u);
  assert.match(script, /mode: 0o700/u);
  assert.match(script, /mode: 0o600/u);
  assert.match(script, /await chmod\([^,]+, 0o600\)/u);
  assert.match(
    script,
    /console\.error\(formatSafeFieldDemoOwnerBindingError\(error\)\)/u,
  );
  assert.doesNotMatch(script, /console\.(?:log|error)\([^\n]*error\.message/u);
  assert.doesNotMatch(script, /JSON\.stringify\(error/u);

  const evidenceType = script.match(
    /type [A-Za-z]*Evidence = \{([\s\S]*?)\n\};/u,
  );
  assert.ok(evidenceType, "owner-binding evidence type must be explicit");
  assert.doesNotMatch(
    evidenceType[1],
    /^\s+(?:tenantId|tenant_id|userId|user_id|roleId|role_id|email|slug|domain|url|credential|metadata|details)\??:/gimu,
  );
  assert.match(evidenceType[1], /observedState/u);
  assert.match(evidenceType[1], /mutationAttempted/u);
});

test("workflow binds database credentials to an exact protected main operation", () => {
  assert.match(workflow, /^  workflow_dispatch:$/mu);
  assert.match(workflow, /^permissions:\n  contents: read$/mu);
  assert.match(
    workflow,
    /type: choice\n\s+options:\n\s+- diagnose\n\s+- repair/u,
  );
  assert.match(workflow, /group: veele-staging/u);
  assert.match(workflow, /cancel-in-progress: false/u);
  assert.match(workflow, /^    environment: staging$/mu);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/u);
  assert.match(workflow, /test "\$GITHUB_SHA" = "\$EXPECTED_MAIN_SHA"/u);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(workflow, /git\/ref\/heads\/main/u);
  assert.match(
    workflow,
    /Remote main advanced before owner-binding operation/u,
  );
  assert.match(workflow, /--moduleResolution Bundler/u);
  assert.match(workflow, /--strict/u);
  assert.match(
    workflow,
    /tsc[\s\\]+.*fieldgrid-staging-field-demo-owner-binding-repair\.mts/su,
  );

  const operationStep = workflow.indexOf(
    "- name: Diagnose or repair the exact staging owner-binding state",
  );
  const reverifyStep = workflow.indexOf(
    "- name: Reverify exact main immediately before owner-binding operation",
  );
  assert.ok(reverifyStep >= 0 && operationStep > reverifyStep);
  assert.doesNotMatch(
    workflow.slice(0, operationStep),
    /FIELDGRID_(?:RUNTIME|MIGRATION)_DATABASE_URL:\s*\$\{\{|NEXT_PUBLIC_SUPABASE_URL:\s*\$\{\{/u,
  );
  const operationEnd = workflow.indexOf("\n      - name:", operationStep + 1);
  const operationSource = workflow.slice(operationStep, operationEnd);
  assert.match(
    operationSource,
    /FIELDGRID_MIGRATION_DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/u,
  );
  assert.match(
    operationSource,
    /DATABASE_URL: \$\{\{ secrets\.FIELDGRID_RUNTIME_DATABASE_URL \}\}/u,
  );
  assert.match(
    operationSource,
    /NEXT_PUBLIC_SUPABASE_URL: \$\{\{ secrets\.NEXT_PUBLIC_SUPABASE_URL \}\}/u,
  );
  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE_KEY/u);
  assert.doesNotMatch(workflow, /systemctl|docker\s+(?:compose|run)|deploy/i);
  assert.match(workflow, /retention-days: 1/u);
  assert.match(
    workflow,
    /\*-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}\.json/u,
  );
});
