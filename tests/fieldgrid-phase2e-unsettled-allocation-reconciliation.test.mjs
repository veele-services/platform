import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migrationPath =
  "lib/db/migrations/20260719125800_unsettled_payment_allocation_reconciliation.sql";
const duplicateMigrationPath =
  "lib/db/migrations/20260719125900_duplicate_payment_intent_reconciliation.sql";
const integrityMigrationPath =
  "lib/db/migrations/20260719130000_payment_webhook_integrity.sql";
const migration = readFileSync(migrationPath, "utf8");

test("unsettled allocation repair runs before duplicate and webhook integrity migrations", () => {
  assert.ok(migrationPath < duplicateMigrationPath);
  assert.ok(duplicateMigrationPath < integrityMigrationPath);
  assert.match(
    migration,
    /lock table public\.payment_allocations in share row exclusive mode/iu,
  );
});

test("only exact synthetic allocations on provably unsettled payments are removed and audited", () => {
  assert.match(
    migration,
    /allocation\.note = 'Backfill bestaande factuurbetaling'/iu,
  );
  assert.match(migration, /payment\.status <> 'paid'/iu);
  assert.match(migration, /payment\.paid_at is null/iu);
  assert.match(migration, /migration_unsettled_synthetic_allocation_removed/iu);
  assert.match(migration, /delete from public\.payment_allocations/iu);
  assert.doesNotMatch(migration, /delete from public\.payments/iu);
});

test("only staging-demo metadata is superseded while a real provider intent is retained", () => {
  assert.match(migration, /demo\.mollie_payment_id like 'tr_staging_demo_%'/iu);
  assert.match(
    migration,
    /demo\.checkout_url like 'https:\/\/www\.mollie\.com\/checkout\/staging-demo\/%'/iu,
  );
  assert.match(migration, /candidate\.id <> demo\.id/iu);
  assert.match(migration, /keptPaymentIntentId/iu);
  assert.match(migration, /status = 'failed'/iu);
  assert.match(
    migration,
    /Multiple real provider\/financial intents require manual reconciliation/iu,
  );
});
