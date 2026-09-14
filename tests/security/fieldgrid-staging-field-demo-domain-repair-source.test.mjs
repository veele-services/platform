import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fieldDemoExistingOwnerQuery } from "../../scripts/fieldgrid-staging-existing-owner.mts";

const script = readFileSync(
  "scripts/fieldgrid-staging-field-demo-domain-repair.mts",
  "utf8",
).replaceAll("\r\n", "\n");
const workflow = readFileSync(
  ".github/workflows/fieldgrid-staging-field-demo-domain-repair.yml",
  "utf8",
).replaceAll("\r\n", "\n");

test("existing-owner SQL is read-only, tenant-bound and independent of bootstrap identity", () => {
  for (const selector of ["$1", "tenant.id", "target.id"]) {
    const sql = fieldDemoExistingOwnerQuery(selector);
    assert.ok(sql.includes(`membership.tenant_id = ${selector}`));
    assert.match(sql, /COUNT\(\*\) FROM owner_memberships\) = 1/u);
    assert.match(sql, /FROM public\.platform_users/u);
    assert.match(sql, /FROM public\.user_roles/u);
    assert.doesNotMatch(sql, /all_memberships|all_roles/u);
    assert.match(sql, /scoped_role\.tenant_id = assigned_role\.tenant_id/u);
    assert.match(
      sql,
      /scoped_membership\.tenant_id = assigned_role\.tenant_id/u,
    );
    assert.match(
      sql,
      /scoped_role\.id IS NULL OR scoped_membership\.user_id IS NULL/u,
    );
    assert.match(sql, /effective_role\.tenant_id = membership\.tenant_id/u);
    assert.match(
      sql,
      /effective_tenant_role\.tenant_id = effective_role\.tenant_id/u,
    );
    assert.match(
      sql,
      /legacy_role\.id IS NULL OR legacy_role\.name = 'Management'/u,
    );
    assert.doesNotMatch(
      sql,
      /\b(?:UPDATE|DELETE|INSERT|ALTER|DROP|GRANT|TRUNCATE)\b/iu,
    );
    assert.doesNotMatch(sql, /info@|cafccef6|raw_user_meta_data/u);
  }
  assert.throws(
    () => fieldDemoExistingOwnerQuery("untrusted-input"),
    /Unsupported/u,
  );
  assert.match(script, /fieldDemoExistingOwnerQuery\("target.id"\)/u);
});

test("legacy assessment follows the reconciled migration chain, not removed policies", () => {
  const closure = readFileSync(
    "lib/db/migrations/20260714120000_assignment_personnel_phase_b_direct_access_close.sql",
    "utf8",
  );
  assert.match(
    closure,
    /DROP POLICY IF EXISTS assignment_material_usage_backoffice_all/u,
  );
  const reconciliation = readFileSync(
    "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
    "utf8",
  );
  assert.match(
    reconciliation,
    /FROM public\.user_roles ur[\s\S]*r\.name = 'Management'/u,
  );
  const sql = fieldDemoExistingOwnerQuery("$1");
  assert.doesNotMatch(sql, /'Super Admin'|'Planning'|'Administratie'/u);
});

test("fresh bootstrap retains exclusive account conditions separately", () => {
  const proof = readFileSync(
    "scripts/fieldgrid-website-staging-proof-state.mts",
    "utf8",
  );
  const bootstrap = proof.slice(
    proof.indexOf("WHERE $2::uuid IS NULL OR ("),
    proof.indexOf("[runtime.tenantId, expectedOwnerUserId ?? null]"),
  );
  assert.match(bootstrap, /all_memberships\.user_id = \$2::uuid\) = 1/u);
  assert.match(bootstrap, /all_roles\.user_id = \$2::uuid\) = 1/u);
  assert.match(bootstrap, /legacy_role\.user_id = \$2::uuid/u);
});

test("domain repair is fixed to one known staging-only legacy transition", () => {
  assert.match(script, /fieldgrid-staging-field-demo-domain-repair-v1/u);
  assert.match(script, /olyfmekyqozxrbrwwszu/u);
  assert.match(script, /https:\/\/olyfmekyqozxrbrwwszu\.supabase\.co/u);
  assert.match(script, /LEGACY_FIELD_DEMO_HOST = "field-demo\.fieldgrid\.nl"/u);
  assert.match(script, /FIELD_DEMO_HOST/u);
  assert.match(script, /SET domain = \$2/u);
  assert.match(script, /AND domain = \$3/u);
  assert.match(script, /AND type = 'fieldgrid_subdomain'/u);
  assert.match(script, /AND is_primary = true/u);
  assert.match(script, /AND verification_status IN \('verified', 'active'\)/u);
  assert.match(script, /AND verified_at IS NOT NULL/u);
  assert.match(script, /AND disabled_at IS NULL/u);
  assert.match(script, /legacy domain migration was not singular/u);
  assert.doesNotMatch(script, /INSERT INTO public\.tenant_domains/u);
  assert.doesNotMatch(script, /DELETE FROM public\.tenant_domains/u);
  assert.doesNotMatch(
    script,
    /SET\s+(?:is_primary|verification_status|type)\s*=/u,
  );
});

