import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("phase 14 extends the offline work order queue to inventory usage", () => {
  const queue = read("artifacts/personeel-pwa/src/lib/offline/work-order-queue.ts");
  const provider = read("artifacts/personeel-pwa/src/components/PersonnelRealtimeOfflineProvider.tsx");

  assert.match(queue, /"add-inventory-usage"/u);
  assert.match(queue, /inventoryItemId: string/u);
  assert.match(queue, /removeOfflineWorkOrderActionsByClientMutationId/u);
  assert.match(provider, /import \{ addInventoryUsage \}/u);
  assert.match(provider, /action\.type === "add-inventory-usage"/u);
  assert.match(provider, /Offline acties gesynchroniseerd/u);
  assert.match(provider, /syncedNotice/u);
});

test("phase 14 makes inventory registration offline safe", () => {
  const inventoryEditor = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/InventoryEditor.tsx");

  for (const marker of [
    "enqueueOfflineWorkOrderAction",
    "isOfflineNow",
    'type: "add-inventory-usage"',
    "createClientMutationId",
    "local-inventory-",
    "Inventaris is offline opgeslagen en wordt automatisch gesynchroniseerd.",
  ]) {
    assert.match(inventoryEditor, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }
});

test("phase 14 blocks online-only deletes and cancels local queued rows", () => {
  const materialEditor = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/MaterialEditor.tsx");
  const extraWorkEditor = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/ExtraWorkEditor.tsx");

  assert.match(materialEditor, /removeOfflineWorkOrderActionsByClientMutationId/u);
  assert.match(materialEditor, /Verwijderen is online-only/u);
  assert.match(extraWorkEditor, /removeOfflineWorkOrderActionsByClientMutationId/u);
  assert.match(extraWorkEditor, /local-extra-work-/u);
  assert.match(extraWorkEditor, /Meerwerk is offline opgeslagen en wordt automatisch gesynchroniseerd/u);
  assert.match(extraWorkEditor, /Verwijderen is online-only/u);
});

test("phase 14 makes report attachments explicitly online only", () => {
  const timeline = read("artifacts/personeel-pwa/src/app/(app)/opdrachten/[id]/RapportageTimeline.tsx");

  assert.match(timeline, /Bijlagen en foto's zijn online-only/u);
  assert.match(timeline, /tekstnotities kun je offline opslaan/u);
  assert.match(timeline, /type: "add-report-note"/u);
});

test("phase 14 documents offline coverage decisions", () => {
  const docs = read("docs/fieldgrid-personnel-offline-coverage.md");

  for (const marker of [
    "Werkbon starten",
    "Checklisttaak afvinken",
    "Materiaal toevoegen",
    "Inventaris registreren",
    "Meerwerk toevoegen",
    "Rapportnotitie zonder bijlage",
    "Rapportnotitie met foto's/bijlagen",
    "Werkbon afronden",
    "Werkbon afmelden/niet afgerond",
    "Online-only",
  ]) {
    assert.match(docs, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  }
});
