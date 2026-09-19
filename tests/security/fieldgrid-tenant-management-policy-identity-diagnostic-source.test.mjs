import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("exact-head workflow command executes and rejects unvalidated runs without network", () => {
  const step = workflow.split("- name: Require successful exact-head validation")[1]
    .split("- name: Install exact pinned database root certificate")[0];
  const shell = step.split("run: |\n")[1].split("\n")
    .map((line) => line.replace(/^          /u, "")).join("\n");
  const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  assert.equal(head.status, 0);
  const directory = mkdtempSync(join(tmpdir(), "fieldgrid-validation-command-"));
  const preload = join(directory, "fetch-fixture.mjs");
  const called = join(directory, "called");
  writeFileSync(preload, `
    import { writeFileSync } from 'node:fs';
    globalThis.fetch = async (url, options) => {
      const sha = process.env.EXPECTED_MAIN_SHA;
      const expected = 'https://api.github.com/repos/veele-services/platform/actions/workflows/main-exact-head-validation.yml/runs?branch=main&head_sha=' + sha + '&per_page=100';
      if (url !== expected || options.headers.Authorization !== 'Bearer synthetic-validation-token') {
        throw new Error('fixture request mismatch');
      }
      writeFileSync(process.env.FIXTURE_CALLED, 'called');
      const scenario = process.env.FIXTURE_SCENARIO;
      if (scenario === 'network-error') throw new Error('synthetic-sensitive-driver-detail');
      return { ok: scenario !== 'http-error', json: async () => ({ total_count: 1, workflow_runs: [{
        id: 1, head_sha: scenario === 'wrong-head' ? '0'.repeat(40) : sha,
        head_branch: 'main', path: '.github/workflows/main-exact-head-validation.yml',
        name: 'Main Exact Head Validation', event: 'push',
        head_repository: { full_name: 'veele-services/platform' },
        status: scenario === 'pending' ? 'in_progress' : 'completed',
        conclusion: scenario === 'skipped' ? 'skipped' : 'success',
      }] }) };
    };
  `);
  try {
    for (const scenario of ["success", "pending", "skipped", "wrong-head", "http-error", "network-error"]) {
      rmSync(called, { force: true });
      const result = spawnSync("bash", ["--noprofile", "--norc", "-c", shell], {
        encoding: "utf8", timeout: 30_000,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_OPTIONS: `--import=${preload}`,
          EXPECTED_MAIN_SHA: head.stdout.trim(),
          GITHUB_REPOSITORY: "veele-services/platform",
          GITHUB_TOKEN: "synthetic-validation-token",
          FIXTURE_SCENARIO: scenario,
          FIXTURE_CALLED: called,
        },
      });
      assert.equal(result.error, undefined, scenario);
      assert.equal(result.status, scenario === "success" ? 0 : 1, scenario);
      assert.equal(existsSync(called), true, `${scenario}: command must reach validation`);
      assert.doesNotMatch(result.stdout + result.stderr, /synthetic-sensitive-driver-detail/u);
      if (scenario !== "success") assert.match(result.stderr, /Exact-head validation failed/u);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
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
