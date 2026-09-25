import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  CONTRACT,
  PRODUCTION_PROJECT_REF,
  STAGING_PROJECT_REF,
  validateBootstrapDispatch,
} from "../scripts/staging-migration-admin/contract.mjs";
import {
  runApply,
  runPlan,
} from "../scripts/staging-migration-admin/runner.mjs";
import { verifyRestoredStagingHealth } from "../scripts/staging-migration-admin/health.mjs";

const MAIN = "a".repeat(40);
const STAGING = "b".repeat(40);
const SECRET = "0123456789abcdef".repeat(4);

function environment(mode = "apply") {
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REPOSITORY: "veele-services/platform",
    GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: MAIN,
    EXPECTED_MAIN_SHA: MAIN,
    EXPECTED_STAGING_SHA: STAGING,
    APP_ENV: "staging",
    TARGET_ENVIRONMENT: "staging",
    EXPECTED_SUPABASE_PROJECT_REF: STAGING_PROJECT_REF,
    FORBIDDEN_SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF,
    BOOTSTRAP_CONFIRMATION: `${CONTRACT}:${STAGING_PROJECT_REF}:${MAIN}`,
    FIELDGRID_MIGRATION_DATABASE_PASSWORD:
      mode === "apply" ? SECRET : undefined,
  };
}

function fixtures({
  targetFailure = false,
  applyFailure = false,
  commitAmbiguous = false,
  healthFailure = false,
  safeStopFailure = false,
  restoreFailure = false,
} = {}) {
  const calls = [];
  const legacy = {
    async connect() {
      calls.push("legacy.connect");
    },
    async end() {
      calls.push("legacy.end");
    },
  };
  const target = {
    async connect() {
      calls.push("target.connect");
    },
    async end() {
      calls.push("target.end");
    },
  };
  const states = [{ unit: "veele-staging.service", active: true, pid: 17 }];
  const services = {
    async inventory() {
      calls.push("services.inventory");
      return states;
    },
    async stop() {
      calls.push("services.stop");
    },
    async restore() {
      calls.push("services.restore");
      if (restoreFailure) throw new Error("synthetic restore failure");
    },
    async safeStop() {
      calls.push("services.safeStop");
      if (safeStopFailure) throw new Error("synthetic safe-stop failure");
    },
  };
  return {
    calls,
    deps: {
      validateLegacyConnection() {
        return { legacy: "redacted", poolerHost: "pooler.example", ssl: {} };
      },
      createLegacyClient() {
        return legacy;
      },
      createTargetClient() {
        return target;
      },
      async bootstrapPlan() {
        calls.push("database.plan");
        return {
          principal: { name: "postgres" },
          targetRoleExists: false,
          managedCatalogDigest: "a".repeat(64),
        };
      },
      async drainApplicationWriters() {
        calls.push("database.drain");
      },
      async applyBootstrap(_client, password) {
        calls.push("database.apply");
        assert.equal(password, SECRET);
        if (applyFailure) throw new Error("synthetic precommit failure");
        if (commitAmbiguous) {
          const error = new Error("synthetic uncertain commit");
          error.bootstrapCommitAttempted = true;
          throw error;
        }
        return {
          legacyPrincipal: "postgres",
          managedCatalogDigest: "a".repeat(64),
          runtimeMembershipDigest: "b".repeat(64),
          applicationObjectCount: 9,
          securityDefinerCompatibilityOwner: "postgres",
        };
      },
      async verifyTargetLogin() {
        calls.push("database.targetProof");
        if (targetFailure) throw new Error("synthetic postcommit failure");
        return {
          principal: "fieldgrid_migration_admin",
          applicationSchemas: ["app_private", "drizzle", "public"],
          dryRebuildCapability: true,
          authorizedProviderCompatibility: {
            realtimePublicationOwner: "fieldgrid_migration_admin",
            authSchemaUsage: true,
            authUsersSelectColumns: ["email", "id", "raw_app_meta_data"],
          },
        };
      },
      async verifyRestoredHealth({ expectedSha }) {
        calls.push("services.health");
        assert.equal(expectedSha, STAGING);
        if (healthFailure) throw new Error("synthetic health failure");
        return { endpointCount: 4, releaseSha: expectedSha };
      },
      services,
    },
  };
}

