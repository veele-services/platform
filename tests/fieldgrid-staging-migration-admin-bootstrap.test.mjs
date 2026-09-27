import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  CONTRACT,
  PRODUCTION_PROJECT_REF,
  RECOVERY_CONTRACT,
  STAGING_PROJECT_REF,
  validateBootstrapDispatch,
} from "../scripts/staging-migration-admin/contract.mjs";
import {
  runApply,
  runPlan,
  runRecover,
} from "../scripts/staging-migration-admin/runner.mjs";
import { repairCommittedTargetSchemaPrivileges } from "../scripts/staging-migration-admin/database.mjs";
import { verifyRestoredStagingHealth } from "../scripts/staging-migration-admin/health.mjs";

const MAIN = "a".repeat(40);
const STAGING = "b".repeat(40);
const RECOVERY_SOURCE_MAIN = "c".repeat(40);
const MANAGED_CATALOG_DIGEST = "a".repeat(64);
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
    BOOTSTRAP_CONFIRMATION:
      mode === "recover"
        ? `${RECOVERY_CONTRACT}:${STAGING_PROJECT_REF}:${RECOVERY_SOURCE_MAIN}:${MAIN}:${STAGING}:${MANAGED_CATALOG_DIGEST}`
        : `${CONTRACT}:${STAGING_PROJECT_REF}:${MAIN}`,
    RECOVERY_SOURCE_MAIN_SHA:
      mode === "recover" ? RECOVERY_SOURCE_MAIN : undefined,
    EXPECTED_MANAGED_CATALOG_DIGEST:
      mode === "recover" ? MANAGED_CATALOG_DIGEST : undefined,
    FIELDGRID_MIGRATION_DATABASE_PASSWORD:
      mode === "apply" || mode === "recover" ? SECRET : undefined,
  };
}

test("target SQL failures carry an exact secret-free recovery stage", async () => {
  const client = {
    async query(sql) {
      if (sql.includes("FROM pg_roles WHERE rolname=current_user")) {
        return {
          rows: [
            {
              current_user: "fieldgrid_migration_admin",
              session_user: "fieldgrid_migration_admin",
            },
          ],
        };
      }
      if (sql.includes("FROM pg_namespace n WHERE n.nspname=ANY")) {
        return {
          rows: ["app_private", "drizzle", "public"].map((nspname) => ({
            nspname,
            owner: "fieldgrid_migration_admin",
          })),
        };
      }
      if (sql.includes('GRANT USAGE,CREATE ON SCHEMA "drizzle"')) {
        const error = new Error("synthetic permission failure");
        error.code = "42501";
        throw error;
      }
      return { rows: [] };
    },
  };
  await assert.rejects(
    repairCommittedTargetSchemaPrivileges(client),
    (error) => {
      assert.equal(error.code, "42501");
      assert.equal(
        error.bootstrapFailureStage,
        "target-repair-schema-grant-drizzle",
      );
      return true;
    },
  );
});

