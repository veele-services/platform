import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  CONTRACT,
  REPOSITORY,
  STAGING_PROJECT_REF,
  WRITER_UNITS,
  digest,
  publicPlan,
  requireThat,
  safeFailure,
  validateBootstrapConfiguration,
  validateDispatchEnvironment,
} from "./contract.mjs";
import { bootstrapDatabase, verifyBootstrap } from "./bootstrap.mjs";
import {
  assertNoExternalWriters,
  createWriterAdmissionGuard,
  databaseInventory,
  resetApplicationSchemas,
  resetRuntimePrincipalsForCanonicalRebuild,
  verifyPlatformOnlyDatabaseState,
  verifyRebuiltDatabase,
} from "./database.mjs";
import {
  createDatabaseClient,
  createProviderClient,
  validateConnections,
} from "./environment.mjs";
import { createProviderControl } from "./providers.mjs";
import { runPostRebuildAcceptance } from "./acceptance.mjs";
import { readReceipt, receiptPath, writeReceipt } from "./receipt.mjs";
import { createServiceControl } from "./services.mjs";
import { githubEvidence } from "../wp1/evidence.mjs";

export const RESULT_FILE = "result.json";

function nowIso(now) {
  return new Date(now()).toISOString();
}

function baseReceipt(config, now) {
  return {
    contract: CONTRACT,
    repository: REPOSITORY,
    project: STAGING_PROJECT_REF,
    candidateSha: config.expectedMain,
    expectedStagingSha: config.expectedStaging,
    runId: config.runId,
    attempt: config.attempt,
    phase: "PREFLIGHT",
    destructiveBoundaryPassed: false,
    releaseActive: false,
    smokePassed: false,
    acceptancePassed: false,
    generatedAt: nowIso(now),
    updatedAt: nowIso(now),
  };
}

async function save(path, receipt, phase, now, additions = {}) {
  Object.assign(receipt, additions, { phase, updatedAt: nowIso(now) });
  await writeReceipt(path, receipt);
}

function publicResult(receipt, status, additions = {}) {
  return {
    contract: receipt.contract,
    repository: receipt.repository,
    project: receipt.project,
    environment: "staging",
    mode: "rebuild",
    status,
    candidateSha: receipt.candidateSha,
    expectedStagingSha: receipt.expectedStagingSha,
    runId: receipt.runId,
    attempt: receipt.attempt,
    phase: receipt.phase,
    destructiveBoundaryPassed: receipt.destructiveBoundaryPassed,
    releaseActive: receipt.releaseActive,
    smokePassed: receipt.smokePassed,
    acceptancePassed: receipt.acceptancePassed,
    backupRequired: false,
    oldDataRestored: false,
    ...additions,
  };
}

async function writePublicResult(outputDir, result) {
  await mkdir(outputDir, { recursive: true });
  const path = join(outputDir, RESULT_FILE);
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return path;
}

async function connectDatabase(database) {
  await database.connect();
  return database;
}

async function verifyMain(evidence, expectedMain) {
  await evidence.assertMain(expectedMain);
  await evidence.assertValidation(expectedMain);
}

function inventorySummary({ database, provider, services }) {
  return {
    database: {
      applicationSchemas: database.applicationSchemas,
      applicationTables: database.applicationTables,
      managedCatalogDigest: database.managedCatalogDigest,
      principalDigest: digest(database.principal),
      tenantCount: database.currentTenantCount,
      tenantUserCount: database.currentTenantUserCount,
      platformUserCount: database.currentPlatformUserCount,
      tenantScopedTableCount: database.currentTenantScopedTableCount,
      tenantScopedRowCount: database.currentTenantScopedRowCount,
      tenantScopedDigest: database.currentTenantScopedDigest,
    },
    provider: {
      storageBucketCount: provider.storage.configured.length,
      storageObjectCount: provider.storage.count,
      storageDigest: provider.storage.digest,
      authUserCount: provider.auth.count,
      authDigest: provider.auth.digest,
    },
    services: services.map(({ unit, active }) => ({ unit, active })),
  };
}

function reusableOriginalServices(receipt) {
  const services = receipt?.originalServices;
  if (receipt?.phase === "COMPLETE" || !Array.isArray(services)) return null;
  const units = services.map(({ unit }) => unit);
  requireThat(
    services.length > 0 &&
      services.every(
        ({ unit, active }) =>
          WRITER_UNITS.includes(unit) && typeof active === "boolean",
      ) &&
      units.length === new Set(units).size,
    "RECEIPT_SERVICE_BASELINE_INVALID",
  );
  return services.map(({ unit, active }) => ({ unit, active }));
}

