import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  const normalizedContent = content.replace(/\s+/gu, " ");
  for (const phrase of phrases) {
    assert.ok(
      normalizedContent.includes(phrase.replace(/\s+/gu, " ")),
      `${label} should contain ${phrase}`,
    );
  }
}

test("phase 6 exposes tenant-scoped assignment inventory actions", () => {
  const action = read("artifacts/backoffice/src/app/actions/assignment-inventory.ts");

  assertContains(
    action,
    [
      "listAssignmentInventoryLinks",
      "listAttachableInventoryForAssignment",
      "attachInventoryToAssignment",
      "approveAssignmentInventoryUsage",
      "removeAssignmentInventoryLink",
      "assignment_inventory_items",
      "used",
      "rented",
      "issued",
      "returned",
      "defect_found",
      "approved_unit_price",
      "approved_vat_rate",
      "customer_visible",
      "assignment_inventory_usage_approved",
      "assignment_inventory_usage_rejected",
    ],
    "assignment inventory actions",
  );
});

test("phase 6 backoffice work order route and panel support inventory review", () => {
  const route = read("artifacts/backoffice/src/app/(dashboard)/assignments/[id]/inventory/page.tsx");
  const panel = read("artifacts/backoffice/src/components/inventory/AssignmentInventoryPanel.tsx");

  assertContains(route, ["AssignmentInventoryPanel", "listAssignmentInventoryLinks", "listAttachableInventoryForAssignment"], "assignment inventory route");
  assertContains(
    panel,
    [
      "Inventaris op werkbon",
      "Inventaris is standaard niet factureerbaar",
      "verhuur",
      "Prijs per stuk/periode",
      "BTW (%)",
      "Factureerbaar",
      "Klantzichtbaar",
      "EUR 0,00 is toegestaan",
      "Reden voor goedkeuring of wijziging",
    ],
    "assignment inventory panel",
  );
});

test("phase 6 report approval blocks pending inventory review", () => {
  const wrapper = read("artifacts/backoffice/src/app/actions/report-material-approval.ts");

  assertContains(
    wrapper,
    [
      "assignment_inventory_items",
      "link.approval_status = 'pending'",
      "pendingInventoryCount",
      "inventarisregel",
      "approveReport(reportId)",
    ],
    "report inventory gate",
  );
});

test("phase 6 invoice proposal includes only approved invoiceable inventory", () => {
  const proposals = read("artifacts/backoffice/src/lib/invoice-proposals.ts");

  assertContains(
    proposals,
    [
      "assignmentInventoryItemsTable",
      "inventoryItemsTable",
      "\"inventory\"",
      "eq(assignmentInventoryItemsTable.approvalStatus, \"approved\")",
      "eq(assignmentInventoryItemsTable.invoiceable, true)",
      "inventorySubtotal",
      "Inventaris/verhuur",
      "inventoryGate",
      "approved_invoiceable_only",
    ],
    "invoice proposal inventory gate",
  );
});

test("phase 6 personnel PWA can link inventory without financial fields", () => {
  const action = read("artifacts/personeel-pwa/src/actions/inventory.ts");
  const editor = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/InventoryEditor.tsx");
  const page = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/inventaris/page.tsx");
  const workOrder = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/page.tsx");
  const summary = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/InventorySummaryCard.tsx");

  assertContains(
    action,
    [
      "listInventoryCatalogForAssignment",
      "getInventoryUsageForAssignment",
      "addInventoryUsage",
      "isTenantModuleEnabled(row.tenantId, \"inventory\")",
      "assignment_inventory_items",
      "invoiceable",
      "false",
      "customer_visible",
    ],
    "personnel inventory action",
  );
  assertContains(editor, ["Inventaris toevoegen", "Gebruikstype", "Verhuurd", "Defect geconstateerd"], "personnel inventory editor");
  assert.ok(!editor.includes("Prijs"), "personnel inventory editor should not expose price input");
  assertContains(page, ["InventoryEditor", "listInventoryCatalogForAssignment", "getInventoryUsageForAssignment"], "personnel inventory page");
  assertContains(workOrder, ["InventorySummaryCard", "getInventoryUsageForAssignment"], "work order inventory summary wiring");
  assertContains(summary, ["/inventaris", "Wacht op controle", "Registraties"], "inventory summary card");
});