function fixtures({
  targetFailure = false,
  applyFailure = false,
  commitAmbiguous = false,
  healthFailure = false,
  safeStopFailure = false,
  restoreFailure = false,
  initiallyStopped = false,
  planFailure = false,
  inventoryFailure = false,
  committedState,
  stopFailure = false,
  managedCatalogDigest = MANAGED_CATALOG_DIGEST,
} = {}) {
  const calls = [];
  let currentActive = !initiallyStopped;
  let planCalls = 0;
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
  const states = () => [
    {
      unit: "veele-staging.service",
      active: currentActive,
      pid: currentActive ? 17 : 0,
    },
  ];
  const services = {
    async inventory() {
      calls.push("services.inventory");
      if (inventoryFailure) throw new Error("synthetic inventory failure");
      return states();
    },
    async stop() {
      calls.push("services.stop");
      currentActive = false;
      if (stopFailure) throw new Error("synthetic stop failure");
    },
    async restore(baseline) {
      calls.push("services.restore");
      if (restoreFailure) throw new Error("synthetic restore failure");
      currentActive = baseline[0].active;
    },
    async safeStop() {
      calls.push("services.safeStop");
      if (safeStopFailure) throw new Error("synthetic safe-stop failure");
      currentActive = false;
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
        if (planFailure) throw new Error("synthetic plan failure");
        planCalls += 1;
        const committed =
          (commitAmbiguous && planCalls > 1) ||
          (committedState ?? initiallyStopped);
        return {
          principal: { name: "postgres" },
          applicationSchemas: ["app_private", "drizzle", "public"].map(
            (schemaName) => ({
              schema_name: schemaName,
              owner: committed ? "fieldgrid_migration_admin" : "postgres",
            }),
          ),
          applicationRelationOwners: [
            {
              schema_name: "public",
              relkind: "r",
              owner: committed ? "fieldgrid_migration_admin" : "postgres",
              count: 1,
            },
          ],
          applicationRoutineOwners: [
            {
              schema_name: "public",
              prokind: "f",
              prosecdef: false,
              owner: committed ? "fieldgrid_migration_admin" : "postgres",
              count: 1,
            },
            {
              schema_name: "public",
              prokind: "f",
              prosecdef: true,
              owner: "postgres",
              count: 1,
            },
          ],
          targetRoleExists: committed,
          targetRole: committed
            ? {
                rolname: "fieldgrid_migration_admin",
                rolsuper: false,
                rolbypassrls: false,
                rolcreaterole: true,
                rolcreatedb: false,
                rolreplication: false,
                rolinherit: false,
                rolcanlogin: true,
              }
            : null,
          runtimeMembership: [],
          managedCatalogDigest,
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
          managedCatalogDigest,
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
            authDirectAccess: false,
          },
        };
      },
      async repairCommittedTargetSchemaPrivileges() {
        calls.push("database.repairTargetSchemaPrivileges");
        return {
          repairedSchemas: ["app_private", "drizzle", "public"],
        };
      },
      async repairCommittedLegacyPrivileges() {
        calls.push("database.repairLegacyPrivileges");
        return {
          databasePrivileges: ["CONNECT", "CREATE", "TEMPORARY"],
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
  assert.equal(
    validateBootstrapDispatch(environment("recover"), { mode: "recover" })
      .recoverySourceMain,
    RECOVERY_SOURCE_MAIN,
  );
  for (const [key, value] of [
    ["RECOVERY_SOURCE_MAIN_SHA", "not-a-sha"],
    ["EXPECTED_MANAGED_CATALOG_DIGEST", "not-a-digest"],
    ["BOOTSTRAP_CONFIRMATION", "wrong"],
  ]) {
    const env = environment("recover");
    env[key] = value;
    assert.throws(() => validateBootstrapDispatch(env, { mode: "recover" }));
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
    authDirectAccess: false,
  });
  assert.deepEqual(calls, [
    "legacy.connect",
    "services.inventory",
    "database.plan",
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

test("recover resumes only an exact SAFE_STOPPED receipt and never reruns ownership DDL", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "fieldgrid-bootstrap-recover-"),
  );
  const receiptPath = join(directory, "private", "receipt.json");
  await mkdir(join(directory, "private"), { recursive: true });
  await writeFile(
    receiptPath,
    `${JSON.stringify({
      contract: CONTRACT,
      repository: "veele-services/platform",
      environment: "staging",
      project: STAGING_PROJECT_REF,
      operation: "apply",
      expectedMainSha: RECOVERY_SOURCE_MAIN,
      expectedStagingSha: STAGING,
      destructive: true,
      status: "failed",
      mutationsPerformed: true,
      phase: "SAFE_STOPPED",
      failureCode: "42501",
      servicesSafeStopped: true,
      originalServices: [{ unit: "veele-staging.service", active: true }],
    })}\n`,
    { mode: 0o600 },
  );
  const { calls, deps } = fixtures({ initiallyStopped: true });
  const result = await runRecover({
    env: environment("recover"),
    outputDir: directory,
    receiptPath,
    deps,
  });
  assert.equal(result.status, "passed");
  assert.equal(result.resumedFromSafeStopped, true);
  assert.equal(result.servicesRestored, true);
  assert.equal(result.legacyPrivilegesRepaired, true);
  assert.equal(result.targetSchemaPrivilegesRepaired, true);
  assert.equal(calls.includes("database.apply"), false);
  assert.ok(calls.includes("database.repairLegacyPrivileges"));
  assert.ok(calls.includes("database.repairTargetSchemaPrivileges"));
  assert.ok(calls.includes("database.targetProof"));
  assert.ok(calls.includes("services.restore"));
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  assert.equal(receipt.phase, "COMPLETE");
  assert.deepEqual(receipt.originalServices, [
    { unit: "veele-staging.service", active: true },
  ]);
});

test("recover re-fences an unexpectedly restarted writer before catalog proof", async (t) => {
  for (const stopFailure of [false, true]) {
    await t.test(stopFailure ? "stop failure" : "writer stopped", async () => {
      const directory = await mkdtemp(
        join(tmpdir(), "fieldgrid-bootstrap-recover-"),
      );
      const receiptPath = join(directory, "receipt.json");
      await writeFile(
        receiptPath,
        `${JSON.stringify({
          contract: CONTRACT,
          repository: "veele-services/platform",
          environment: "staging",
          project: STAGING_PROJECT_REF,
          operation: "apply",
          expectedMainSha: RECOVERY_SOURCE_MAIN,
          expectedStagingSha: STAGING,
          destructive: true,
          status: "failed",
          mutationsPerformed: true,
          phase: "SAFE_STOPPED",
          failureCode: "42501",
          servicesSafeStopped: true,
          originalServices: [{ unit: "veele-staging.service", active: true }],
        })}\n`,
        { mode: 0o600 },
      );
      const { calls, deps } = fixtures({
        committedState: true,
        stopFailure,
      });
      if (stopFailure) {
        await assert.rejects(
          runRecover({ env: environment("recover"), receiptPath, deps }),
          /synthetic stop failure/u,
        );
        assert.ok(calls.includes("services.safeStop"));
        assert.equal(calls.includes("database.plan"), false);
        assert.equal(calls.includes("database.targetProof"), false);
        const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
        assert.equal(receipt.phase, "SAFE_STOPPED");
        assert.deepEqual(receipt.originalServices, [
          { unit: "veele-staging.service", active: true },
        ]);
      } else {
        const result = await runRecover({
          env: environment("recover"),
          receiptPath,
          deps,
        });
        assert.equal(result.status, "passed");
        assert.ok(
          calls.indexOf("services.stop") < calls.indexOf("database.plan"),
        );
        assert.ok(
          calls.indexOf("database.plan") <
            calls.indexOf("database.targetProof"),
        );
        assert.equal(calls.includes("database.apply"), false);
      }
    });
  }
});

test("recover rejects a mismatched receipt without restoring services", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "fieldgrid-bootstrap-recover-"),
  );
  const receiptPath = join(directory, "receipt.json");
  await writeFile(
    receiptPath,
    `${JSON.stringify({
      contract: CONTRACT,
      expectedMainSha: "d".repeat(40),
      expectedStagingSha: STAGING,
      status: "failed",
      mutationsPerformed: true,
      phase: "SAFE_STOPPED",
      servicesSafeStopped: true,
      originalServices: [{ unit: "veele-staging.service", active: true }],
    })}\n`,
    { mode: 0o600 },
  );
  const { calls, deps } = fixtures({ initiallyStopped: true });
  await assert.rejects(
    runRecover({
      env: environment("recover"),
      receiptPath,
      deps,
    }),
    /BOOTSTRAP_RECEIPT_BINDING_INVALID/u,
  );
  assert.equal(calls.includes("services.restore"), false);
  assert.equal(calls.includes("database.apply"), false);
});