test("repair locks, audits and revalidates without mutation retry", () => {
  assert.match(script, /BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE/u);
  assert.match(
    script,
    /pg_try_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/u,
  );
  assert.match(script, /FOR UPDATE/u);
  assert.match(script, /legacy_domain_check_count/u);
  assert.match(script, /website_site_count/u);
  assert.match(script, /website_binding_count/u);
  assert.match(script, /INSERT INTO public\.tenant_domain_checks/u);
  assert.match(script, /'automation_repair', 'passed'/u);
  assert.match(script, /legacy-domain-renamed/u);
  assert.match(script, /await client\.query\("COMMIT"\)/u);
  assert.match(
    script,
    /const freshSnapshot = await loadFieldDemoDomainSnapshot/u,
  );
  assert.doesNotMatch(
    script,
    /migrateLegacyDomain\([^)]*\).*migrateLegacyDomain\(/su,
  );
});

test("diagnosis is read-only and evidence is categorical and secret-free", () => {
  assert.match(
    script,
    /BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY/u,
  );
  assert.match(script, /await client\.query\("ROLLBACK"\)/u);
  assert.match(script, /mode: 0o700/u);
  assert.match(script, /mode: 0o600/u);
  assert.match(script, /await chmod\(outputPath, 0o600\)/u);
  assert.match(
    script,
    /console\.error\(formatSafeFieldDemoDomainError\(error\)\)/u,
  );
  assert.doesNotMatch(script, /console\.(?:log|error)\([^\n]*error\.message/u);
  assert.doesNotMatch(script, /JSON\.stringify\(error/u);

  const evidenceTypeStart = script.indexOf("type DomainEvidence = {");
  const evidenceTypeEnd = script.indexOf("};", evidenceTypeStart);
  const evidenceType = script.slice(evidenceTypeStart, evidenceTypeEnd);
  assert.ok(evidenceTypeStart >= 0 && evidenceTypeEnd > evidenceTypeStart);
  assert.doesNotMatch(
    evidenceType,
    /^\s+(?:tenantId|tenant_id|domain|host|email|url|credential|metadata|details)\??:/gimu,
  );
  assert.match(evidenceType, /observedState/u);
  assert.match(evidenceType, /observedShape/u);
  assert.match(evidenceType, /mutationAttempted/u);
});

test("workflow binds credentials to exact protected main after static checks", () => {
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
  assert.match(workflow, /Remote main advanced before domain operation/u);
  assert.match(workflow, /--moduleResolution Bundler/u);
  assert.match(workflow, /--strict/u);
  assert.match(
    workflow,
    /tsc[\s\\]+.*fieldgrid-staging-field-demo-domain-repair\.mts/su,
  );

  const applyStep = workflow.indexOf(
    "- name: Diagnose or repair the exact staging domain state",
  );
  const reverifyStep = workflow.indexOf(
    "- name: Reverify exact main immediately before domain operation",
  );
  assert.ok(reverifyStep >= 0 && applyStep > reverifyStep);
  assert.doesNotMatch(
    workflow.slice(0, applyStep),
    /FIELDGRID_MIGRATION_DATABASE_URL:\s*\$\{\{/u,
  );
  const applyEnd = workflow.indexOf("\n      - name:", applyStep + 1);
  const applySource = workflow.slice(applyStep, applyEnd);
  assert.match(
    applySource,
    /FIELDGRID_MIGRATION_DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/u,
  );
  assert.match(
    applySource,
    /DATABASE_URL: \$\{\{ secrets\.FIELDGRID_RUNTIME_DATABASE_URL \}\}/u,
  );
  assert.doesNotMatch(workflow, /SUPABASE_SERVICE_ROLE_KEY/u);
  assert.doesNotMatch(workflow, /systemctl|docker\s+(?:compose|run)|deploy/i);
  assert.match(workflow, /retention-days: 1/u);
});
