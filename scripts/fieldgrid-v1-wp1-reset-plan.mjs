/** Pure WP1 reset planner. The executor must supply trusted DB/Auth/Storage adapters. */
export const APPLY_CONFIRMATION = "fieldgrid-v1-wp1-staging-application-cleanup-v1";
export const RESET_PHASES = ["diagnose", "quiesce", "clean", "bootstrap", "verify", "resume"];
export const APPLICATION_TABLES = Object.freeze([
  "notification_delivery_attempts", "notification_delivery_queue", "notification_dispatches",
  "personnel_notifications", "customer_notifications", "documents", "assignment_photos",
  "reports", "assignment_extra_work", "assignment_tasks", "assignment_personnel", "assignments",
  "payments", "invoices", "quotes", "object_contacts", "object_personnel", "objects",
  "customer_contacts", "customer_notes", "customers", "availability_windows", "leave_periods",
  "personnel_qualifications", "personnel",
]);
export const PROTECTED_TABLES = Object.freeze(["__drizzle_migrations", "schema_migrations", "tenants", "tenant_domains", "organization_settings"]);
export function inventoryFingerprint(inventory) {
  return JSON.stringify({tables: inventory.applicationCounts, storage: inventory.storageObjectCount, auth: inventory.authCandidateCount});
}
export function evaluatePreflight(input) {
  const blockers = [];
  if (!input.projectVerified || !input.databaseVerified || !input.migrationFrontierValid) blockers.push("identity");
  if (!input.backupReady) blockers.push("backup");
  if (!input.writersCanQuiesce) blockers.push("writers");
  if (!input.canonicalAdminPreservable) blockers.push("administrator");
  if (input.activeOrUnknownPayments > 0) blockers.push("payments");
  if (input.unexpectedCandidates > 0) blockers.push("unexpected-candidates");
  return {...input, schemaVersion: 1, environment: "staging", readyForReset: blockers.length === 0, blockers};
}
export function assertApplyEligible(preflight, expectedFingerprint) {
  if (!preflight.readyForReset) throw new Error(`Reset blocked: ${preflight.blockers.join(",")}`);
  if (inventoryFingerprint(preflight) !== expectedFingerprint) throw new Error("Reset blocked: inventory changed");
}
export function transition(state, action) {
  const index = RESET_PHASES.indexOf(state.phase);
  if (index < 0 || RESET_PHASES[index + 1] !== action) throw new Error(`Invalid reset transition ${state.phase}->${action}`);
  return {...state, phase: action};
}
