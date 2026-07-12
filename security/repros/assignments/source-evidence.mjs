import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const SOURCE_FILES = {
  backofficeAssignments: "artifacts/backoffice/src/app/actions/assignments.ts",
  assignmentForm: "artifacts/backoffice/src/components/assignments/AssignmentForm.tsx",
  statusStepper: "artifacts/backoffice/src/components/assignments/AssignmentStatusStepper.tsx",
  planningActions: "artifacts/backoffice/src/app/actions/planning.ts",
  planningIntelligence: "lib/db/src/planning-intelligence.ts",
  assignmentSchema: "lib/db/src/schema/assignments.ts",
  planningSchema: "lib/db/src/schema/planning-intelligence.ts",
  personnelOpenAssignments: "artifacts/personeel-pwa/src/actions/open-assignments.ts",
};

function read(root, relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

export function lineNumber(source, needle) {
  const index = source.indexOf(needle);
  if (index === -1) return null;
  return source.slice(0, index).split(/\r?\n/u).length;
}

export function exportedFunctionBody(source, name) {
  const asyncMarker = `export async function ${name}`;
  const functionMarker = `export function ${name}`;
  const start = source.indexOf(asyncMarker) >= 0
    ? source.indexOf(asyncMarker)
    : source.indexOf(functionMarker);
  if (start === -1) {
    throw new Error(`Missing exported function ${name}`);
  }
  const nextAsync = source.indexOf("\nexport async function ", start + 1);
  const nextSync = source.indexOf("\nexport function ", start + 1);
  const candidates = [nextAsync, nextSync].filter((index) => index !== -1);
  const end = candidates.length > 0 ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

function evidence(root = DEFAULT_ROOT) {
  const assignments = read(root, SOURCE_FILES.backofficeAssignments);
  const assignmentForm = read(root, SOURCE_FILES.assignmentForm);
  const stepper = read(root, SOURCE_FILES.statusStepper);
  const planningActions = read(root, SOURCE_FILES.planningActions);
  const planning = read(root, SOURCE_FILES.planningIntelligence);
  const assignmentSchema = read(root, SOURCE_FILES.assignmentSchema);
  const planningSchema = read(root, SOURCE_FILES.planningSchema);
  const openAssignments = read(root, SOURCE_FILES.personnelOpenAssignments);

  const body = (name) => exportedFunctionBody(assignments, name);
  const planningBody = (name) => exportedFunctionBody(planning, name);
  const openBody = (name) => exportedFunctionBody(openAssignments, name);

  return [
    {
      id: "P0-A-allowAny-status-override",
      finding: "P0-A",
      title: "Direct status override bypasses assignment transition graph",
      classification: "reproduced_requires_real_database",
      entrypoint: "setAssignmentStatus",
      source: SOURCE_FILES.backofficeAssignments,
      line: lineNumber(assignments, "export async function setAssignmentStatus"),
      currentFailingExploitEvidence: true,
      assertions: {
        unauthorizedCall: /options\?: \{ allowAny\?: boolean \}/u.test(body("setAssignmentStatus"))
          && /!options\?\.allowAny && !allowed\.includes\(newStatus\)/u.test(body("setAssignmentStatus")),
        parentRowChanged: /\.update\(assignmentsTable\)[\s\S]+\.set\(\{ status: newStatus/u.test(body("setAssignmentStatus")),
        childOrSideEffectRowChanged: false,
        auditAndDenial: /action: options\?\.allowAny \? "status_override" : "status_change"/u.test(body("setAssignmentStatus")),
      },
      notes: "The server action has a real tenant check, but `allowAny` intentionally skips illegal transition denial and writes a status_override audit instead.",
    },
    {
      id: "P0-A-generic-edit-status-payload",
      finding: "P0-A",
      title: "Generic edit payload writes arbitrary status without transition validation",
      classification: "reproduced_requires_real_database",
      entrypoint: "updateAssignment",
      source: SOURCE_FILES.backofficeAssignments,
      line: lineNumber(assignments, "export async function updateAssignment"),
      currentFailingExploitEvidence: true,
      assertions: {
        unauthorizedCall: /status: data\.status/u.test(body("updateAssignment"))
          && !/ASSIGNMENT_STATUS_TRANSITIONS/u.test(body("updateAssignment")),
        parentRowChanged: /\.update\(assignmentsTable\)[\s\S]+eq\(assignmentsTable\.tenantId,\s*tenantId\)/u.test(body("updateAssignment")),
        childOrSideEffectRowChanged: /calculateAssignmentCapacity\(id,\s*\{[\s\S]+persist: true/u.test(body("updateAssignment")),
        auditAndDenial: /action: "update"/u.test(body("updateAssignment"))
          && !/not found|niet gevonden/i.test(body("updateAssignment").slice(body("updateAssignment").indexOf(".update(assignmentsTable)"))),
      },
      notes: "Same-tenant illegal transitions are accepted through updateAssignment because updateAssignmentSchema only validates enum shape.",
    },
    {
      id: "P0-A-assignment-form-all-statuses",
      finding: "P0-A",
      title: "Generic assignment form accepts and exposes all statuses",
      classification: "reproduced_requires_real_database",
      entrypoint: "AssignmentForm",
      source: SOURCE_FILES.assignmentForm,
      line: lineNumber(assignmentForm, "const formSchema = z.object"),
      currentFailingExploitEvidence: true,
      assertions: {
        unauthorizedCall: /status:\s+z\.string\(\)\.min\(1/u.test(assignmentForm)
          && /ASSIGNMENT_STATUSES\.map\(\(s\)/u.test(assignmentForm),
        parentRowChanged: /onValueChange=\{\(v\) => setValue\("status", v\)\}/u.test(assignmentForm),
        childOrSideEffectRowChanged: false,
        auditAndDenial: true,
      },
      notes: "The edit form is not a security boundary, but it feeds the generic edit payload with arbitrary enum statuses.",
    },
    {
      id: "P0-A-status-stepper-all-statuses",
      finding: "P0-A",
      title: "Status dropdown exposes all statuses and calls allowAny",
      classification: "reproduced_requires_real_database",
      entrypoint: "AssignmentStatusStepper",
      source: SOURCE_FILES.statusStepper,
      line: lineNumber(stepper, "export function AssignmentStatusStepper"),
      currentFailingExploitEvidence: true,
      assertions: {
        unauthorizedCall: /getProcessStatuses\("assignment"\)/u.test(stepper)
          && /allowAny: true/u.test(stepper),
        parentRowChanged: /setAssignmentStatus\(assignmentId,\s*nextStatus\.value as AssignmentStatus,\s*\{ allowAny: true \}\)/u.test(stepper),
        childOrSideEffectRowChanged: false,
        auditAndDenial: /Status wijzigen\?/u.test(stepper) && /toast\.error\(result\.message\)/u.test(stepper),
      },
      notes: "The UI is not the security boundary, but it provides a first-party exploit path into the allowAny server action.",
    },
    {
      id: "P0-A-normal-status-action-fixed-control",
      finding: "P0-A",
      title: "Normal setAssignmentStatus call enforces tenant and transition checks",
      classification: "fixed_or_blocked_by_architecture",
      entrypoint: "setAssignmentStatus without allowAny",
      source: SOURCE_FILES.backofficeAssignments,
      line: lineNumber(assignments, "export async function setAssignmentStatus"),
      currentFailingExploitEvidence: false,
      assertions: {
        unauthorizedCall: false,
        parentRowChanged: false,
        childOrSideEffectRowChanged: false,
        auditAndDenial: /eq\(assignmentsTable\.tenantId,\s*tenantId\)/u.test(body("setAssignmentStatus"))
          && /!options\?\.allowAny && !allowed\.includes\(newStatus\)/u.test(body("setAssignmentStatus")),
      },
      notes: "A direct normal call such as requested -> closed should be denied; the reproduced bypass is the exported allowAny path.",
    },
    {
      id: "P0-B-removePersonnel",
      finding: "P0-B",
      title: "removePersonnel deletes child link by assignmentId/linkId without tenant parent check",
      classification: "reproduced_requires_real_database",
      entrypoint: "removePersonnel",
      source: SOURCE_FILES.backofficeAssignments,
      line: lineNumber(assignments, "export async function removePersonnel"),
      currentFailingExploitEvidence: true,
      assertions: {
        unauthorizedCall: /const tenantId = await requireCurrentTenantId\(\)/u.test(body("removePersonnel"))
          && !/from\(assignmentsTable\)/u.test(body("removePersonnel")),
        parentRowChanged: false,
        childOrSideEffectRowChanged: /\.delete\(assignmentPersonnelTable\)[\s\S]+eq\(assignmentPersonnelTable\.id,\s*linkId\)[\s\S]+eq\(assignmentPersonnelTable\.assignmentId,\s*assignmentId\)/u.test(body("removePersonnel")),
        auditAndDenial: /action: "remove_personnel"/u.test(body("removePersonnel"))
          && !/Opdracht niet gevonden|organisatie/u.test(body("removePersonnel")),
      },
      notes: "Tenant A can delete a known Tenant B assignment_personnel link while the parent assignment remains unchanged.",
    },
    {
      id: "P0-B-approveDirectly",
      finding: "P0-B",
      title: "approveDirectly fetches and updates assignment by bare id",
      classification: "reproduced_requires_real_database",
      entrypoint: "approveDirectly",
      source: SOURCE_FILES.backofficeAssignments,
      line: lineNumber(assignments, "export async function approveDirectly"),
      currentFailingExploitEvidence: true,
      assertions: {
        unauthorizedCall: !/requireCurrentTenantId/u.test(body("approveDirectly"))
          && /\.where\(eq\(assignmentsTable\.id,\s*id\)\)/u.test(body("approveDirectly")),
        parentRowChanged: /\.set\(\{ status: "approved"[\s\S]+\.set\(\{ status: "plannable"/u.test(body("approveDirectly")),
        childOrSideEffectRowChanged: false,
        auditAndDenial: /action: "direct_approve"/u.test(body("approveDirectly"))
          && !/tenantId/u.test(body("approveDirectly")),
      },
      notes: "Tenant A can drive a known Tenant B review assignment to plannable.",
    },
    {
      id: "P0-B-deleteAssignment",
      finding: "P0-B",
      title: "deleteAssignment deletes parent by bare id and cascades children",
      classification: "reproduced_requires_real_database",
      entrypoint: "deleteAssignment",
      source: SOURCE_FILES.backofficeAssignments,
      line: lineNumber(assignments, "export async function deleteAssignment"),
      currentFailingExploitEvidence: true,
      assertions: {
        unauthorizedCall: !/requireCurrentTenantId/u.test(body("deleteAssignment"))
          && /\.where\(eq\(assignmentsTable\.id,\s*id\)\)/u.test(body("deleteAssignment")),
        parentRowChanged: /\.delete\(assignmentsTable\)\.where\(eq\(assignmentsTable\.id,\s*id\)\)/u.test(body("deleteAssignment")),
        childOrSideEffectRowChanged: /onDelete: "cascade"/u.test(assignmentSchema),
        auditAndDenial: /action: "delete"/u.test(body("deleteAssignment"))
          && !/tenantId/u.test(body("deleteAssignment")),
      },
      notes: "The assignment delete is a parent-row IDOR; child changes come from assignment_personnel and assignment_tasks cascades.",
    },
    {
      id: "P0-B-history-helpers",
      finding: "P0-B",
      title: "Assignment history helpers read by foreign UUID without tenant scope",
      classification: "reproduced_requires_real_database",
      entrypoint: "listAssignmentsForCustomer/listAssignmentsForObject/listAssignmentsForPersonnel",
      source: SOURCE_FILES.backofficeAssignments,
      line: lineNumber(assignments, "export async function listAssignmentsForCustomer"),
      currentFailingExploitEvidence: true,
      assertions: {
        unauthorizedCall: ["listAssignmentsForCustomer", "listAssignmentsForObject", "listAssignmentsForPersonnel"].every((name) =>
          !/requireCurrentTenantId/u.test(body(name)) && /\.where\(eq\(/u.test(body(name))),
        parentRowChanged: false,
        childOrSideEffectRowChanged: false,
        auditAndDenial: ["listAssignmentsForCustomer", "listAssignmentsForObject", "listAssignmentsForPersonnel"].every((name) =>
          !/auditLogTable/u.test(body(name)) && !/denied|niet gevonden/i.test(body(name))),
      },
      notes: "These are read IDORs: no row changes, no audit, no denial signal.",
    },
    {
      id: "P0-B-reschedule",
      finding: "P0-B",
      title: "rescheduleAssignment moves assignment by bare id",
      classification: "reproduced_requires_real_database",
      entrypoint: "rescheduleAssignment",
      source: SOURCE_FILES.backofficeAssignments,
      line: lineNumber(assignments, "export async function rescheduleAssignment"),
      currentFailingExploitEvidence: true,
      assertions: {
        unauthorizedCall: !/requireCurrentTenantId/u.test(body("rescheduleAssignment"))
          && /\.where\(eq\(assignmentsTable\.id,\s*id\)\)/u.test(body("rescheduleAssignment")),
        parentRowChanged: /\.set\(\{ scheduledDate: newDate \}\)[\s\S]+\.where\(eq\(assignmentsTable\.id,\s*id\)\)/u.test(body("rescheduleAssignment")),
        childOrSideEffectRowChanged: /safeRefreshPlanningRoutesForAssignment/u.test(body("rescheduleAssignment")),
        auditAndDenial: /action: "reschedule"/u.test(body("rescheduleAssignment")),
      },
      notes: "Planning writers can move a known Tenant B plannable/scheduled assignment.",
    },
    {
      id: "P0-B-reshift",
      finding: "P0-B",
      title: "reshiftAssignment changes time slot by bare id",
      classification: "reproduced_requires_real_database",
      entrypoint: "reshiftAssignment",
      source: SOURCE_FILES.backofficeAssignments,
      line: lineNumber(assignments, "export async function reshiftAssignment"),
      currentFailingExploitEvidence: true,
      assertions: {
        unauthorizedCall: !/requireCurrentTenantId/u.test(body("reshiftAssignment"))
          && /\.where\(eq\(assignmentsTable\.id,\s*id\)\)/u.test(body("reshiftAssignment")),
        parentRowChanged: /\.set\(\{ scheduledStart: newStart, scheduledEnd: newEnd \}\)/u.test(body("reshiftAssignment")),
        childOrSideEffectRowChanged: /safeRefreshPlanningRoutesForAssignment/u.test(body("reshiftAssignment")),
        auditAndDenial: /action: "reshift"/u.test(body("reshiftAssignment")),
      },
      notes: "The route suggestion wrapper is tenant-scoped, but direct reshiftAssignment remains an IDOR surface.",
    },
    {
      id: "P0-B-task-personnel-child-fixed-controls",
      finding: "P0-B",
      title: "Task add/remove and assignPersonnel are blocked by parent tenant checks",
      classification: "fixed_or_blocked_by_architecture",
      entrypoint: "assignPersonnel/addAssignmentTask/removeAssignmentTask/applyRouteTimeSuggestion",
      source: SOURCE_FILES.backofficeAssignments,
      line: lineNumber(assignments, "export async function assignPersonnel"),
      currentFailingExploitEvidence: false,
      assertions: {
        unauthorizedCall: false,
        parentRowChanged: false,
        childOrSideEffectRowChanged: false,
        auditAndDenial: /eq\(assignmentsTable\.tenantId,\s*tenantId\)/u.test(body("assignPersonnel"))
          && /eq\(assignmentsTable\.tenantId,\s*tenantId\)/u.test(body("addAssignmentTask"))
          && /eq\(assignmentsTable\.tenantId,\s*tenantId\)/u.test(body("removeAssignmentTask"))
          && /eq\(assignmentRouteContextsTable\.tenantId,\s*tenantId\)/u.test(body("applyRouteTimeSuggestion")),
      },
      notes: "These wrappers should deny Tenant A attempts before child mutation; a live DB denial test should assert no audit after denial.",
    },
    {
      id: "P0-C-updateAssignment-capacity-side-effect",
      finding: "P0-C",
      title: "Cross-tenant updateAssignment can leave parent unchanged but recalculate Tenant B capacity",
      classification: "reproduced_requires_real_database",
      entrypoint: "updateAssignment + calculateAssignmentCapacity",
      source: SOURCE_FILES.backofficeAssignments,
      line: lineNumber(assignments, "export async function updateAssignment"),
      currentFailingExploitEvidence: true,
      assertions: {
        unauthorizedCall: /\.where\(and\(eq\(assignmentsTable\.id,\s*id\),\s*eq\(assignmentsTable\.tenantId,\s*tenantId\)\)\)/u.test(body("updateAssignment"))
          && !/returning/u.test(body("updateAssignment")),
        parentRowChanged: false,
        childOrSideEffectRowChanged: /calculateAssignmentCapacity\(id,\s*\{[\s\S]+persist: true/u.test(body("updateAssignment"))
          && /\.where\(eq\(assignmentsTable\.id,\s*assignmentId\)\)/u.test(planningBody("calculateAssignmentCapacity")),
        auditAndDenial: /action: "update"/u.test(body("updateAssignment"))
          && !/Opdracht niet gevonden|denied/i.test(body("updateAssignment")),
      },
      notes: "With a Tenant B id, the tenant-scoped update affects zero parent rows, then the bare-id capacity engine persists Tenant B capacity/candidates.",
    },
    {
      id: "P0-D-planning-readiness",
      finding: "P0-D",
      title: "Planning readiness loads assignment and interest state by assignmentId without tenant scope",
      classification: "reproduced_requires_real_database",
      entrypoint: "getAssignmentPlanningReadiness",
      source: SOURCE_FILES.backofficeAssignments,
      line: lineNumber(assignments, "export async function getAssignmentPlanningReadiness"),
      currentFailingExploitEvidence: true,
      assertions: {
        unauthorizedCall: /Promise\.all\(\[[\s\S]+\.where\(eq\(assignmentsTable\.id,\s*assignmentId\)\)/u.test(body("getAssignmentPlanningReadiness")),
        parentRowChanged: false,
        childOrSideEffectRowChanged: /calculateAssignmentCapacity\(assignmentId,\s*\{ persist: true \}\)/u.test(body("getAssignmentPlanningReadiness")),
        auditAndDenial: !/auditLogTable/u.test(body("getAssignmentPlanningReadiness"))
          && !/requireCurrentTenantId/u.test(body("getAssignmentPlanningReadiness")),
      },
      notes: "A read helper also has a persisted capacity side effect.",
    },
    {
      id: "P0-D-recalculate-capacity-action",
      finding: "P0-D",
      title: "Recalculate action persists capacity by assignmentId without tenant actor scope",
      classification: "reproduced_requires_real_database",
      entrypoint: "recalculateAssignmentCapacity",
      source: SOURCE_FILES.backofficeAssignments,
      line: lineNumber(assignments, "export async function recalculateAssignmentCapacity"),
      currentFailingExploitEvidence: true,
      assertions: {
        unauthorizedCall: !/requireCurrentTenantId/u.test(body("recalculateAssignmentCapacity"))
          && /calculateAssignmentCapacity\(assignmentId,\s*\{[\s\S]+persist: true/u.test(body("recalculateAssignmentCapacity")),
        parentRowChanged: false,
        childOrSideEffectRowChanged: true,
        auditAndDenial: /action: "assignment_capacity_recalculate"/u.test(body("recalculateAssignmentCapacity")),
      },
      notes: "Planning writers can explicitly trigger Tenant B capacity/candidate persistence by known assignment ID.",
    },
    {
      id: "P0-D-interest-round-send",
      finding: "P0-D",
      title: "sendAssignmentInterestPoll creates rounds/responses for assignmentId without tenant actor scope",
      classification: "reproduced_requires_real_database",
      entrypoint: "sendAssignmentInterestPoll",
      source: SOURCE_FILES.backofficeAssignments,
      line: lineNumber(assignments, "export async function sendAssignmentInterestPoll"),
      currentFailingExploitEvidence: true,
      assertions: {
        unauthorizedCall: !/requireCurrentTenantId/u.test(body("sendAssignmentInterestPoll"))
          && /\.where\(eq\(assignmentsTable\.id,\s*assignmentId\)\)/u.test(body("sendAssignmentInterestPoll")),
        parentRowChanged: false,
        childOrSideEffectRowChanged: /\.insert\(assignmentInterestRoundsTable\)/u.test(body("sendAssignmentInterestPoll"))
          && /\.insert\(assignmentInterestResponsesTable\)/u.test(body("sendAssignmentInterestPoll")),
        auditAndDenial: /action: "assignment_interest_poll"/u.test(body("sendAssignmentInterestPoll")),
      },
      notes: "The written rows use the target assignment tenant, not the actor tenant.",
    },
    {
      id: "P0-D-interest-reminder",
      finding: "P0-D",
      title: "Interest reminder mutates round by roundId and assignmentId without tenant scope",
      classification: "reproduced_requires_real_database",
      entrypoint: "sendAssignmentInterestReminder",
      source: SOURCE_FILES.backofficeAssignments,
      line: lineNumber(assignments, "export async function sendAssignmentInterestReminder"),
      currentFailingExploitEvidence: true,
      assertions: {
        unauthorizedCall: !/requireCurrentTenantId/u.test(body("sendAssignmentInterestReminder"))
          && /eq\(assignmentInterestRoundsTable\.id,\s*roundId\)/u.test(body("sendAssignmentInterestReminder"))
          && /\.where\(eq\(assignmentsTable\.id,\s*assignmentId\)\)/u.test(body("sendAssignmentInterestReminder")),
        parentRowChanged: false,
        childOrSideEffectRowChanged: /\.update\(assignmentInterestRoundsTable\)[\s\S]+reminderSentAt/u.test(body("sendAssignmentInterestReminder")),
        auditAndDenial: /action: "assignment_interest_reminder"/u.test(body("sendAssignmentInterestReminder")),
      },
      notes: "Tenant A can send a reminder for a known Tenant B round and emit notification side effects.",
    },
    {
      id: "P0-D-interest-history",
      finding: "P0-D",
      title: "Interest round history reads rounds/responses by assignmentId without tenant scope",
      classification: "reproduced_requires_real_database",
      entrypoint: "listAssignmentInterestRounds",
      source: SOURCE_FILES.backofficeAssignments,
      line: lineNumber(assignments, "export async function listAssignmentInterestRounds"),
      currentFailingExploitEvidence: true,
      assertions: {
        unauthorizedCall: !/requireCurrentTenantId/u.test(body("listAssignmentInterestRounds"))
          && /eq\(assignmentInterestRoundsTable\.assignmentId,\s*assignmentId\)/u.test(body("listAssignmentInterestRounds")),
        parentRowChanged: false,
        childOrSideEffectRowChanged: false,
        auditAndDenial: !/auditLogTable/u.test(body("listAssignmentInterestRounds")),
      },
      notes: "Read-only IDOR for interest round and response detail.",
    },
    {
      id: "P0-D-capacity-defaults-latest",
      finding: "P0-D",
      title: "Capacity/default helpers load and persist by assignmentId without tenantId",
      classification: "reproduced_requires_real_database",
      entrypoint: "calculateAssignmentCapacity/getLatestAssignmentCapacity/getSmartPlanningRoundDefaults",
      source: SOURCE_FILES.planningIntelligence,
      line: lineNumber(planning, "export async function calculateAssignmentCapacity"),
      currentFailingExploitEvidence: true,
      assertions: {
        unauthorizedCall: /\.where\(eq\(assignmentsTable\.id,\s*assignmentId\)\)/u.test(planningBody("calculateAssignmentCapacity"))
          && /\.where\(eq\(assignmentsTable\.id,\s*assignmentId\)\)/u.test(planningBody("getSmartPlanningRoundDefaults")),
        parentRowChanged: false,
        childOrSideEffectRowChanged: /\.update\(assignmentCapacityChecksTable\)[\s\S]+eq\(assignmentCapacityChecksTable\.assignmentId,\s*result\.assignmentId\)/u.test(planning)
          && /\.onConflictDoUpdate\(/u.test(planning),
        auditAndDenial: !/requireCurrentTenantId/u.test(planningBody("calculateAssignmentCapacity")),
      },
      notes: "The DB-layer helpers need a tenant-aware contract before callers can be made safe.",
    },
    {
      id: "P0-D-mark-interest-candidate-fixed-control",
      finding: "P0-D",
      title: "Backoffice interest candidate selection is tenant-scoped",
      classification: "fixed_or_blocked_by_architecture",
      entrypoint: "markInterestCandidate",
      source: SOURCE_FILES.backofficeAssignments,
      line: lineNumber(assignments, "export async function markInterestCandidate"),
      currentFailingExploitEvidence: false,
      assertions: {
        unauthorizedCall: false,
        parentRowChanged: false,
        childOrSideEffectRowChanged: false,
        auditAndDenial: /const tenantId = await requireCurrentTenantId\(\)/u.test(body("markInterestCandidate"))
          && /eq\(assignmentsTable\.tenantId,\s*tenantId\)/u.test(body("markInterestCandidate")),
      },
      notes: "Tenant A calls against Tenant B responses should fail before success audit or response mutation.",
    },
    {
      id: "P0-D-personnel-interest-actions-fixed-controls",
      finding: "P0-D",
      title: "Personnel PWA interest apply/decline actions include personnel and tenant response filters",
      classification: "fixed_or_blocked_by_architecture",
      entrypoint: "applyForAssignment/declineAssignmentInterest",
      source: SOURCE_FILES.personnelOpenAssignments,
      line: lineNumber(openAssignments, "export async function applyForAssignment"),
      currentFailingExploitEvidence: false,
      assertions: {
        unauthorizedCall: false,
        parentRowChanged: false,
        childOrSideEffectRowChanged: false,
        auditAndDenial: /eq\(assignmentInterestResponsesTable\.personnelId,\s*personnel\.id\)/u.test(openBody("applyForAssignment"))
          && /eq\(assignmentInterestResponsesTable\.tenantId,\s*personnel\.tenantId\)/u.test(openBody("applyForAssignment"))
          && /eq\(assignmentsTable\.tenantId,\s*personnel\.tenantId\)/u.test(openBody("applyForAssignment"))
          && /eq\(assignmentInterestResponsesTable\.tenantId,\s*personnel\.tenantId\)/u.test(openBody("declineAssignmentInterest")),
      },
      notes: "Personnel-side response mutation is scoped to the logged-in personnel tenant and is a denial-control candidate for live DB tests.",
    },
    {
      id: "P0-D-planning-board-stale-candidates-blocked",
      finding: "P0-D",
      title: "Planning board stale-candidate load is reachable only from tenant-scoped assignment IDs",
      classification: "fixed_or_blocked_by_architecture",
      entrypoint: "getPlanningBoardData",
      source: SOURCE_FILES.planningActions,
      line: lineNumber(planningActions, "export async function getPlanningBoardData"),
      currentFailingExploitEvidence: false,
      assertions: {
        unauthorizedCall: false,
        parentRowChanged: false,
        childOrSideEffectRowChanged: false,
        auditAndDenial: /const tenantId = await requireCurrentTenantId\(\)/u.test(planningActions)
          && /eq\(assignmentsTable\.tenantId,\s*tenantId\)/u.test(planningActions)
          && /inArray\(assignmentCandidatesTable\.assignmentId,\s*assignmentIds\)/u.test(planningActions),
      },
      notes: "Candidate query lacks its own tenant predicate, but exported board data derives assignmentIds from a tenant-scoped assignment query.",
    },
  ];
}

export function buildAssignmentP0Evidence(options = {}) {
  return evidence(options.root ? path.resolve(options.root) : DEFAULT_ROOT);
}

export function summarizeAssignmentP0Evidence(options = {}) {
  const rows = buildAssignmentP0Evidence(options);
  return {
    total: rows.length,
    currentFailingExploitEvidence: rows.filter((row) => row.currentFailingExploitEvidence).length,
    fixedOrBlockedControls: rows.filter((row) => row.classification === "fixed_or_blocked_by_architecture").length,
    requiresRealDatabase: rows.filter((row) => row.classification.endsWith("requires_real_database")).length,
    byFinding: rows.reduce((acc, row) => {
      acc[row.finding] = (acc[row.finding] ?? 0) + 1;
      return acc;
    }, {}),
  };
}
