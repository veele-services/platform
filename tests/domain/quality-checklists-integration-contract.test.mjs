import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const reconciliation = read("lib/db/src/checklist-reconciliation.ts");
const assignmentActions = read("artifacts/backoffice/src/app/actions/assignments.ts");
const planningActions = read("artifacts/backoffice/src/app/actions/planning.ts");
const personnelActions = read("artifacts/personeel-pwa/src/actions/assignments.ts");
const reportActions = read("artifacts/personeel-pwa/src/actions/reports.ts");
const offlineQueue = read("artifacts/personeel-pwa/src/lib/offline/work-order-queue.ts");
const offlineProvider = read("artifacts/personeel-pwa/src/components/PersonnelRealtimeOfflineProvider.tsx");
const personnelUi = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/DynamicChecklistCard.tsx");
const managementUi = read("artifacts/backoffice/src/components/checklists/ChecklistManagement.tsx");

test("all canonical work-order context mutations call the central recoverable reconciler", () => {
  for (const trigger of ["assignment_created", "assignment_context_changed", "assignment_task_changed", "assignment_staffing_changed", "assignment_scheduled"]) {
    assert.match(`${assignmentActions}\n${planningActions}`, new RegExp(`trigger: "${trigger}"`, "u"), `${trigger} is not wired`);
  }
  assert.match(assignmentActions, /assignment-task-added:/u);
  assert.match(assignmentActions, /assignment-task-removed:/u);
  assert.match(assignmentActions, /finalizeAssignmentChecklists[\s\S]*outcome: "cancelled"/u);
  assert.match(reconciliation, /status: "queued"/u);
  assert.match(reconciliation, /status IN \('pending', 'failed'\)/u);
});

test("start and completion remain authoritative server-side gates", () => {
  assert.match(personnelActions, /prepareAssignmentChecklistsForStart/u);
  assert.match(personnelActions, /getAssignmentChecklistCompletionIssues/u);
  assert.match(personnelActions, /blockingMoments: \["before_complete", "before_report_submit"\]/u);
  assert.match(personnelActions, /checklistIssues\.slice\(0, 3\).*issue\.message/su);
  assert.match(personnelActions, /finalizeAssignmentChecklists[\s\S]*outcome: "completed"/u);
  assert.match(
    reconciliation,
    /SET status = \$4::varchar[\s\S]*CASE WHEN \$4::varchar = 'completed'[\s\S]*CASE WHEN \$4::varchar = 'cancelled'/u,
    "terminal checklist updates must give the shared outcome parameter one explicit PostgreSQL type",
  );
  assert.match(reconciliation, /Checklistwijzigingen wachten op beoordeling; starten is geblokkeerd/u);
  assert.match(reconciliation, /blockingMoment: "before_start"/u);
  assert.match(reportActions, /blockingMoment: "before_report_submit"/u);
  assert.match(reportActions, /checklistIssues\.slice\(0, 3\).*issue\.message/su);
});

test("offline checklist answers use the existing durable queue and optimistic revisions", () => {
  assert.match(offlineQueue, /type: "set-checklist-answer"/u);
  assert.match(offlineQueue, /expectedRevision/u);
  assert.match(offlineProvider, /setAssignmentChecklistAnswer/u);
  assert.match(reconciliation, /revision = revision \+ 1/u);
  assert.match(reconciliation, /op een ander apparaat gewijzigd/u);
});

test("personnel UI supports every required field family and append-only evidence", () => {
  for (const field of ["checkbox", "short_text", "long_text", "single_choice", "multiple_choice", "number", "measurement", "date", "datetime", "photo", "multi_photo", "signature", "information"]) {
    assert.match(`${personnelUi}\n${managementUi}`, new RegExp(`"${field}"`, "u"), `${field} is missing`);
  }
  assert.match(personnelUi, /visibleWhen/u);
  assert.match(personnelUi, /prepareChecklistEvidenceUpload/u);
  assert.match(personnelUi, /Afwijking \/ niet uitvoerbaar melden/u);
  assert.doesNotMatch(personnelUi, /deleteChecklist|removeChecklist/u);
});

test("management UI uses accessible dialogs for publication, review, version upgrade and waivers", () => {
  assert.match(managementUi, /<AlertDialogTitle>\s*Versie/u);
  assert.match(managementUi, /Nieuwere versies bewust toepassen/u);
  assert.match(managementUi, /Huidige set behouden/u);
  assert.match(managementUi, /Checklist gemotiveerd vrijstellen/u);
  assert.match(managementUi, /Verplichte reden/u);
  assert.match(managementUi, /Waarom is deze checklist van toepassing/u);
  assert.doesNotMatch(managementUi, /window\.confirm|window\.prompt/u);
});