export async function runPlan({
  env = process.env,
  outputDir,
  deps = {},
} = {}) {
  const config = validateDispatchEnvironment(env, { mode: "plan" });
  const bootstrap = validateBootstrapConfiguration(env);
  const connections = (deps.validateConnections ?? validateConnections)(env);
  const evidence =
    deps.evidence ?? githubEvidence(env.GITHUB_TOKEN, deps.githubOptions);
  await verifyMain(evidence, config.expectedMain);
  const services = deps.services ?? createServiceControl(deps.serviceOptions);
  const provider =
    deps.provider ??
    createProviderControl(
      (deps.createProviderClient ?? createProviderClient)(env),
      deps.providerOptions,
    );
  const database = await connectDatabase(
    (deps.createDatabaseClient ?? createDatabaseClient)(connections),
  );
  try {
    const inventory = {
      database: await (deps.databaseInventory ?? databaseInventory)(database, {
        expectedPrincipalName: "fieldgrid_migration_admin",
      }),
      provider: await provider.preflight(),
      services: await services.inventory(),
    };
    const report = publicPlan(config, bootstrap, inventorySummary(inventory));
    if (outputDir) await writePublicResult(outputDir, report);
    return report;
  } finally {
    await database.end();
  }
}

export async function runRebuild({
  env = process.env,
  repoRoot = process.cwd(),
  outputDir,
  baseDir = "/var/www/veele/staging",
  deps = {},
} = {}) {
  const now = deps.now ?? Date.now;
  const config = validateDispatchEnvironment(env, { mode: "rebuild" });
  const bootstrap = validateBootstrapConfiguration(env);
  const path = deps.receiptPath ?? receiptPath(baseDir);
  const previous = await readReceipt(path, { optional: true });
  requireThat(
    !(
      previous?.candidateSha === config.expectedMain &&
      previous?.phase === "COMPLETE"
    ),
    "CANDIDATE_ALREADY_COMPLETE",
  );
  const receipt = baseReceipt(config, now);
  const reusableServiceBaseline = reusableOriginalServices(previous);
  if (reusableServiceBaseline) {
    receipt.originalServices = reusableServiceBaseline;
    receipt.destructiveBoundaryPassed =
      previous.destructiveBoundaryPassed === true;
  }
  const services = deps.services ?? createServiceControl(deps.serviceOptions);
  let originalServices;
  let database;
  let writerAdmission;
  try {
    const connections = (deps.validateConnections ?? validateConnections)(env);
    const evidence =
      deps.evidence ?? githubEvidence(env.GITHUB_TOKEN, deps.githubOptions);
    await verifyMain(evidence, config.expectedMain);
    const provider =
      deps.provider ??
      createProviderControl(
        (deps.createProviderClient ?? createProviderClient)(env),
        deps.providerOptions,
      );
    database = await connectDatabase(
      (deps.createDatabaseClient ?? createDatabaseClient)(connections),
    );
    const dbInventory = await (deps.databaseInventory ?? databaseInventory)(
      database,
      { expectedPrincipalName: "fieldgrid_migration_admin" },
    );
    const providerInventory = await provider.preflight();
    const currentServices = await services.inventory();
    originalServices = reusableServiceBaseline ?? currentServices;
    receipt.preflightDigest = digest(
      inventorySummary({
        database: dbInventory,
        provider: providerInventory,
        services: currentServices,
      }),
    );
    receipt.originalServices = originalServices.map(({ unit, active }) => ({
      unit,
      active,
    }));
    await save(path, receipt, "PREFLIGHT", now);

    // This is the last remote-ref/CI read before the destructive boundary.
    await verifyMain(evidence, config.expectedMain);
    await services.stop(currentServices);
    receipt.destructiveBoundaryPassed = true;
    await save(path, receipt, "QUIESCED", now);
    const fenceWriters =
      deps.assertNoExternalWriters ?? assertNoExternalWriters;
    const writerFence = await fenceWriters(database);
    await save(path, receipt, "QUIESCED", now, {
      writerFenceDigest: digest(writerFence),
    });
    writerAdmission = await (
      deps.createWriterAdmissionGuard ?? createWriterAdmissionGuard
    )(database, { repoRoot, env });
    const guardedFence = () =>
      fenceWriters(database, {
        allowedSamePrincipalPids:
          writerAdmission.allowedSamePrincipalPids ?? [],
      });

    const storage = await provider.emptyStorage(providerInventory.storage);
    await save(path, receipt, "STORAGE_EMPTY", now, {
      storageDigest: storage.digest,
    });
    await guardedFence();
    const catalog = await (
      deps.resetApplicationSchemas ?? resetApplicationSchemas
    )(database);
    await save(path, receipt, "SCHEMAS_CLEAN", now, {
      managedCatalogDigest: catalog.after,
    });
    await (
      deps.resetRuntimePrincipalsForCanonicalRebuild ??
      resetRuntimePrincipalsForCanonicalRebuild
    )(database);
    const auth = await provider.emptyAuth(providerInventory.auth);
    await save(path, receipt, "AUTH_EMPTY", now, { authDigest: auth.digest });

    if (deps.runCanonicalMigrations) {
      await deps.runCanonicalMigrations({ repoRoot, env });
    } else {
      await writerAdmission.migrate();
    }
    await save(path, receipt, "MIGRATED", now);
    await guardedFence();
    const identities = {
      platform: await provider.createIdentity({
        ...bootstrap.platform,
        portal: "platform-admin",
        role: "owner",
      }),
    };
    await (deps.bootstrapDatabase ?? bootstrapDatabase)(
      database,
      bootstrap,
      identities,
    );
    await guardedFence();
    await save(path, receipt, "BOOTSTRAPPED", now, {
      bootstrapIdentityDigest: digest(identities),
      platformUserId: identities.platform,
    });

    const databaseProof = await (
      deps.verifyRebuiltDatabase ?? verifyRebuiltDatabase
    )(database);
    const bootstrapProof = await (deps.verifyBootstrap ?? verifyBootstrap)(
      database,
      bootstrap,
      identities,
    );
    const providerProof = await provider.verifyPlatformOnlyState(
      identities.platform,
    );
    await services.assertStopped(originalServices);
    await save(path, receipt, "VERIFIED", now, {
      proofDigest: digest({
        databaseProof,
        bootstrapProof,
        providerProof,
      }),
    });
    const result = publicResult(receipt, "prepared", {
      mutationsPerformed: true,
    });
    if (outputDir) await writePublicResult(outputDir, result);
    return result;
  } catch (error) {
    const failure = safeFailure(error, receipt.phase);
    receipt.destructiveBoundaryPassed ||= failure.destructiveBoundaryPassed;
    if (receipt.destructiveBoundaryPassed) {
      await services.safeStop().catch(() => {});
      await save(path, receipt, "SAFE_STOPPED", now, {
        failureCode: failure.code,
      }).catch(() => {});
    } else if (originalServices) {
      await services.restore(originalServices).catch(() => {});
    }
    if (outputDir)
      await writePublicResult(
        outputDir,
        publicResult(receipt, "failed", { failureCode: failure.code }),
      ).catch(() => {});
    throw error;
  } finally {
    try {
      await writerAdmission?.release();
    } finally {
      await database?.end().catch(() => {});
    }
  }
}

