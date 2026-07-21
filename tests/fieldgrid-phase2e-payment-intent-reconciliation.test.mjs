import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migrationPath =
  "lib/db/migrations/20260719125900_duplicate_payment_intent_reconciliation.sql";
const integrityMigrationPath =
  "lib/db/migrations/20260719130000_payment_webhook_integrity.sql";
const migration = readFileSync(migrationPath, "utf8");

test("duplicate payment reconciliation runs before the active-source unique index", () => {
  assert.ok(migrationPath < integrityMigrationPath);
  assert.match(
    migration,
    /lock table public\.payments in share row exclusive mode/iu,
  );
  assert.match(migration, /provider_or_financially_bound/iu);
  assert.match(migration, /source_intent_count > 1/iu);
});

test("only provably local or staging-demo intents may be superseded", () => {
  assert.match(
    migration,
    /payment\.status = 'created'[\s\S]*payment\.mollie_payment_id is null[\s\S]*payment\.checkout_url is null/iu,
  );
  assert.match(migration, /mollie_payment_id like 'tr_staging_demo_%'/iu);
  assert.match(
    migration,
    /where duplicate\.source_rank > 1[\s\S]*not duplicate\.provider_or_financially_bound/iu,
  );
  assert.match(migration, /set[\s\S]*status = 'failed'/iu);
  assert.doesNotMatch(migration, /delete from public\.payments/iu);
});

test("ambiguous provider-bound duplicates fail closed and every safe change is audited", () => {
  assert.match(
    migration,
    /having count\(\*\) filter \(where duplicate\.provider_or_financially_bound\) > 1/iu,
  );
  assert.match(migration, /require manual reconciliation/iu);
  assert.match(migration, /using errcode = '23505'/iu);
  assert.match(migration, /migration_duplicate_payment_intent_superseded/iu);
  assert.match(migration, /keptPaymentIntentId/iu);
  assert.match(migration, /Active Mollie source duplicates remain/iu);
});
