#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  CONTRACT,
  PROJECT,
  hash,
  requireThat,
  safeError,
} from "./wp1/contract.mjs";
import {
  databaseClient,
  postgresProcessEnv,
  providerClient,
  validateEnvironment,
} from "./wp1/environment.mjs";
import { githubEvidence } from "./wp1/evidence.mjs";
import {
  assertBackupFile,
  backupAndRehearse,
  privateOperationDirectory,
  writePrivate,
} from "./wp1/backup.mjs";
import { createServiceControl } from "./wp1/services.mjs";
import {
  inventoryDatabase,
  resetDatabase,
} from "./wp1/database.mjs";
import {
  createProviderAdapter,
  verifyTestPayments,
} from "./wp1/providers.mjs";
import { verifyCanonical } from "./wp1/bootstrap.mjs";

const ARTIFACT_DIR = "artifacts/fieldgrid-v1-wp1-clean-base";
const PRIVATE_RECEIPT = "diagnose-private.json";
const SERVICE_RECEIPT = "service-recovery.json";

function providerDigest(inventory) {
  return hash({
    auth: inventory.authDigest,
    storage: inventory.storageDigest,
    selection: inventory.selectionDigest,
  });
}

function writerDigest(states) {
  return hash(states.map(({ pid: _pid, ...state }) => state));
}

function paymentKeys(database, environment = process.env) {
  const tenants = new Set();
  for (const row of database.data.payments ?? []) {
    if (row.payment_method === "mollie" || row.mollie_payment_id) {
      if (typeof row.tenant_id === "string") tenants.add(row.tenant_id);
    }
  }
  if (tenants.size === 0) return {};
  const key = environment.MOLLIE_API_KEY;
  return Object.fromEntries([...tenants].map((tenantId) => [tenantId, key]));
}

async function verifyProviderPayments(database, environment = process.env) {
  return verifyTestPayments(database, paymentKeys(database, environment));
}

async function readPrivate(path) {
  const bytes = await readFile(path, "utf8");
  return JSON.parse(bytes);
}

async function writePublic(value) {
  await mkdir(ARTIFACT_DIR, { recursive: true, mode: 0o700 });
  await writeFile(
    join(ARTIFACT_DIR, "result.json"),
    `${JSON.stringify(value, null, 2)}\n`,
    { mode: 0o600 },
  );
}

function publicFailure(config, error) {
  const safe = safeError(error, config?.mode ?? "preflight");
  return {
    contract: CONTRACT,
    environment: "staging",
    project: PROJECT,
    sha: config?.sha ?? null,
    mode: config?.mode ?? null,
    runId: config?.runId ?? null,
    attempt: config?.attempt ?? null,
    status: "failed",
    errorCode: safe.code,
    phase: safe.phase,
    completedAt: new Date().toISOString(),
  };
}

function diagnoseReport(config, database, providerInventory, backup, services, blockers) {
  const uniqueBlockers = [...new Set(blockers)].sort();
  const backupRestoreVerified = backup?.backupRestoreVerified === true;
  const resetRehearsalVerified = backup?.resetRehearsalVerified === true;
  return {
    contract: CONTRACT,
    environment: "staging",
    project: PROJECT,
    sha: config.sha,
    mode: "diagnose",
    runId: config.runId,
    attempt: config.attempt,
    generatedAt: new Date().toISOString(),
    inventoryDigest: database.fingerprint,
    catalogDigest: database.catalogDigest,
    journalDigest: database.journalDigest,
    providerDigest: providerDigest(providerInventory),
    contextDigest: hash(config.context),
    backupDigest: hash(backup ?? { verified: false }),
    writerDigest: writerDigest(services),
    counts: database.counts,
    authCandidateCount: 0,
    storageCandidateCount: providerInventory.selected.length,
    blockers: uniqueBlockers,
    readyForReset:
      uniqueBlockers.length === 0 &&
      backupRestoreVerified &&
      resetRehearsalVerified,
    backupRestoreVerified,
    resetRehearsalVerified,
    status: "passed",
  };
}