test("dispatch is exact-main, staging-only and apply confirmation is fail-closed", () => {
  assert.equal(
    validateBootstrapDispatch(environment(), { mode: "apply" }).expectedMain,
    MAIN,
  );
  for (const [key, value] of [
    ["GITHUB_REF", "refs/heads/staging"],
    ["EXPECTED_SUPABASE_PROJECT_REF", PRODUCTION_PROJECT_REF],
    ["BOOTSTRAP_CONFIRMATION", "wrong"],
    ["FIELDGRID_MIGRATION_DATABASE_PASSWORD", "not-64-hex"],
  ]) {
    const env = environment();
    env[key] = value;
    assert.throws(() => validateBootstrapDispatch(env, { mode: "apply" }));
  }
});

test("plan is read-only and does not require the new password", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fieldgrid-bootstrap-plan-"));
  const { calls, deps } = fixtures();
  const result = await runPlan({
    env: environment("plan"),
    outputDir: directory,
    deps,
  });
  assert.equal(result.mutationsPerformed, false);
  assert.deepEqual(calls, ["legacy.connect", "database.plan", "legacy.end"]);
  assert.doesNotMatch(
    await readFile(join(directory, "result.json"), "utf8"),
    /password|DATABASE_URL/iu,
  );
});

test("apply quiesces writers, proves the real target login and restores the baseline", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fieldgrid-bootstrap-apply-"));
  const { calls, deps } = fixtures();
  const result = await runApply({
    env: environment(),
    outputDir: directory,
    receiptPath: join(directory, "private", "receipt.json"),
    deps,
  });
  assert.equal(result.status, "passed");
  assert.equal(result.servicesRestored, true);
  assert.deepEqual(result.authorizedProviderCompatibility, {
    realtimePublicationOwner: "fieldgrid_migration_admin",
    authSchemaUsage: true,
    authUsersSelectColumns: ["email", "id", "raw_app_meta_data"],
  });
  assert.deepEqual(calls, [
    "legacy.connect",
    "database.plan",
    "services.inventory",
    "services.stop",
    "database.drain",
    "database.apply",
    "target.connect",
    "database.targetProof",
    "target.end",
    "services.restore",
    "services.inventory",
    "services.health",
    "legacy.end",
  ]);
  const evidence = await readFile(join(directory, "result.json"), "utf8");
  assert.doesNotMatch(evidence, new RegExp(SECRET, "u"));
  assert.doesNotMatch(evidence, /postgresql:\/\//u);
});

