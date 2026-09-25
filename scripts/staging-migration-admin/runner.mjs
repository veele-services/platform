import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { createServiceControl } from "../disposable-staging/services.mjs";
import {
  applyBootstrap,
  bootstrapPlan,
  drainApplicationWriters,
  verifyTargetLogin,
} from "./database.mjs";
import {
  publicResult,
  requireThat,
  validateBootstrapDispatch,
} from "./contract.mjs";
import {
  createDatabaseClient,
  targetConnection,
  validateLegacyConnection,
} from "./environment.mjs";
import { verifyRestoredStagingHealth } from "./health.mjs";

export const RESULT_FILE = "result.json";
export const DEFAULT_RECEIPT =
  "/var/www/veele/staging/.fieldgrid-migration-admin-bootstrap-receipt.json";

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function writeResult(outputDir, result) {
  if (!outputDir) return;
  await writeJson(join(outputDir, RESULT_FILE), result);
}

async function connect(client) {
  await client.connect();
  return client;
}

export async function runPlan({
  env = process.env,
  outputDir,
  deps = {},
} = {}) {
  const config = validateBootstrapDispatch(env, { mode: "plan" });
  const connection = (
    deps.validateLegacyConnection ?? validateLegacyConnection
  )(env);
  const database = await connect(
    (deps.createLegacyClient ?? createDatabaseClient)(
      { connectionString: connection.legacy, ssl: connection.ssl },
      "fieldgrid-migration-admin-bootstrap-plan",
    ),
  );
  try {
    const inventory = await (deps.bootstrapPlan ?? bootstrapPlan)(database);
    const result = publicResult(config, "planned", {
      mutationsPerformed: false,
      inventory,
    });
    await writeResult(outputDir, result);
    return result;
  } finally {
    await database.end();
  }
}

export async function runApply({
  env = process.env,
  outputDir,
  receiptPath = DEFAULT_RECEIPT,
  deps = {},
} = {}) {
  const config = validateBootstrapDispatch(env, { mode: "apply" });
  const connection = (
    deps.validateLegacyConnection ?? validateLegacyConnection
  )(env);
  const services = deps.services ?? createServiceControl(deps.serviceOptions);
  const database = await connect(
    (deps.createLegacyClient ?? createDatabaseClient)(
      { connectionString: connection.legacy, ssl: connection.ssl },
      "fieldgrid-migration-admin-bootstrap-apply",
    ),
  );
  let baseline;
  let committed = false;
  try {
    await (deps.bootstrapPlan ?? bootstrapPlan)(database);
    baseline = await services.inventory();
    await writeJson(receiptPath, {
      contract: "fieldgrid-staging-migration-admin-bootstrap-v1",
      phase: "PREFLIGHT",
      expectedMainSha: config.expectedMain,
      expectedStagingSha: config.expectedStaging,
      originalServices: baseline.map(({ unit, active }) => ({ unit, active })),
    });
    await services.stop(baseline);
    await (deps.drainApplicationWriters ?? drainApplicationWriters)(database);
    const applied = await (deps.applyBootstrap ?? applyBootstrap)(
      database,
      env.FIELDGRID_MIGRATION_DATABASE_PASSWORD,
      deps.databaseOptions,
    );
    committed = true;
    const target = await connect(
      (deps.createTargetClient ?? createDatabaseClient)(
        targetConnection(connection, env.FIELDGRID_MIGRATION_DATABASE_PASSWORD),
        "fieldgrid-migration-admin-bootstrap-proof",
      ),
    );
    let proof;
    try {
      proof = await (deps.verifyTargetLogin ?? verifyTargetLogin)(
        target,
        applied.managedCatalogDigest,
      );
    } finally {
      await target.end();
    }
    await services.restore(baseline);
    const restored = await services.inventory();
    const servicesRestored = baseline.every((expected) =>
      restored.some(
        (actual) =>
          actual.unit === expected.unit && actual.active === expected.active,
      ),
    );
    requireThat(servicesRestored, "WRITER_RESTORE_FAILED");
    const health = await (
      deps.verifyRestoredHealth ?? verifyRestoredStagingHealth
    )({ expectedSha: config.expectedStaging });
    const result = publicResult(config, "passed", {
      mutationsPerformed: true,
      legacyPrincipal: applied.legacyPrincipal,
      targetPrincipal: proof.principal,
      managedCatalogDigest: applied.managedCatalogDigest,
      runtimeMembershipDigest: applied.runtimeMembershipDigest,
      applicationObjectCount: applied.applicationObjectCount,
      securityDefinerCompatibilityOwner:
        applied.securityDefinerCompatibilityOwner,
      targetApplicationSchemas: proof.applicationSchemas,
      dryRebuildCapability: proof.dryRebuildCapability,
      authorizedProviderCompatibility: proof.authorizedProviderCompatibility,
      servicesRestored,
      restoredHealth: health,
    });
    await writeJson(receiptPath, {
      ...result,
      phase: "COMPLETE",
      originalServices: baseline.map(({ unit, active }) => ({ unit, active })),
    });
    await writeResult(outputDir, result);
    return result;
  } catch (error) {
    const stateMayHaveCommitted =
      committed || error?.bootstrapCommitAttempted === true;
    let recoveryFailureCode;
    let servicesSafeStopped;
    if (baseline && !stateMayHaveCommitted) {
      try {
        await services.restore(baseline);
      } catch {
        recoveryFailureCode = "WRITER_RESTORE_FAILED";
      }
    }
    if (baseline && stateMayHaveCommitted) {
      try {
        await services.safeStop();
        servicesSafeStopped = true;
      } catch {
        servicesSafeStopped = false;
        recoveryFailureCode = "WRITER_SAFE_STOP_FAILED";
      }
    }
    const phase = recoveryFailureCode
      ? "RECOVERY_REQUIRED"
      : stateMayHaveCommitted
        ? "SAFE_STOPPED"
        : "ROLLED_BACK";
    const result = publicResult(config, "failed", {
      mutationsPerformed: stateMayHaveCommitted,
      phase,
      failureCode: error?.code ?? "OPERATION_FAILED",
      recoveryFailureCode,
      servicesSafeStopped,
    });
    await writeJson(receiptPath, {
      ...result,
      ...(baseline
        ? {
            originalServices: baseline.map(({ unit, active }) => ({
              unit,
              active,
            })),
          }
        : {}),
    }).catch(() => {});
    await writeResult(outputDir, result).catch(() => {});
    throw error;
  } finally {
    await database.end().catch(() => {});
  }
}