function assertPrivateReceipt(receipt, report, config) {
  requireThat(
    receipt?.contract === CONTRACT &&
      receipt.sha === config.sha &&
      receipt.sourceRunId === config.sourceRunId,
    "PRIVATE_RECEIPT_IDENTITY",
  );
  requireThat(hash(receipt.context) === report.contextDigest, "PRIVATE_CONTEXT");
  requireThat(
    receipt.database?.fingerprint === report.inventoryDigest &&
      receipt.database?.catalogDigest === report.catalogDigest &&
      receipt.database?.journalDigest === report.journalDigest,
    "PRIVATE_DATABASE_DIGEST",
  );
  requireThat(
    providerDigest(receipt.provider) === report.providerDigest,
    "PRIVATE_PROVIDER_DIGEST",
  );
  requireThat(hash(receipt.backup) === report.backupDigest, "PRIVATE_BACKUP_DIGEST");
  requireThat(writerDigest(receipt.services) === report.writerDigest, "PRIVATE_WRITER_DIGEST");
  requireThat(
    receipt.backup?.backupRestoreVerified === true &&
      receipt.backup?.resetRehearsalVerified === true,
    "PRIVATE_BACKUP_NOT_READY",
  );
}

async function readOnlyInventory(client, context) {
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    return await inventoryDatabase(client, context);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
  }
}

async function diagnose(config, evidence, client, providers, services) {
  await evidence.assertMain(config.sha);
  await evidence.assertValidation(config.sha);

  const serviceState = await services.inventory();
  const directory = await privateOperationDirectory(config.context.operationId);
  let database;
  let providerInventory;
  let backup = null;
  let storageBackups = [];
  const blockers = [];

  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    database = await inventoryDatabase(client, config.context);
    blockers.push(...database.blockers);
    providerInventory = await providers.inventory(database);

    try {
      await verifyProviderPayments(database);
    } catch (error) {
      blockers.push(safeError(error, "payments").code);
    }

    if (blockers.length === 0) {
      storageBackups = await providers.backupObjects(
        providerInventory.selected,
        join(directory, "storage"),
      );
      backup = await backupAndRehearse(
        client,
        postgresProcessEnv(config),
        directory,
        database,
      );
    }
  } finally {
    await client.query("ROLLBACK").catch(() => {});
  }

  const report = diagnoseReport(
    config,
    database,
    providerInventory,
    backup,
    serviceState,
    blockers,
  );

  await writePrivate(join(directory, PRIVATE_RECEIPT), {
    contract: CONTRACT,
    sha: config.sha,
    sourceRunId: config.sourceRunId,
    context: config.context,
    database,
    provider: providerInventory,
    services: serviceState,
    backup,
    storageBackups,
  });
  await writePublic(report);
  return report;
}

async function apply(config, evidence, client, providers, services) {
  await evidence.assertMain(config.sha);
  await evidence.assertValidation(config.sha);

  const report = await evidence.readDiagnose(config.sourceRunId, config.sha);
  const directory = await privateOperationDirectory(config.context.operationId);
  const receipt = await readPrivate(join(directory, PRIVATE_RECEIPT));
  assertPrivateReceipt(receipt, report, config);
  await assertBackupFile(directory, receipt.backup);

  let quiesced = false;
  let providerMutationStarted = false;
  let databaseCommitted = false;
  let currentProvider;

  try {
    await services.quiesce(
      receipt.services,
      (state) => writePrivate(join(directory, SERVICE_RECEIPT), state),
    );
    quiesced = true;

    const currentDatabase = await readOnlyInventory(client, config.context);
    requireThat(
      currentDatabase.fingerprint === receipt.database.fingerprint,
      "INVENTORY_DRIFT",
    );
    requireThat(currentDatabase.blockers.length === 0, "RESET_BLOCKED");

    currentProvider = await providers.inventory(currentDatabase);
    requireThat(
      providerDigest(currentProvider) === report.providerDigest,
      "PROVIDER_INVENTORY_DRIFT",
    );
    await verifyProviderPayments(currentDatabase);

    const reset = await resetDatabase(client, receipt.database, {
      beforeCommit: async () => {
        providerMutationStarted = true;
        await providers.removeObjects(
          currentProvider.selected,
          currentProvider.all,
        );
      },
    });
    databaseCommitted = reset.committed === true;

    await services.resume(receipt.services);
    quiesced = false;

    const result = {
      contract: CONTRACT,
      environment: "staging",
      project: PROJECT,
      sha: config.sha,
      mode: "apply",
      runId: config.runId,
      attempt: config.attempt,
      sourceRunId: config.sourceRunId,
      status: "passed",
      completedAt: new Date().toISOString(),
      databaseCommitted,
      tenantIsolationVerified: reset.proof?.tenantIsolationVerified === true,
      authenticationActivationRequired:
        reset.proof?.authenticationActivationRequired === true,
    };
    await writePrivate(join(directory, "apply-private.json"), {
      result,
      fixture: reset.fixture,
    });
    await writePublic(result);
    return result;
  } catch (error) {
    const safe = safeError(error, "apply");
    let recoveryRequired =
      safe.code === "COMMIT_OUTCOME_UNKNOWN" || databaseCommitted;

    if (
      providerMutationStarted &&
      !databaseCommitted &&
      safe.code !== "COMMIT_OUTCOME_UNKNOWN"
    ) {
      try {
        await providers.restoreObjects(
          receipt.storageBackups,
          join(directory, "storage"),
        );
      } catch {
        recoveryRequired = true;
      }
    }

    if (quiesced) {
      try {
        await services.resume(receipt.services);
        quiesced = false;
      } catch {
        recoveryRequired = true;
      }
    }

    if (recoveryRequired) {
      const recovery = new Error("recovery_required");
      recovery.code = "RECOVERY_REQUIRED";
      recovery.phase = "apply";
      throw recovery;
    }
    throw safe;
  }
}

