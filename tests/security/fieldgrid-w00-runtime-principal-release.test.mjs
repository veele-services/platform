import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { assertExactCheckoutSha } from "../../scripts/fieldgrid-w00-runtime-principal.mjs";

const expectedSha = "a".repeat(40);
const otherSha = "b".repeat(40);

function releaseFixture(context) {
  const baseDir = mkdtempSync(path.join(tmpdir(), "fieldgrid-release-sha-"));
  context.after(() => rmSync(baseDir, { recursive: true, force: true }));
  const root = path.join(baseDir, "releases", `20260920120000-${expectedSha.slice(0, 7)}`);
  mkdirSync(root, { recursive: true });
  const markerPath = path.join(root, ".fieldgrid-release-sha");
  writeFileSync(markerPath, `${expectedSha}\n`);
  return {
    root,
    markerPath,
    env: {
      FIELDGRID_RUNTIME_EXPECTED_SHA: expectedSha,
      BASE_DIR: baseDir,
      RELEASE: root,
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_REPOSITORY: "veele-services/platform",
      GITHUB_SHA: expectedSha,
      GITHUB_REF: "refs/heads/staging",
      APP_ENV: "staging",
      TARGET_ENVIRONMENT: "staging",
      DEPLOYMENT_MODE: "normal",
      DEPLOY_CONFIRMATION: "fieldgrid-staging-deploy-exact-sha",
      EXPECTED_STAGING_SHA: expectedSha,
    },
  };
}

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

test("a deployment copy without Git verifies its exact workflow-written release marker", (context) => {
  const fixture = releaseFixture(context);
  assert.equal(assertExactCheckoutSha(fixture.env, fixture), expectedSha);
  writeFileSync(fixture.markerPath, expectedSha);
  assert.equal(assertExactCheckoutSha(fixture.env, fixture), expectedSha);
});

test("recovery release verification binds the main dispatch SHA separately from staging", (context) => {
  const fixture = releaseFixture(context);
  const env = {
    ...fixture.env,
    DEPLOYMENT_MODE: "staging-recovery",
    DEPLOY_CONFIRMATION: "staging-recovery-only",
    GITHUB_REF: "refs/heads/main",
    EXPECTED_STAGING_SHA: otherSha,
  };
  assert.equal(assertExactCheckoutSha(env, fixture), expectedSha);
  assert.throws(() => assertExactCheckoutSha({ ...env, EXPECTED_STAGING_SHA: expectedSha }, fixture));
});

test("release markers cannot bypass dispatch identity or staging scope", (context) => {
  const fixture = releaseFixture(context);
  const invalidBindings = {
    FIELDGRID_RUNTIME_EXPECTED_SHA: "not-a-commit",
    GITHUB_ACTIONS: "false",
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_REPOSITORY: "other/repository",
    GITHUB_SHA: otherSha,
    GITHUB_REF: "refs/heads/main",
    APP_ENV: "production",
    TARGET_ENVIRONMENT: "production",
    DEPLOYMENT_MODE: "unknown",
    DEPLOY_CONFIRMATION: "other-confirmation",
    EXPECTED_STAGING_SHA: otherSha,
    BASE_DIR: path.dirname(fixture.env.BASE_DIR),
    RELEASE: path.dirname(fixture.root),
  };
  for (const [name, value] of Object.entries(invalidBindings)) {
    assert.throws(
      () => assertExactCheckoutSha({ ...fixture.env, [name]: value }, fixture),
      `${name} must fail closed`,
    );
  }
  for (const name of Object.keys(fixture.env)) {
    const env = { ...fixture.env };
    delete env[name];
    assert.throws(() => assertExactCheckoutSha(env, fixture), `${name} is required`);
  }
});

test("release source rejects missing, mismatched, malformed and indirect SHA markers", (context) => {
  const fixture = releaseFixture(context);
  for (const content of ["", otherSha, `${expectedSha}\r`, `${expectedSha} `, `${expectedSha}\n\n`, "x".repeat(200)]) {
    writeFileSync(fixture.markerPath, content);
    assert.throws(() => assertExactCheckoutSha(fixture.env, fixture));
  }
  rmSync(fixture.markerPath);
  assert.throws(() => assertExactCheckoutSha(fixture.env, fixture));
  mkdirSync(fixture.markerPath);
  assert.throws(() => assertExactCheckoutSha(fixture.env, fixture));
  rmSync(fixture.markerPath, { recursive: true });
  const externalMarker = path.join(fixture.env.BASE_DIR, "external-marker");
  writeFileSync(externalMarker, expectedSha);
  symlinkSync(externalMarker, fixture.markerPath);
  assert.throws(() => assertExactCheckoutSha(fixture.env, fixture));
});