export async function finalizeRebuild({
  env = process.env,
  outputDir,
  baseDir = "/var/www/veele/staging",
  deps = {},
} = {}) {
  const now = deps.now ?? Date.now;
  const config = validateDispatchEnvironment(env, { mode: "finalize" });
  const path = deps.receiptPath ?? receiptPath(baseDir);
  const receipt = await readReceipt(path);
  requireThat(
    receipt.candidateSha === config.expectedMain &&
      receipt.expectedStagingSha === config.expectedStaging &&
      receipt.runId === config.runId &&
      receipt.attempt === config.attempt &&
      receipt.phase === "VERIFIED" &&
      typeof receipt.platformUserId === "string",
    "RECEIPT_RUN_MISMATCH",
  );
  const activeSha = (
    await (deps.readActiveSha ?? readFile)(
      join(baseDir, "current", ".fieldgrid-release-sha"),
      "utf8",
    )
  ).trim();
  requireThat(
    activeSha === config.expectedMain,
    "ACTIVE_RELEASE_MISMATCH",
    "ACTIVATED",
    true,
  );
  const services = deps.services ?? createServiceControl(deps.serviceOptions);
  await services.restore(receipt.originalServices);
  const state = await services.inventory();
  requireThat(
    receipt.originalServices.every((expected) =>
      state.some(
        (actual) =>
          actual.unit === expected.unit && actual.active === expected.active,
      ),
    ),
    "SERVICES_NOT_RESTORED",
    "ACTIVATED",
    true,
  );
  const bootstrap = validateBootstrapConfiguration(env);
  let database;
  try {
    const connections = (deps.validateConnections ?? validateConnections)(env);
    const provider =
      deps.provider ??
      createProviderControl(
        (deps.createProviderClient ?? createProviderClient)(env),
        deps.providerOptions,
      );
    database = await connectDatabase(
      (deps.createDatabaseClient ?? createDatabaseClient)(connections),
    );
    await save(path, receipt, "ACTIVATED", now, {
      releaseActive: true,
      smokePassed: true,
    });
    const acceptance = await (
      deps.runPostRebuildAcceptance ?? runPostRebuildAcceptance
    )({
      env,
      bootstrap,
      candidateSha: config.expectedMain,
      runId: config.runId,
      attempt: config.attempt,
      database,
      provider,
    });
    requireThat(
      acceptance.fixtureCleanupComplete === true,
      "POST_REBUILD_FIXTURE_CLEANUP_FAILED",
      "ACTIVATED",
      true,
    );
    const databaseState = await (
      deps.verifyPlatformOnlyDatabaseState ?? verifyPlatformOnlyDatabaseState
    )(database, receipt.platformUserId);
    const providerState = await provider.verifyPlatformOnlyState(
      receipt.platformUserId,
    );
    const finalState = {
      contract: "fieldgrid-platform-only-v1",
      database: databaseState,
      auth: {
        accountCount: providerState.authAccountCount,
        platformAdminCount: providerState.platformAdminCount,
        temporaryTenantAdminCount: providerState.temporaryTenantAdminCount,
        canonicalMetadata: providerState.canonicalMetadata,
        digest: providerState.authDigest,
      },
      storage: {
        objectCount: providerState.storageObjectCount,
        digest: providerState.storageDigest,
      },
      platform: {
        platformUserCount: databaseState.platformUserCount,
        activeOwnerCount: databaseState.activePlatformOwnerCount,
        identityMatchesBootstrap: databaseState.platformIdentityMatches,
        tenantMembershipCount: databaseState.tenantUserCount,
      },
      cleanupComplete: true,
    };
    await save(path, receipt, "COMPLETE", now, {
      releaseActive: true,
      smokePassed: true,
      acceptancePassed: true,
      acceptanceDigest: digest(acceptance),
      finalState,
      proofDigest: digest({
        prepared: receipt.proofDigest,
        acceptance,
        finalState,
      }),
    });
    const result = publicResult(receipt, "passed", {
      mutationsPerformed: true,
      proofDigest: receipt.proofDigest,
      finalState,
    });
    if (outputDir) await writePublicResult(outputDir, result);
    return result;
  } catch (error) {
    const failure = safeFailure(error, receipt.phase);
    await services.safeStop().catch(() => {});
    await save(path, receipt, "SAFE_STOPPED", now, {
      releaseActive: false,
      smokePassed: false,
      acceptancePassed: false,
      failureCode: failure.code,
    }).catch(() => {});
    if (outputDir) {
      await writePublicResult(
        outputDir,
        publicResult(receipt, "failed", { failureCode: failure.code }),
      ).catch(() => {});
    }
    throw error;
  } finally {
    await database?.end().catch(() => {});
  }
}