async function verify(config, evidence, client, providers, services) {
  await evidence.assertMain(config.sha);
  await evidence.assertValidation(config.sha);

  const report = await evidence.readDiagnose(config.sourceRunId, config.sha);
  const directory = await privateOperationDirectory(config.context.operationId);
  const receipt = await readPrivate(join(directory, PRIVATE_RECEIPT));
  assertPrivateReceipt(receipt, report, config);

  const currentServices = await services.inventory();
  requireThat(
    writerDigest(currentServices) === writerDigest(receipt.services),
    "WRITER_STATE_DRIFT",
  );

  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  let database;
  let proof;
  try {
    database = await inventoryDatabase(client, config.context);
    proof = await verifyCanonical(client, config.context);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
  }

  requireThat(database.blockers.length === 0, "VERIFY_BLOCKED");
  requireThat(database.catalogDigest === report.catalogDigest, "CATALOG_CHANGED");
  requireThat(database.journalDigest === report.journalDigest, "JOURNAL_CHANGED");

  const currentProvider = await providers.inventory(database);
  requireThat(
    currentProvider.authDigest === receipt.provider.authDigest,
    "AUTH_IDENTITY_DRIFT",
  );
  requireThat(currentProvider.selected.length === 0, "STORAGE_TEST_OBJECTS_REMAIN");

  const removed = new Set(
    receipt.provider.selected.map((item) => `${item.bucket}/${item.path}`),
  );
  const retained = receipt.provider.all.filter(
    (item) => !removed.has(`${item.bucket}/${item.path}`),
  );
  requireThat(
    hash(currentProvider.all) === hash(retained),
    "STORAGE_RETAINED_DRIFT",
  );

  const result = {
    contract: CONTRACT,
    environment: "staging",
    project: PROJECT,
    sha: config.sha,
    mode: "verify",
    runId: config.runId,
    attempt: config.attempt,
    sourceRunId: config.sourceRunId,
    status: "passed",
    completedAt: new Date().toISOString(),
    tenantIsolationVerified: proof?.tenantIsolationVerified === true,
    authenticationActivationRequired:
      proof?.authenticationActivationRequired === true,
    journalDigest: database.journalDigest,
    catalogDigest: database.catalogDigest,
  };
  await writePublic(result);
  return result;
}

async function main() {
  let config;
  let client;
  try {
    config = validateEnvironment(process.env);
    const evidence = githubEvidence(process.env.GITHUB_TOKEN);
    const providers = createProviderAdapter(
      providerClient(config),
      { origin: config.origin },
    );
    const services = createServiceControl(config.units);
    client = databaseClient(config);
    await client.connect();

    if (config.mode === "diagnose") {
      await diagnose(config, evidence, client, providers, services);
    } else if (config.mode === "apply") {
      await apply(config, evidence, client, providers, services);
    } else {
      await verify(config, evidence, client, providers, services);
    }
  } catch (error) {
    if (config) {
      await writePublic(publicFailure(config, error)).catch(() => {});
    }
    const safe = safeError(error, config?.mode ?? "preflight");
    console.error(`${CONTRACT}: ${safe.code}`);
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => {});
  }
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file:").href
) {
  main();
}
