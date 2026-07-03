import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
  }
}

test("phase 8 backoffice exposes issue status and maintenance followup", () => {
  const action = read("artifacts/backoffice/src/app/actions/inventory-followup.ts");
  const listPage = read("artifacts/backoffice/src/app/(dashboard)/inventory/issues/page.tsx");
  const detailPage = read("artifacts/backoffice/src/app/(dashboard)/inventory/issues/[id]/page.tsx");
  const panel = read("artifacts/backoffice/src/components/inventory/InventoryIssueStatusPanel.tsx");

  assertContains(
    action,
    [
      "listInventoryIssues",
      "getInventoryIssueDetail",
      "updateInventoryIssueStatus",
      "createInventoryMaintenanceEvent",
      "inventory_issues",
      "inventory_maintenance_events",
      "inventory_issue_closed",
      "inventory_maintenance_completed",
      "notification_delivery_queue",
      "inventory.issue.reported",
    ],
    "inventory followup action",
  );
  assertContains(listPage, ["Inventarisstoringen", "listInventoryIssues", "itemId", "Open meldingen"], "issue overview page");
  assertContains(detailPage, ["InventoryIssueStatusPanel", "resolve_issue", "manage_maintenance", "Open inventarisitem"], "issue detail page");
  assertContains(panel, ["Status opvolgen", "Onderhoud / keuring", "Afrondingsnotitie", "Onderhoudshistorie"], "issue status panel");
});

test("phase 8 personnel PWA can report scoped inventory issues", () => {
  const action = read("artifacts/personeel-pwa/src/actions/inventory-issues.ts");
  const form = read("artifacts/personeel-pwa/src/app/scan/inventory/[token]/InventoryIssueReportForm.tsx");
  const scanPage = read("artifacts/personeel-pwa/src/app/scan/inventory/[token]/page.tsx");

  assertContains(
    action,
    [
      "reportInventoryIssue",
      "getScopedInventoryItem",
      "inventory_issues",
      "inventory_issue_reported",
      "notification_delivery_queue",
      "inventory.issue.reported",
      "assignment_personnel",
      "item.current_personnel_id",
      "scopedAssignmentId",
    ],
    "personnel issue action",
  );
  assertContains(form, ["Storing melden", "Prioriteit", "Bewijs / foto-video notitie", "reportInventoryIssue"], "PWA issue form");
  assertContains(scanPage, ["InventoryIssueReportForm", "inventoryItemId={item.id}", "assignmentId={item.relatedAssignmentId}"], "scan page issue form wiring");
});

test("phase 8 inventory detail shows followup health", () => {
  const detailPage = read("artifacts/backoffice/src/app/(dashboard)/inventory/[id]/page.tsx");

  assertContains(
    detailPage,
    [
      "getInventoryFollowupSummary",
      "Open storingen",
      "Urgent/hoog",
      "Volgende onderhoud",
      "/inventory/issues?status=open&itemId=",
    ],
    "inventory detail followup summary",
  );
});