test("apply refuses to overwrite a SAFE_STOPPED receipt baseline", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "fieldgrid-bootstrap-recover-"),
  );
  const receiptPath = join(directory, "receipt.json");
  const originalReceipt = `${JSON.stringify({
    contract: CONTRACT,
    repository: "veele-services/platform",
    environment: "staging",
    project: STAGING_PROJECT_REF,
    operation: "apply",
    expectedMainSha: MAIN,
    expectedStagingSha: STAGING,
    destructive: true,
    status: "failed",
    mutationsPerformed: true,
    phase: "SAFE_STOPPED",
    failureCode: "42501",
    servicesSafeStopped: true,
    originalServices: [{ unit: "veele-staging.service", active: true }],
  })}\n`;
  await writeFile(receiptPath, originalReceipt, { mode: 0o600 });
  const { calls, deps } = fixtures({ initiallyStopped: true });
  await assert.rejects(
    runApply({ env: environment(), outputDir: directory, receiptPath, deps }),
    /BOOTSTRAP_RECOVERY_MODE_REQUIRED/u,
  );
  assert.equal(calls.includes("services.stop"), false);
  assert.equal(calls.includes("database.apply"), false);
  assert.equal(calls.includes("services.restore"), false);
  assert.equal(await readFile(receiptPath, "utf8"), originalReceipt);
  const result = JSON.parse(
    await readFile(join(directory, "result.json"), "utf8"),
  );
  assert.equal(result.phase, "SAFE_STOPPED");
  assert.equal(result.mutationsPerformed, true);
});

