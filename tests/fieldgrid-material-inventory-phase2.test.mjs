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

test("phase 2 exposes backoffice material catalog routes", () => {
  const page = read("artifacts/backoffice/src/app/(dashboard)/materials/page.tsx");
  const detail = read("artifacts/backoffice/src/app/(dashboard)/materials/[id]/page.tsx");
  const view = read("artifacts/backoffice/src/components/materials/MaterialsView.tsx");

  assertContains(page, ["Materiaalbeheer", "listMaterials", "listMaterialManagementOptions"], "materials page");
  assertContains(detail, ["getMaterialDetail", "MaterialDetailView"], "material detail page");
  assertContains(view, ["createMaterial", "recordMaterialStockMovement", "archiveMaterial"], "materials view");
});

test("phase 2 actions generate tenant material codes and write stock movements", () => {
  const actions = read("artifacts/backoffice/src/app/actions/materials.ts");

  assertContains(
    actions,
    [
      "nextMaterialCode",
      "M${String(row.value).padStart(5, \"0\")}",
      "tenant_sequences",
      "material_stock_movements",
      "material_stock_balances",
      "movementType: \"received\" | \"corrected\" | \"transferred\"",
      "action: `material_stock_${input.movementType}`",
    ],
    "material actions",
  );
});

test("phase 2 stock locations support object and personnel dossiers", () => {
  const actions = read("artifacts/backoffice/src/app/actions/materials.ts");
  const objectPage = read("artifacts/backoffice/src/app/(dashboard)/objects/[id]/page.tsx");
  const objectTabs = read("artifacts/backoffice/src/components/objects/ObjectDetailTabs.tsx");
  const personnelMaterialsPage = read("artifacts/backoffice/src/app/(dashboard)/personnel/[id]/materials/page.tsx");

  assertContains(
    actions,
    [
      "ensureObjectStockLocation",
      "ensurePersonnelStockLocation",
      "listMaterialStockForObject",
      "listMaterialStockForPersonnel",
    ],
    "material stock location actions",
  );
  assertContains(objectTabs, ["materiaal", "Materiaal"], "object material tab");
  assertContains(objectPage, ["listMaterialStockForObject", "MaterialStockPanel"], "object detail material panel");
  assertContains(
    personnelMaterialsPage,
    ["listMaterialStockForPersonnel", "MaterialStockPanel", "Materiaal / Voorraad"],
    "personnel material stock page",
  );
});

test("phase 2 enforces module permissions and tenant-aware audit logging", () => {
  const actions = read("artifacts/backoffice/src/app/actions/materials.ts");

  assertContains(
    actions,
    [
      "requirePermission(\"materials\", \"view\")",
      "requireMaterialsWrite",
      "writeTenantAuditLog",
      "tenant_id, user_id, action, resource, resource_id, metadata",
    ],
    "material permission and audit actions",
  );
});
