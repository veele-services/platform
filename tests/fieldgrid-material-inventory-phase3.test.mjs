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

test("phase 3 material usage migration is idempotent for offline retries", () => {
  const migration = read("lib/db/migrations/068_assignment_material_usage_client_mutation.sql");
  const schema = read("lib/db/src/schema/assignments.ts");

  assertContains(
    migration,
    [
      "ADD COLUMN IF NOT EXISTS client_mutation_id",
      "assignment_material_usage_client_mutation_idx",
      "tenant_id, assignment_id, created_by, client_mutation_id",
    ],
    "phase 3 migration",
  );
  assertContains(schema, ["clientMutationId", "client_mutation_id"], "assignment material usage schema");
});

test("phase 3 personnel material action uses tenant catalog and stock movement", () => {
  const action = read("artifacts/personeel-pwa/src/actions/materials.ts");

  assertContains(
    action,
    [
      "listMaterialCatalogForAssignment",
      "isTenantModuleEnabled(row.tenantId, \"materials\")",
      "material_stock_balances",
      "material_stock_movements",
      "used_on_assignment",
      "clientMutationId",
      "findExistingMutation",
      "unit_price",
      "0,",
    ],
    "personnel material action",
  );
});

test("phase 3 material editor supports catalog, other and stock usage without personnel prices", () => {
  const editor = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/MaterialEditor.tsx");

  assertContains(
    editor,
    [
      "catalog: MaterialCatalogOption[]",
      "Catalogus",
      "Overig",
      "Uit voorraad gebruiken",
      "stockLocationId",
      "clientMutationId",
      "unitPrice: 0",
    ],
    "material editor",
  );
  assert.ok(!editor.includes("Prijs"), "personnel material editor should not expose price input");
});

test("phase 3 work order material summary shows usage, not financial totals", () => {
  const sections = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/WorkOrderSections.tsx");

  assertContains(
    sections,
    [
      "MaterialSummaryCard",
      "MaterialSubline",
      "MaterialBadges",
      "Uit voorraad",
      "Overig",
      "Registraties",
    ],
    "material summary",
  );
  assert.ok(!sections.includes("Totaal materiaal"), "personnel material summary should not show financial material totals");
  assert.ok(!sections.includes("calculateMaterialLineTotal"), "personnel material summary should not calculate material money totals");
});

test("phase 3 material page and offline queue pass catalog-safe payloads", () => {
  const page = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/materiaal/page.tsx");
  const queue = read("artifacts/personeel-pwa/src/lib/offline/work-order-queue.ts");
  const provider = read("artifacts/personeel-pwa/src/components/PersonnelRealtimeOfflineProvider.tsx");

  assertContains(page, ["listMaterialCatalogForAssignment", "catalog={catalog}"], "material page");
  assertContains(
    queue,
    [
      "materialId?: string | null",
      "materialCode?: string | null",
      "usesStock?: boolean",
      "stockLocationId?: string | null",
      "isOther?: boolean",
      "clientMutationId?: string | null",
    ],
    "offline material queue",
  );
  assertContains(
    provider,
    [
      "addMaterialUsage(action.assignmentId, {",
      "...action.payload",
      "expectedParticipantVersion: action.expectedParticipantVersion ?? null",
      "clientMutationId: action.idempotencyKey",
    ],
    "offline material sync provider",
  );
});