test("recovery preflight failures preserve the SAFE_STOPPED receipt byte-for-byte", async (t) => {
  for (const failure of ["planFailure", "inventoryFailure"]) {
    await t.test(failure, async () => {
      const directory = await mkdtemp(
        join(tmpdir(), "fieldgrid-bootstrap-recover-"),
      );
      const receiptPath = join(directory, "receipt.json");
      const originalReceipt = `${JSON.stringify({
        contract: CONTRACT,
        repository: "veele-services/platform",
        environment: "staging",
        project: STAGING_PROJECT_REF,
        operation: "apply",
        expectedMainSha: RECOVERY_SOURCE_MAIN,
        expectedStagingSha: STAGING,
        destructive: true,
        status: "failed",
        mutationsPerformed: true,
        phase: "SAFE_STOPPED",
        failureCode: "42501",
        servicesSafeStopped: true,
        originalServices: [{ unit: "veele-staging.service", active: true }],
      })}\n`;
      await writeFile(receiptPath, originalReceipt, { mode: 0o600 });
      const { calls, deps } = fixtures({
        initiallyStopped: true,
        [failure]: true,
      });
      await assert.rejects(
        runRecover({ env: environment("recover"), receiptPath, deps }),
        /synthetic/u,
      );
      assert.equal(await readFile(receiptPath, "utf8"), originalReceipt);
      assert.equal(calls.includes("services.restore"), false);
      assert.equal(calls.includes("services.safeStop"), false);
    });
  }
});

test("recover rejects managed catalog drift against independent plan evidence", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "fieldgrid-bootstrap-recover-"),
  );
  const receiptPath = join(directory, "receipt.json");
  const originalReceipt = `${JSON.stringify({
    contract: CONTRACT,
    repository: "veele-services/platform",
    environment: "staging",
    project: STAGING_PROJECT_REF,
    operation: "apply",
    expectedMainSha: RECOVERY_SOURCE_MAIN,
    expectedStagingSha: STAGING,
    destructive: true,
    status: "failed",
    mutationsPerformed: true,
    phase: "SAFE_STOPPED",
    failureCode: "42501",
    servicesSafeStopped: true,
    originalServices: [{ unit: "veele-staging.service", active: true }],
  })}\n`;
  await writeFile(receiptPath, originalReceipt, { mode: 0o600 });
  const { calls, deps } = fixtures({
    initiallyStopped: true,
    managedCatalogDigest: "e".repeat(64),
  });
  await assert.rejects(
    runRecover({
      env: environment("recover"),
      outputDir: directory,
      receiptPath,
      deps,
    }),
    /MANAGED_CATALOG_CHANGED/u,
  );
  assert.equal(calls.includes("services.stop"), false);
  assert.equal(calls.includes("database.targetProof"), false);
  assert.equal(await readFile(receiptPath, "utf8"), originalReceipt);
  const result = JSON.parse(
    await readFile(join(directory, "result.json"), "utf8"),
  );
  assert.equal(result.phase, "SAFE_STOPPED");
  assert.equal(result.mutationsPerformed, true);
});

test("apply resumes a fully bound PREFLIGHT receipt without losing the original baseline", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "fieldgrid-bootstrap-preflight-"),
  );
  const receiptPath = join(directory, "receipt.json");
  await writeFile(
    receiptPath,
    `${JSON.stringify({
      contract: CONTRACT,
      repository: "veele-services/platform",
      environment: "staging",
      project: STAGING_PROJECT_REF,
      operation: "apply",
      expectedMainSha: MAIN,
      expectedStagingSha: STAGING,
      destructive: true,
      status: "pending",
      mutationsPerformed: false,
      phase: "PREFLIGHT",
      managedCatalogDigest: MANAGED_CATALOG_DIGEST,
      originalServices: [{ unit: "veele-staging.service", active: true }],
    })}\n`,
    { mode: 0o600 },
  );
  const { calls, deps } = fixtures();
  const result = await runApply({
    env: environment(),
    receiptPath,
    deps,
  });
  assert.equal(result.status, "passed");
  assert.ok(calls.includes("database.apply"));
  assert.ok(calls.includes("services.restore"));
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  assert.equal(receipt.phase, "COMPLETE");
  assert.deepEqual(receipt.originalServices, [
    { unit: "veele-staging.service", active: true },
  ]);
});