test("release identity cannot borrow a marker from another release path or a symlink", (context) => {
  const fixture = releaseFixture(context);
  for (const name of ["arbitrary-directory", `20260920120000-${otherSha.slice(0, 7)}`]) {
    const root = path.join(fixture.env.BASE_DIR, "releases", name);
    mkdirSync(root);
    writeFileSync(path.join(root, ".fieldgrid-release-sha"), expectedSha);
    assert.throws(() => assertExactCheckoutSha({ ...fixture.env, RELEASE: root }, { root }));
  }
  const link = path.join(fixture.env.BASE_DIR, "release-link");
  symlinkSync(fixture.root, link);
  assert.throws(() => assertExactCheckoutSha({ ...fixture.env, RELEASE: link }, { root: link }));
});

test("Git checkout identity takes precedence and cannot fall back to a matching marker", (context) => {
  const fixture = releaseFixture(context);
  git(fixture.root, "init", "--initial-branch=test");
  git(fixture.root, "-c", "user.name=Fieldgrid Test", "-c", "user.email=release@example.test", "commit", "--allow-empty", "-m", "fixture");
  const sha = git(fixture.root, "rev-parse", "HEAD");
  assert.equal(assertExactCheckoutSha({ FIELDGRID_RUNTIME_EXPECTED_SHA: sha }, fixture), sha);
  assert.throws(() => assertExactCheckoutSha(fixture.env, fixture), /checkout does not match/u);
  rmSync(path.join(fixture.root, ".git"), { recursive: true });
  mkdirSync(path.join(fixture.root, ".git"));
  assert.throws(() => assertExactCheckoutSha(fixture.env, fixture));
});

test("Git worktrees retain exact checkout verification", (context) => {
  const fixture = releaseFixture(context);
  git(fixture.root, "init", "--initial-branch=test");
  git(fixture.root, "-c", "user.name=Fieldgrid Test", "-c", "user.email=release@example.test", "commit", "--allow-empty", "-m", "fixture");
  const sha = git(fixture.root, "rev-parse", "HEAD");
  const worktree = path.join(fixture.env.BASE_DIR, "worktree");
  git(fixture.root, "worktree", "add", "--detach", worktree, sha);
  assert.equal(assertExactCheckoutSha({ FIELDGRID_RUNTIME_EXPECTED_SHA: sha }, { root: worktree }), sha);
});

test("deploy reports every missing tenant binding before building, without revealing values", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8");
  const start = workflow.indexOf("      - name: Validate service configuration");
  const end = workflow.indexOf("          require_pair()", start);
  const step = workflow.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.ok(start < workflow.indexOf("      - name: Prepare release directory"));
  assert.ok(start < workflow.indexOf("      - name: Build"));
  const script = step.slice(step.indexOf("        run: |") + "        run: |".length);
  const env = {
    PATH: process.env.PATH,
    FIELDGRID_W00_STAGING_TENANT_A_HOST: "private-tenant-a.example.test",
    FIELDGRID_W00_STAGING_TENANT_B_HOST: "private-tenant-b.example.test",
  };
  const missing = spawnSync("bash", [], { input: script, encoding: "utf8", env });
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, "");
  assert.equal(missing.stderr,
    "::error::Missing required staging binding: FIELDGRID_W00_STAGING_TENANT_A_ID\n"
      + "::error::Missing required staging binding: FIELDGRID_W00_STAGING_TENANT_B_ID\n");
  const complete = spawnSync("bash", [], {
    input: script,
    encoding: "utf8",
    env: {
      ...env,
      FIELDGRID_W00_STAGING_TENANT_A_ID: "private-tenant-a-id",
      FIELDGRID_W00_STAGING_TENANT_B_ID: "private-tenant-b-id",
    },
  });
  assert.equal(complete.status, 0);
  assert.equal(complete.stdout + complete.stderr, "");
});
