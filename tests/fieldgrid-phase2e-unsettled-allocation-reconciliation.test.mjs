import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migrationPath =
  "lib/db/migrations/20260719125800_unsettled_payment_allocation_reconciliation.sql";
const preindexMigrationPath =
  "lib/db/migrations/20260718185000_preindex_payment_reconciliation.sql";
const securityMigrationPath =
  "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql";
const duplicateMigrationPath =
  "lib/db/migrations/20260719125900_duplicate_payment_intent_reconciliation.sql";
const integrityMigrationPath =
  "lib/db/migrations/20260719130000_payment_webhook_integrity.sql";
const migration = readFileSync(migrationPath, "utf8");
const preindexMigration = readFileSync(preindexMigrationPath, "utf8");
const securityMigration = readFileSync(securityMigrationPath, "utf8");

test("safe payment reconciliation runs before the security unique index", () => {
  assert.ok(preindexMigrationPath < securityMigrationPath);
  assert.ok(securityMigrationPath < migrationPath);
  assert.match(
    securityMigration,
    /create unique index if not exists payments_active_mollie_source_unique_idx/iu,
  );
  assert.match(preindexMigration, /before the active-source index/iu);
});

test("pre-index repair removes only audited synthetic unsettled allocations", () => {
  assert.match(
    preindexMigration,
    /allocation\.note = 'Backfill bestaande factuurbetaling'/iu,
  );
  assert.match(preindexMigration, /payment\.status <> 'paid'/iu);
  assert.match(preindexMigration, /payment\.paid_at is null/iu);
  assert.match(
    preindexMigration,
    /migration_unsettled_synthetic_allocation_removed/iu,
  );
  assert.match(preindexMigration, /delete from public\.payment_allocations/iu);
  assert.doesNotMatch(preindexMigration, /delete from public\.payments/iu);
});

test("pre-index duplicate repair preserves bound intents and fails closed on ambiguity", () => {
  assert.match(preindexMigration, /provider_or_financially_bound/iu);
  assert.match(preindexMigration, /staging_demo_metadata/iu);
  assert.match(preindexMigration, /keptPaymentIntentId/iu);
  assert.match(preindexMigration, /status = 'failed'/iu);
  assert.match(
    preindexMigration,
    /Multiple provider\/financially bound active Mollie intents require manual reconciliation/iu,
  );
  assert.match(
    preindexMigration,
    /Active Mollie source duplicates remain before the active-source index/iu,
  );
});

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
