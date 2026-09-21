import assert from "node:assert/strict";
import { test } from "node:test";
import { APPLICATION_TABLES, MIGRATION_JOURNALS, assertApplyEligible, assertRelationClassification, evaluatePreflight, inventoryFingerprint, transition } from "../scripts/fieldgrid-v1-wp1-reset-plan.mjs";

const happy = { projectVerified: true, databaseVerified: true, migrationFrontierValid: true,
  backupEvidence: { verified: true, version: "phase2e-staging-preflight-v2" }, writersCanQuiesce: true,
  canonicalAdminPreservable: true, activeOrUnknownPayments: 0, unexpectedCandidates: 0,
  applicationCounts: { customers: 2 }, storageObjectCount: 1, authCandidateCount: 1, migrationJournals: "fixed" };

for (const [name, patch, expected] of [["project mismatch", { projectVerified: false }, "identity"], ["active payment", { activeOrUnknownPayments: 1 }, "payments"], ["backup absent", { backupEvidence: null }, "backup"], ["writer not quiescible", { writersCanQuiesce: false }, "writers"]]) {
  test(name, () => assert.ok(evaluatePreflight({ ...happy, ...patch }).blockers.includes(expected)));
}
test("classification includes finance and migration journals", () => {
  assert.ok(APPLICATION_TABLES.includes("customer_payment_batches"));
  assert.ok(APPLICATION_TABLES.includes("customer_payment_batch_items"));
  assert.deepEqual(MIGRATION_JOURNALS, ["drizzle.__drizzle_migrations", "drizzle.veele_sql_migrations"]);
  assert.throws(() => assertRelationClassification(["unreviewed_relation"]));
});
test("happy and interrupted paths are deterministic", () => {
  const preflight = evaluatePreflight(happy);
  assert.equal(preflight.readyForReset, true);
  assertApplyEligible(preflight, inventoryFingerprint(preflight));
  assert.throws(() => assertApplyEligible(preflight, "changed"));
  assert.deepEqual(transition({ phase: "diagnose" }, "quiesce"), { phase: "quiesce" });
});
