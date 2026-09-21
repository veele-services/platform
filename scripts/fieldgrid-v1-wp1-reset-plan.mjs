/**
 * WP1's reviewed reset contract. Relation identifiers are deliberately constants:
 * neither dispatch inputs nor environment variables can extend this scope.
 */
export const APPLY_CONFIRMATION = "fieldgrid-v1-wp1-staging-application-cleanup-v1";
export const RESET_PHASES = ["diagnose", "quiesce", "clean", "bootstrap", "verify", "resume"];
export const MIGRATION_JOURNALS = Object.freeze([
  "drizzle.__drizzle_migrations",
  "drizzle.veele_sql_migrations",
]);

// This is the destructive subset. Everything else is either retained, recreated by
// the canonical seed, provider-managed, or explicitly blocks an unsafe reset.
export const RELATION_CLASSIFICATION = Object.freeze({
  notification_delivery_attempts: "delete-test-data", notification_delivery_queue: "delete-test-data",
  notification_dispatches: "delete-test-data", personnel_notifications: "delete-test-data",
  customer_notifications: "delete-test-data", domain_events: "delete-test-data",
  documents: "delete-test-data", assignment_photos: "delete-test-data", reports: "delete-test-data",
  assignment_participant_executions: "delete-test-data", assignment_personnel_lifecycle_history: "delete-test-data",
  assignment_extra_work: "delete-test-data", assignment_tasks: "delete-test-data",
  assignment_personnel: "delete-test-data", assignments: "delete-test-data", payments: "delete-test-data",
  customer_payment_batch_items: "delete-test-data", customer_payment_batches: "delete-test-data",
  invoices: "delete-test-data", quotes: "delete-test-data", object_contacts: "delete-test-data",
  object_personnel: "delete-test-data", objects: "delete-test-data", customer_contacts: "delete-test-data",
  customer_notes: "delete-test-data", customers: "delete-test-data", availability_day_entries: "delete-test-data",
  availability_windows: "delete-test-data", leave_periods: "delete-test-data",
  personnel_qualifications: "delete-test-data", personnel: "delete-test-data",
  tenants: "preserve-configuration", tenant_domains: "preserve-configuration",
  organization_settings: "preserve-configuration", roles: "preserve-configuration",
  tenant_roles: "preserve-configuration", permissions: "preserve-platform",
  tenant_role_permissions: "preserve-platform", user_roles: "preserve-platform",
  "drizzle.__drizzle_migrations": "preserve-migration", "drizzle.veele_sql_migrations": "preserve-migration",
  "auth.users": "provider-managed", "storage.objects": "provider-managed",
});
export const APPLICATION_TABLES = Object.freeze(Object.entries(RELATION_CLASSIFICATION)
  .filter(([, category]) => category === "delete-test-data").map(([relation]) => relation));
export const PROTECTED_TABLES = Object.freeze(Object.entries(RELATION_CLASSIFICATION)
  .filter(([, category]) => category !== "delete-test-data").map(([relation]) => relation));

export function assertRelationClassification(relations) {
  const missing = [...new Set(relations)].filter((relation) => !RELATION_CLASSIFICATION[relation]);
  if (missing.length) throw new Error(`Reset blocked: unclassified relations (${missing.sort().join(",")})`);
}
export function inventoryFingerprint(inventory) {
  return JSON.stringify({ tables: inventory.applicationCounts, storage: inventory.storageObjectCount,
    auth: inventory.authCandidateCount, journals: inventory.migrationJournals });
}
export function evaluatePreflight(input) {
  const blockers = [];
  if (!input.projectVerified || !input.databaseVerified || !input.migrationFrontierValid) blockers.push("identity");
  if (!input.backupEvidence?.verified) blockers.push("backup");
  if (!input.writersCanQuiesce) blockers.push("writers");
  if (!input.canonicalAdminPreservable) blockers.push("administrator");
  if (input.activeOrUnknownPayments > 0) blockers.push("payments");
  if (input.unexpectedCandidates > 0) blockers.push("unexpected-candidates");
  return { ...input, schemaVersion: 2, environment: "staging", readyForReset: blockers.length === 0, blockers };
}
export function assertApplyEligible(preflight, expectedFingerprint) {
  if (!preflight.readyForReset) throw new Error(`Reset blocked: ${preflight.blockers.join(",")}`);
  if (inventoryFingerprint(preflight) !== expectedFingerprint) throw new Error("Reset blocked: inventory changed");
}
export function transition(state, action) {
  const index = RESET_PHASES.indexOf(state.phase);
  if (index < 0 || RESET_PHASES[index + 1] !== action) throw new Error(`Invalid reset transition ${state.phase}->${action}`);
  return { ...state, phase: action };
}