test("an existing PREFLIGHT receipt stays commit-ambiguous until target proof", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "fieldgrid-bootstrap-preflight-"),
  );
  const receiptPath = join(directory, "receipt.json");
  await writeFile(
    receiptPath,
    `${JSON.stringify({
      contract: CONTRACT,
      repository: "veele-services/platform",
      environment: "staging",
      project: STAGING_PROJECT_REF,
      operation: "apply",
      expectedMainSha: MAIN,
      expectedStagingSha: STAGING,
      destructive: true,
      status: "pending",
      mutationsPerformed: false,
      phase: "PREFLIGHT",
      managedCatalogDigest: MANAGED_CATALOG_DIGEST,
      originalServices: [{ unit: "veele-staging.service", active: true }],
    })}\n`,
    { mode: 0o600 },
  );
  const { calls, deps } = fixtures({ applyFailure: true });
  await assert.rejects(
    runApply({ env: environment(), receiptPath, deps }),
    /synthetic precommit failure/u,
  );
  assert.ok(calls.includes("services.stop"));
  assert.ok(calls.includes("services.safeStop"));
  assert.equal(calls.includes("services.restore"), false);
  assert.equal(calls.includes("database.targetProof"), false);
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  assert.equal(receipt.phase, "SAFE_STOPPED");
  assert.equal(receipt.mutationsPerformed, true);
  assert.deepEqual(receipt.originalServices, [
    { unit: "veele-staging.service", active: true },
  ]);
});

test("failed recovery proof preserves the original SAFE_STOPPED baseline", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "fieldgrid-bootstrap-recover-"),
  );
  const receiptPath = join(directory, "receipt.json");
  await writeFile(
    receiptPath,
    `${JSON.stringify({
      contract: CONTRACT,
      repository: "veele-services/platform",
      environment: "staging",
      project: STAGING_PROJECT_REF,
      operation: "apply",
      expectedMainSha: RECOVERY_SOURCE_MAIN,
      expectedStagingSha: STAGING,
      destructive: true,
      status: "failed",
      mutationsPerformed: true,
      phase: "SAFE_STOPPED",
      failureCode: "42501",
      servicesSafeStopped: true,
      originalServices: [{ unit: "veele-staging.service", active: true }],
    })}\n`,
    { mode: 0o600 },
  );
  const { calls, deps } = fixtures({
    initiallyStopped: true,
    targetFailure: true,
  });
  await assert.rejects(
    runRecover({
      env: environment("recover"),
      receiptPath,
      deps,
    }),
  );
  assert.equal(calls.includes("services.restore"), false);
  assert.ok(calls.includes("services.safeStop"));
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  assert.equal(receipt.phase, "SAFE_STOPPED");
  assert.equal(receipt.failureStage, "target-capability-proof");
  assert.equal(receipt.operation, "apply");
  assert.equal(receipt.expectedMainSha, RECOVERY_SOURCE_MAIN);
  assert.deepEqual(receipt.originalServices, [
    { unit: "veele-staging.service", active: true },
  ]);
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
    const result = await runApply({
      env: environment(),
      receiptPath: join(directory, "receipt.json"),
      deps,
    });
    assert.equal(result.status, "passed");
    assert.equal(result.commitAcknowledgementRecovered, true);
    assert.equal(result.servicesRestored, true);
    assert.equal(calls.filter((call) => call === "database.plan").length, 2);
    assert.ok(calls.includes("database.targetProof"));
    assert.ok(calls.includes("services.restore"));
    assert.equal(calls.includes("services.safeStop"), false);
    const receipt = JSON.parse(
      await readFile(join(directory, "receipt.json"), "utf8"),
    );
    assert.equal(receipt.phase, "COMPLETE");
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
