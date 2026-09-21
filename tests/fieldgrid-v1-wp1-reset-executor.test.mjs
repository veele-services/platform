import assert from "node:assert/strict";
import { test } from "node:test";
import { runWp1Reset } from "../scripts/fieldgrid-v1-wp1-reset-executor.mjs";
import { evaluatePreflight, inventoryFingerprint } from "../scripts/fieldgrid-v1-wp1-reset-plan.mjs";

function fakeAdapter() {
  const log = [];
  const inventory = { projectVerified: true, databaseVerified: true, migrationFrontierValid: true,
    backupEvidence: { verified: true }, writersCanQuiesce: true, canonicalAdminPreservable: true,
    activeOrUnknownPayments: 0, unexpectedCandidates: 0, applicationCounts: { customers: 1 },
    storageObjectCount: 0, authCandidateCount: 0, migrationJournals: "stable", storageInventory: [], authCandidates: [] };
  return { inventoryData: inventory, log, inventory: async () => inventory, quiesce: async () => log.push("quiesce"),
    isQuiesced: async () => true, storage: { removeInventoryExactly: async () => log.push("storage") },
    auth: { removeCandidatesExactly: async () => log.push("auth") }, db: { deleteAllowlisted: async () => log.push("db"), bootstrapCanonical: async () => log.push("bootstrap") },
    verify: async () => ({ ready: true }), resume: async () => log.push("resume") };
}
test("disposable adapter completes bounded reset state machine", async () => {
  const adapter = fakeAdapter(); const preflight = evaluatePreflight(adapter.inventoryData);
  const result = await runWp1Reset(adapter, { mode: "apply", preflight, fingerprint: inventoryFingerprint(preflight) });
  assert.equal(result.state.phase, "resume");
  assert.deepEqual(adapter.log, ["quiesce", "storage", "auth", "db", "bootstrap", "resume"]);
});
test("changed inventory fails closed and resumes writers", async () => {
  const adapter = fakeAdapter(); const preflight = evaluatePreflight(adapter.inventoryData);
  adapter.inventoryData.applicationCounts = { customers: 2 };
  await assert.rejects(runWp1Reset(adapter, { mode: "apply", preflight, fingerprint: inventoryFingerprint(preflight) }));
  assert.deepEqual(adapter.log, ["quiesce", "resume"]);
});