export async function safeStopRebuild({
  env = process.env,
  outputDir,
  baseDir = "/var/www/veele/staging",
  deps = {},
} = {}) {
  const now = deps.now ?? Date.now;
  const config = validateDispatchEnvironment(env, { mode: "safe-stop" });
  const path = deps.receiptPath ?? receiptPath(baseDir);
  const receipt = await readReceipt(path);
  requireThat(
    receipt.candidateSha === config.expectedMain &&
      receipt.expectedStagingSha === config.expectedStaging &&
      receipt.runId === config.runId &&
      receipt.attempt === config.attempt,
    "RECEIPT_RUN_MISMATCH",
  );
  const services = deps.services ?? createServiceControl(deps.serviceOptions);
  if (receipt.destructiveBoundaryPassed === true) {
    await services.safeStop();
    await save(path, receipt, "SAFE_STOPPED", now, {
      releaseActive: false,
      smokePassed: false,
      acceptancePassed: false,
      failureCode: "POST_REBUILD_ACTIVATION_FAILED",
    });
  } else {
    requireThat(
      Array.isArray(receipt.originalServices) &&
        receipt.originalServices.length > 0,
      "RECEIPT_SERVICE_BASELINE_INVALID",
    );
    await services.restore(receipt.originalServices);
    await save(path, receipt, receipt.phase, now, {
      releaseActive: false,
      smokePassed: false,
      acceptancePassed: false,
      failureCode: "PRE_DESTRUCTIVE_FAILURE",
    });
  }
  const result = publicResult(receipt, "failed", {
    failureCode: receipt.failureCode,
  });
  if (outputDir) await writePublicResult(outputDir, result);
  return result;
}
