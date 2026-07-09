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

test("phase 5 exposes tenant-scoped inventory management actions", () => {
  const action = read("artifacts/backoffice/src/app/actions/inventory.ts");

  assertContains(
    action,
    [
      "listInventory",
      "getInventoryDetail",
      "createInventoryItem",
      "updateInventoryItem",
      "archiveInventoryItem",
      "requirePermission(\"inventory\", \"view\")",
      "hasPermission(\"inventory\", \"manage\")",
      "tenant_sequences",
      "inventory_code",
      "I${String(row.value).padStart(6, \"0\")}",
      "inventory_movements",
      "inventory_item_created",
      "inventory_item_updated",
      "inventory_item_archived",
    ],
    "inventory actions",
  );
});

test("phase 5 inventory routes and UI are wired", () => {
  const page = read("artifacts/backoffice/src/app/(dashboard)/inventory/page.tsx");
  const detailPage = read("artifacts/backoffice/src/app/(dashboard)/inventory/[id]/page.tsx");
  const view = read("artifacts/backoffice/src/components/inventory/InventoryView.tsx");
  const detail = read("artifacts/backoffice/src/components/inventory/InventoryDetailView.tsx");

  assertContains(page, ["InventoryView", "listInventory", "inventory", "view"], "inventory page");
  assertContains(detailPage, ["InventoryDetailView", "getInventoryDetail", "listInventoryManagementOptions"], "inventory detail page");
  assertContains(
    view,
    ["Inventarisregister", "Nieuw inventarisitem", "I000001", "Archiveer", "Zoek op naam, code of serienummer"],
    "inventory overview",
  );
  assertContains(
    detail,
    ["Locatiegeschiedenis", "updateInventoryItem", "archiveInventoryItem", "Reden locatie/status"],
    "inventory detail",
  );
});

test("phase 5 object and personnel dossiers show inventory", () => {
  const objectTabs = read("artifacts/backoffice/src/components/objects/object-tabs.ts");
  const objectPage = read("artifacts/backoffice/src/app/(dashboard)/objects/[id]/page.tsx");
  const personnelPage = read("artifacts/backoffice/src/app/(dashboard)/personnel/[id]/page.tsx");
  const panel = read("artifacts/backoffice/src/components/inventory/InventoryItemsPanel.tsx");

  assertContains(objectTabs, ["inventaris", "Inventaris"], "object tabs");
  assertContains(objectPage, ["listInventoryForObject", "InventoryItemsPanel", "canReadInventory"], "object inventory tab");
  assertContains(personnelPage, ["listInventoryForPersonnel", "InventoryItemsPanel", "canReadInventory"], "personnel inventory panel");
  assertContains(panel, ["/inventory", "Inventaris", "currentLocationName", "nextInspectionDate"], "inventory dossier panel");
});

test("phase 5 navigation exposes inventory through RBAC", () => {
  const sidebar = read("artifacts/backoffice/src/components/layout/Sidebar.tsx");
  assertContains(sidebar, ["/inventory", "Inventaris", "inventory:view", "PackageSearch"], "sidebar inventory nav");
});
