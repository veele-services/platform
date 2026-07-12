import assert from "node:assert/strict";
import { test } from "node:test";

import {
  VERSION,
  buildEntrypointInventory,
  compareDocuments,
  renderInventoryJson,
  renderRiskReport,
} from "../scripts/fieldgrid-entrypoint-inventory.mjs";

test("entrypoint inventory discovers representative runtime surfaces", async () => {
  const inventory = await buildEntrypointInventory();
  const ids = new Set(inventory.entries.map((entry) => entry.id));

  assert.equal(inventory.version, VERSION);
  assert.ok(inventory.entries.length > 100);
  assert.ok(ids.has("express-route:api-server:routes/webhooks#POST /webhooks/mollie"));
  assert.ok(ids.has("server-action:backoffice:app/actions/documents#getDocumentDownloadUrl"));
  assert.ok(ids.has("next-route:customer-pwa:app/api/factuur/:id/pdf#GET /api/factuur/:id/pdf"));

  for (const entry of inventory.entries) {
    assert.ok(entry.id);
    assert.ok(entry.sourceFile);
    assert.ok(entry.exportOrRoute);
    assert.ok(Number.isInteger(entry.line));
    assert.ok(entry.securityContract.actorType);
    assert.ok(entry.securityContract.authenticationMethod);
    assert.ok(entry.securityContract.tenantSource);
    assert.ok(entry.securityContract.riskClassification);
    assert.notEqual(entry.classificationStatus, "safe");
  }
});

test("check comparison detects stale generated docs", async () => {
  const inventory = await buildEntrypointInventory();
  const expected = renderInventoryJson(inventory);
  const stale = renderInventoryJson({ ...inventory, entries: inventory.entries.slice(1) });

  assert.deepEqual(compareDocuments(expected, expected, "inventory json"), []);
  assert.match(compareDocuments(stale, expected, "inventory json").join("\n"), /inventory json is stale/u);
});

test("risk report states static inventory is not runtime proof", async () => {
  const inventory = await buildEntrypointInventory();
  const report = renderRiskReport(inventory);

  assert.match(report, /does not prove runtime safety/u);
  assert.match(report, /High-Risk Review Queue/u);
  assert.match(report, /webhooks\/mollie/u);
  assert.match(report, /--check/u);
});
