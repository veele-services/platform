import { constants } from "node:fs";
import { mkdir, open, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { createServiceControl } from "../disposable-staging/services.mjs";
import {
  applyBootstrap,
  bootstrapPlan,
  drainApplicationWriters,
  repairCommittedTargetSchemaPrivileges,
  verifyTargetLogin,
} from "./database.mjs";
import {
  APP_SCHEMAS,
  CONTRACT,
  MIGRATION_ROLE,
  REPOSITORY,
  STAGING_PROJECT_REF,
  digest,
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
const CATALOG_DIGEST = /^[0-9a-f]{64}$/u;

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

async function readReceipt(path) {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = await handle.stat();
    requireThat(
      metadata.isFile() &&
        metadata.size > 0 &&
        metadata.size <= 64 * 1024 &&
        (metadata.mode & 0o077) === 0,
      "BOOTSTRAP_RECEIPT_INVALID",
    );
    return JSON.parse(await handle.readFile("utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    requireThat(false, "BOOTSTRAP_RECEIPT_INVALID");
  } finally {
    await handle?.close().catch(() => {});
  }
}

function serviceBaseline(value) {
  requireThat(
    Array.isArray(value) && value.length > 0,
    "BOOTSTRAP_RECEIPT_INVALID",
  );
  const baseline = value.map((item) => {
    requireThat(
      item && typeof item.unit === "string" && typeof item.active === "boolean",
      "BOOTSTRAP_RECEIPT_INVALID",
    );
    return { unit: item.unit, active: item.active };
  });
  requireThat(
    new Set(baseline.map(({ unit }) => unit)).size === baseline.length,
    "BOOTSTRAP_RECEIPT_INVALID",
  );
  return baseline.sort((left, right) => left.unit.localeCompare(right.unit));
}

function assertSameServiceSet(expected, actual, { compareState = false } = {}) {
  const expectedBaseline = serviceBaseline(expected);
  const actualBaseline = serviceBaseline(actual);
  requireThat(
    expectedBaseline.length === actualBaseline.length &&
      expectedBaseline.every(
        (item, index) =>
          item.unit === actualBaseline[index].unit &&
          (!compareState || item.active === actualBaseline[index].active),
      ),
    "BOOTSTRAP_RECEIPT_SERVICE_MISMATCH",
  );
  return expectedBaseline;
}

async function recoveryState(receiptPath, config, currentServices) {
  const receipt = await readReceipt(receiptPath);
  if (!receipt) {
    requireThat(
      config.mode !== "recover",
      "BOOTSTRAP_RECOVERY_RECEIPT_MISSING",
    );
    return { baseline: currentServices, resume: false };
  }
  requireThat(
    receipt.contract === CONTRACT &&
      receipt.repository === REPOSITORY &&
      receipt.environment === "staging" &&
      receipt.project === STAGING_PROJECT_REF &&
      receipt.operation === "apply" &&
      receipt.destructive === true &&
      /^[0-9a-f]{40}$/u.test(receipt.expectedMainSha ?? "") &&
      receipt.expectedStagingSha === config.expectedStaging,
    "BOOTSTRAP_RECEIPT_BINDING_INVALID",
  );
  if (receipt.phase === "ROLLED_BACK") {
    requireThat(
      config.mode === "apply" &&
        receipt.expectedMainSha === config.expectedMain,
      "BOOTSTRAP_RECEIPT_BINDING_INVALID",
    );
    assertSameServiceSet(receipt.originalServices, currentServices, {
      compareState: true,
    });
    requireThat(
      CATALOG_DIGEST.test(receipt.managedCatalogDigest ?? ""),
      "BOOTSTRAP_RECEIPT_INVALID",
    );
    return {
      baseline: currentServices,
      resume: false,
      managedCatalogDigest: receipt.managedCatalogDigest,
    };
  }
  if (receipt.phase === "PREFLIGHT") {
    requireThat(
      config.mode === "apply" &&
        receipt.expectedMainSha === config.expectedMain &&
        receipt.status === "pending" &&
        receipt.mutationsPerformed === false &&
        CATALOG_DIGEST.test(receipt.managedCatalogDigest ?? ""),
      "BOOTSTRAP_RECEIPT_BINDING_INVALID",
    );
    return {
      baseline: assertSameServiceSet(receipt.originalServices, currentServices),
      resume: false,
      commitAmbiguous: true,
      managedCatalogDigest: receipt.managedCatalogDigest,
      writersAlreadyStopped: currentServices.every(
        ({ active, pid }) => active === false && Number(pid ?? 0) === 0,
      ),
    };
  }
  if (receipt.phase === "COMPLETE") {
    requireThat(false, "BOOTSTRAP_ALREADY_COMPLETE");
  }
  if (receipt.phase === "RECOVERY_REQUIRED") {
    requireThat(false, "BOOTSTRAP_RECOVERY_REQUIRED");
  }
  requireThat(receipt.phase === "SAFE_STOPPED", "BOOTSTRAP_RECEIPT_INCOMPLETE");
  requireThat(
    receipt.status === "failed" &&
      receipt.mutationsPerformed === true &&
      receipt.servicesSafeStopped === true &&
      !receipt.recoveryFailureCode,
    "BOOTSTRAP_RECEIPT_INVALID",
  );
  const baseline = assertSameServiceSet(
    receipt.originalServices,
    currentServices,
  );
  if (config.mode !== "recover") {
    requireThat(
      currentServices.every(
        ({ active, pid }) => active === false && Number(pid ?? 0) === 0,
      ),
      "BOOTSTRAP_RECOVERY_WRITERS_ACTIVE",
    );
    const error = new Error("BOOTSTRAP_RECOVERY_MODE_REQUIRED");
    error.code = "BOOTSTRAP_RECOVERY_MODE_REQUIRED";
    error.safeStoppedReceipt = true;
    throw error;
  }
  requireThat(
    receipt.expectedMainSha === config.recoverySourceMain,
    "BOOTSTRAP_RECEIPT_BINDING_INVALID",
  );
  requireThat(
    receipt.managedCatalogDigest === undefined ||
      (CATALOG_DIGEST.test(receipt.managedCatalogDigest) &&
        receipt.managedCatalogDigest === config.expectedManagedCatalogDigest),
    "BOOTSTRAP_RECEIPT_CATALOG_MISMATCH",
  );
  return {
    baseline,
    resume: true,
    managedCatalogDigest: config.expectedManagedCatalogDigest,
    writersAlreadyStopped: currentServices.every(
      ({ active, pid }) => active === false && Number(pid ?? 0) === 0,
    ),
  };
}

function committedBootstrapMetadata(inventory, expectedManagedCatalogDigest) {
  const target = inventory.targetRole;
  requireThat(
    inventory.targetRoleExists === true &&
      target?.rolname === MIGRATION_ROLE &&
      target.rolsuper === false &&
      target.rolbypassrls === false &&
      target.rolcreaterole === true &&
      target.rolcreatedb === false &&
      target.rolreplication === false &&
      target.rolinherit === false &&
      target.rolcanlogin === true &&
      inventory.managedCatalogDigest === expectedManagedCatalogDigest &&
      inventory.applicationSchemas.length === APP_SCHEMAS.length &&
      APP_SCHEMAS.every((schema) =>
        inventory.applicationSchemas.some(
          ({ schema_name: schemaName, owner }) =>
            schemaName === schema && owner === MIGRATION_ROLE,
        ),
      ) &&
      inventory.applicationSchemas.every(
        ({ owner }) => owner === MIGRATION_ROLE,
      ) &&
      inventory.applicationRelationOwners.every(
        ({ owner }) => owner === MIGRATION_ROLE,
      ) &&
      inventory.applicationRoutineOwners.every(({ owner, prosecdef }) =>
        prosecdef ? owner === "postgres" : owner === MIGRATION_ROLE,
      ),
    "COMMITTED_BOOTSTRAP_STATE_INVALID",
  );
  const applicationObjectCount =
    inventory.applicationSchemas.length +
    inventory.applicationRelationOwners.reduce(
      (total, { count }) => total + Number(count),
      0,
    ) +
    inventory.applicationRoutineOwners.reduce(
      (total, { count }) => total + Number(count),
      0,
    );
  return {
    legacyPrincipal: inventory.principal.name,
    managedCatalogDigest: inventory.managedCatalogDigest,
    runtimeMembershipDigest: digest(inventory.runtimeMembership ?? []),
    applicationObjectCount,
    securityDefinerCompatibilityOwner: "postgres",
  };
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
  mode = "apply",
  deps = {},
} = {}) {
  requireThat(mode === "apply" || mode === "recover", "MODE_INVALID");
  const config = validateBootstrapDispatch(env, { mode });
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
  let resumedFromSafeStopped = false;
  let commitAcknowledgementRecovered = false;
  let targetSchemaPrivilegesRepaired = false;
  let mayUpdateReceipt = false;
  let writersTouched = false;
  let expectedManagedCatalogDigest = config.expectedManagedCatalogDigest;
  try {
    const currentServices = await services.inventory();
    const recovery = await recoveryState(receiptPath, config, currentServices);
    baseline = recovery.baseline;
    resumedFromSafeStopped = recovery.resume;
    committed = resumedFromSafeStopped || recovery.commitAmbiguous === true;
    expectedManagedCatalogDigest ??= recovery.managedCatalogDigest;
    let plan;
    if (
      (resumedFromSafeStopped || recovery.commitAmbiguous === true) &&
      !recovery.writersAlreadyStopped
    ) {
      mayUpdateReceipt = true;
      writersTouched = true;
      await services.stop(currentServices);
      await (deps.drainApplicationWriters ?? drainApplicationWriters)(database);
      plan = await (deps.bootstrapPlan ?? bootstrapPlan)(database);
    } else {
      plan = await (deps.bootstrapPlan ?? bootstrapPlan)(database);
    }
    expectedManagedCatalogDigest ??= plan.managedCatalogDigest;
    requireThat(
      CATALOG_DIGEST.test(expectedManagedCatalogDigest) &&
        plan.managedCatalogDigest === expectedManagedCatalogDigest,
      "MANAGED_CATALOG_CHANGED",
    );
    if (!resumedFromSafeStopped) {
      await writeJson(receiptPath, {
        contract: CONTRACT,
        repository: REPOSITORY,
        environment: "staging",
        project: STAGING_PROJECT_REF,
        operation: "apply",
        expectedMainSha: config.expectedMain,
        expectedStagingSha: config.expectedStaging,
        destructive: true,
        status: "pending",
        mutationsPerformed: false,
        phase: "PREFLIGHT",
        managedCatalogDigest: expectedManagedCatalogDigest,
        originalServices: baseline.map(({ unit, active }) => ({
          unit,
          active,
        })),
      });
      mayUpdateReceipt = true;
    }
    if (
      (!resumedFromSafeStopped && recovery.commitAmbiguous !== true) ||
      recovery.writersAlreadyStopped
    ) {
      mayUpdateReceipt = true;
      writersTouched = true;
      await services.stop(currentServices);
      await (deps.drainApplicationWriters ?? drainApplicationWriters)(database);
    }
    let applied;
    if (resumedFromSafeStopped) {
      applied = committedBootstrapMetadata(plan, expectedManagedCatalogDigest);
    } else {
      try {
        applied = await (deps.applyBootstrap ?? applyBootstrap)(
          database,
          env.FIELDGRID_MIGRATION_DATABASE_PASSWORD,
          deps.databaseOptions,
        );
        committed = true;
      } catch (error) {
        if (error?.bootstrapCommitAttempted !== true) throw error;
        committed = true;
        const recoveryDatabase = await connect(
          (
            deps.createRecoveryClient ??
            deps.createLegacyClient ??
            createDatabaseClient
          )(
            { connectionString: connection.legacy, ssl: connection.ssl },
            "fieldgrid-migration-admin-bootstrap-commit-proof",
          ),
        );
        try {
          const committedPlan = await (deps.bootstrapPlan ?? bootstrapPlan)(
            recoveryDatabase,
          );
          applied = committedBootstrapMetadata(
            committedPlan,
            expectedManagedCatalogDigest,
          );
          commitAcknowledgementRecovered = true;
        } finally {
          await recoveryDatabase.end().catch(() => {});
        }
      }
    }
    const target = await connect(
      (deps.createTargetClient ?? createDatabaseClient)(
        targetConnection(connection, env.FIELDGRID_MIGRATION_DATABASE_PASSWORD),
        "fieldgrid-migration-admin-bootstrap-proof",
      ),
    );
    let proof;
    try {
      if (resumedFromSafeStopped) {
        await (
          deps.repairCommittedTargetSchemaPrivileges ??
          repairCommittedTargetSchemaPrivileges
        )(target);
        targetSchemaPrivilegesRepaired = true;
      }
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
      resumedFromSafeStopped,
      recoverySourceMainSha: resumedFromSafeStopped
        ? config.recoverySourceMain
        : undefined,
      commitAcknowledgementRecovered,
      targetSchemaPrivilegesRepaired,
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
      committed ||
      error?.bootstrapCommitAttempted === true ||
      error?.safeStoppedReceipt === true;
    let recoveryFailureCode;
    let servicesSafeStopped;
    if (baseline && writersTouched && !stateMayHaveCommitted) {
      try {
        await services.restore(baseline);
      } catch {
        recoveryFailureCode = "WRITER_RESTORE_FAILED";
      }
    }
    if (baseline && writersTouched && stateMayHaveCommitted) {
      try {
        await services.safeStop();
        servicesSafeStopped = true;
      } catch {
        servicesSafeStopped = false;
        recoveryFailureCode = "WRITER_SAFE_STOP_FAILED";
      }
    }
    const phase = !mayUpdateReceipt
      ? stateMayHaveCommitted
        ? "SAFE_STOPPED"
        : config.mode === "recover"
          ? "RECOVERY_REQUIRED"
          : "PREFLIGHT_REJECTED"
      : recoveryFailureCode
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
    const privateResult = resumedFromSafeStopped
      ? {
          contract: CONTRACT,
          repository: REPOSITORY,
          environment: "staging",
          project: STAGING_PROJECT_REF,
          operation: "apply",
          expectedMainSha: config.recoverySourceMain,
          expectedStagingSha: config.expectedStaging,
          destructive: true,
          status: "failed",
          mutationsPerformed: true,
          phase,
          failureCode: error?.code ?? "OPERATION_FAILED",
          recoveryFailureCode,
          servicesSafeStopped,
          lastRecoveryMainSha: config.expectedMain,
          managedCatalogDigest: expectedManagedCatalogDigest,
        }
      : result;
    if (mayUpdateReceipt) {
      await writeJson(receiptPath, {
        ...privateResult,
        ...(expectedManagedCatalogDigest
          ? { managedCatalogDigest: expectedManagedCatalogDigest }
          : {}),
        ...(baseline
          ? {
              originalServices: baseline.map(({ unit, active }) => ({
                unit,
                active,
              })),
            }
          : {}),
      }).catch(() => {});
    }
    await writeResult(outputDir, result).catch(() => {});
    throw error;
  } finally {
    await database.end().catch(() => {});
  }
}

export async function runRecover(options = {}) {
  return runApply({ ...options, mode: "recover" });
}
