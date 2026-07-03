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

test("phase 9 document entity types cover material and inventory contexts", () => {
  const schema = read("lib/db/src/schema/documents.ts");
  const types = read("artifacts/backoffice/src/types/documents.ts");
  const documentsView = read("artifacts/backoffice/src/components/documents/DocumentsView.tsx");

  assertContains(
    schema,
    ["material", "inventory_item", "inventory_issue", "inventory_maintenance"],
    "document schema entity types",
  );
  assertContains(
    types,
    ["material", "inventory_item", "inventory_issue", "inventory_maintenance", "DOCUMENT_ENTITY_TYPES"],
    "backoffice document types",
  );
  assertContains(
    documentsView,
    ["Materialen", "Inventaris", "Storingen", "Onderhoud", "/materials", "/inventory/issues"],
    "backoffice document overview",
  );
});

test("phase 9 document action keeps storage, signed URLs and audits tenant-scoped", () => {
  const action = read("artifacts/backoffice/src/app/actions/documents.ts");

  assertContains(
    action,
    [
      "materialsTable",
      "inventoryItemsTable",
      "inventoryIssuesTable",
      "inventoryMaintenanceEventsTable",
      "getSafeDocumentStoragePath",
      "getTenantBoundStoragePath",
      "createSignedUrl(storagePath, 3600)",
      "document_uploaded",
      "document_deleted",
      "document_signed_url_issued",
      "tenantId,",
      "Geen toegang tot deze documentcontext",
      "Ongeldig opslagpad",
    ],
    "document action",
  );
});

test("phase 9 detail pages expose scoped uploads for material, inventory and issue media", () => {
  const panel = read("artifacts/backoffice/src/components/documents/DocumentAttachmentPanel.tsx");
  const materialPage = read("artifacts/backoffice/src/app/(dashboard)/materials/[id]/page.tsx");
  const inventoryPage = read("artifacts/backoffice/src/app/(dashboard)/inventory/[id]/page.tsx");
  const issuePage = read("artifacts/backoffice/src/app/(dashboard)/inventory/issues/[id]/page.tsx");

  assertContains(
    panel,
    [
      "DocumentAttachmentPanel",
      "uploadDocument",
      "getDocumentDownloadUrl",
      "deleteDocument",
      "entityType",
      "entityId",
      "Bestanden worden tenant-gebonden opgeslagen",
    ],
    "document attachment panel",
  );
  assertContains(
    materialPage,
    ["DocumentAttachmentPanel", "entityType=\"material\"", "Materiaalafbeeldingen en documenten", "listDocuments"],
    "material detail documents",
  );
  assertContains(
    inventoryPage,
    ["DocumentAttachmentPanel", "entityType=\"inventory_item\"", "Inventarisfoto's en documenten", "listDocuments"],
    "inventory detail documents",
  );
  assertContains(
    issuePage,
    ["DocumentAttachmentPanel", "entityType=\"inventory_issue\"", "Storingmedia en bewijs", "listDocuments"],
    "inventory issue documents",
  );
});

test("phase 9 notification settings include material and inventory followup events", () => {
  const migration = read("lib/db/migrations/064_material_inventory_document_notifications.sql");

  assertContains(
    migration,
    [
      "inventory.issue.reported",
      "inventory.document.uploaded",
      "inventory.maintenance.due",
      "material.stock.low",
      "ON CONFLICT (event_key) DO UPDATE",
    ],
    "material inventory notification settings migration",
  );
});