test("precommit failure restores services; postcommit proof failure remains safe-stopped", async (t) => {
  await t.test("precommit", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "fieldgrid-bootstrap-fail-"),
    );
    const { calls, deps } = fixtures({ applyFailure: true });
    await assert.rejects(
      runApply({
        env: environment(),
        receiptPath: join(directory, "receipt.json"),
        deps,
      }),
    );
    assert.ok(calls.includes("services.restore"));
    assert.equal(calls.includes("services.safeStop"), false);
  });
  await t.test("postcommit", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "fieldgrid-bootstrap-fail-"),
    );
    const { calls, deps } = fixtures({ targetFailure: true });
    await assert.rejects(
      runApply({
        env: environment(),
        receiptPath: join(directory, "receipt.json"),
        deps,
      }),
    );
    assert.ok(calls.includes("services.safeStop"));
    assert.equal(calls.includes("services.restore"), false);
    const receiptText = await readFile(join(directory, "receipt.json"), "utf8");
    assert.doesNotMatch(receiptText, new RegExp(SECRET, "u"));
    assert.deepEqual(JSON.parse(receiptText).originalServices, [
      { unit: "veele-staging.service", active: true },
    ]);
  });
  await t.test("failed precommit restore requires recovery", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "fieldgrid-bootstrap-fail-"),
    );
    const { deps } = fixtures({ applyFailure: true, restoreFailure: true });
    await assert.rejects(
      runApply({
        env: environment(),
        receiptPath: join(directory, "receipt.json"),
        deps,
      }),
    );
    const receipt = JSON.parse(
      await readFile(join(directory, "receipt.json"), "utf8"),
    );
    assert.equal(receipt.phase, "RECOVERY_REQUIRED");
    assert.equal(receipt.recoveryFailureCode, "WRITER_RESTORE_FAILED");
  });
  await t.test("uncertain commit", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "fieldgrid-bootstrap-fail-"),
    );
    const { calls, deps } = fixtures({ commitAmbiguous: true });
    await assert.rejects(
      runApply({
        env: environment(),
        receiptPath: join(directory, "receipt.json"),
        deps,
      }),
    );
    assert.ok(calls.includes("services.safeStop"));
    assert.equal(calls.includes("services.restore"), false);
    const receipt = JSON.parse(
      await readFile(join(directory, "receipt.json"), "utf8"),
    );
    assert.equal(receipt.phase, "SAFE_STOPPED");
    assert.equal(receipt.mutationsPerformed, true);
  });
  await t.test("restored-but-unhealthy staging", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "fieldgrid-bootstrap-fail-"),
    );
    const { calls, deps } = fixtures({ healthFailure: true });
    await assert.rejects(
      runApply({
        env: environment(),
        receiptPath: join(directory, "receipt.json"),
        deps,
      }),
    );
    assert.ok(calls.includes("services.restore"));
    assert.ok(calls.includes("services.health"));
    assert.ok(calls.includes("services.safeStop"));
  });
  await t.test(
    "unproven safe-stop is reported as recovery required",
    async () => {
      const directory = await mkdtemp(
        join(tmpdir(), "fieldgrid-bootstrap-fail-"),
      );
      const { deps } = fixtures({ targetFailure: true, safeStopFailure: true });
      await assert.rejects(
        runApply({
          env: environment(),
          receiptPath: join(directory, "receipt.json"),
          deps,
        }),
      );
      const receipt = JSON.parse(
        await readFile(join(directory, "receipt.json"), "utf8"),
      );
      assert.equal(receipt.phase, "RECOVERY_REQUIRED");
      assert.equal(receipt.servicesSafeStopped, false);
      assert.equal(receipt.recoveryFailureCode, "WRITER_SAFE_STOP_FAILED");
      assert.deepEqual(receipt.originalServices, [
        { unit: "veele-staging.service", active: true },
      ]);
    },
  );
});

test("restored health proves all four staging runtime identities with bounded retry", async () => {
  const calls = [];
  const waits = [];
  let failures = 1;
  const result = await verifyRestoredStagingHealth({
    expectedSha: STAGING,
    attempts: 2,
    retryMilliseconds: 1,
    probe(options) {
      calls.push(options);
      if (failures > 0) {
        failures -= 1;
        throw new Error("not ready");
      }
    },
    async wait(milliseconds) {
      waits.push(milliseconds);
    },
  });
  assert.deepEqual(result, { endpointCount: 4, releaseSha: STAGING });
  assert.deepEqual(waits, [1]);
  assert.deepEqual(
    calls.slice(-4).map(({ service }) => service),
    ["backoffice", "personnel", "customer", "api"],
  );
  assert.ok(
    calls
      .slice(-4)
      .every(
        ({ environment: target, sha, url }) =>
          target === "staging" &&
          sha === STAGING &&
          url.startsWith("https://staging.fieldgrid.nl/"),
      ),
  );
});
