import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
  "utf8",
);
const clients = ["backoffice", "klant-pwa", "personeel-pwa"].map((surface) =>
  readFileSync(
    `artifacts/${surface}/src/lib/realtime/portal-realtime-client.ts`,
    "utf8",
  ),
);

test("realtime events carry transaction correlation and a monotone projection version", () => {
  assert.match(migration, /portal_realtime_projection_version_seq/u);
  assert.match(migration, /fieldgrid\.realtime_correlation_id/u);
  assert.match(migration, /projection_version/u);
});

test("every portal client drops duplicate and reordered projection events", () => {
  for (const client of clients) {
    assert.match(client, /projectionWatermark/u);
    assert.match(client, /version <= projectionWatermark/u);
    assert.match(client, /Number\.isSafeInteger/u);
  }
});

test("generic staffing and child fanout never reaches customer subscriptions", () => {
  assert.match(
    migration,
    /COALESCE\(p_topic, 'assignments'\) = 'assignments'/u,
  );
  assert.match(
    migration,
    /COALESCE\(p_entity_type, 'assignment'\) IN \('assignment', 'assignments'\)/u,
  );
  const customerBlock =
    migration.match(
      /IF COALESCE\(p_topic[\s\S]*?PERFORM public\.portal_realtime_emit_customer\([\s\S]*?\n  END IF;/u,
    )?.[0] ?? "";
  assert.ok(customerBlock);
  assert.doesNotMatch(customerBlock, /p_payload/u);
});
