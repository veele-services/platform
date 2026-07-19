import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const integrity = read("lib/db/src/payment-integrity.ts");
const provider = read("lib/db/src/mollie-payment-provider.ts");
const webhook = read("artifacts/api-server/src/routes/webhooks.ts");
const startup = read("artifacts/api-server/src/index.ts");
const customer = read("artifacts/klant-pwa/src/actions/payments.ts");
const backofficePayments = read(
  "artifacts/backoffice/src/app/actions/payments.ts",
);
const backofficeInvoices = read(
  "artifacts/backoffice/src/app/actions/invoices.ts",
);
const migration = read(
  "lib/db/migrations/20260719130000_payment_webhook_integrity.sql",
);

test("all provider creation paths commit a durable intent before the shared adapter call", () => {
  for (const action of [customer, backofficePayments, backofficeInvoices]) {
    assert.doesNotMatch(action, /fetch\(["']https:\/\/api\.mollie\.com/u);
  }
  assert.match(customer, /prepareDirectPaymentIntent/u);
  assert.match(customer, /prepareCollectionPaymentIntent/u);
  assert.match(backofficePayments, /prepareDirectPaymentIntent/u);
  assert.match(backofficeInvoices, /prepareCollectionPaymentIntent/u);
  assert.match(provider, /"Idempotency-Key": input\.requestKey/u);
  assert.match(integrity, /status, registered_by_user_id[\s\S]*'created'/u);
  assert.match(integrity, /pg_advisory_xact_lock/u);
  assert.match(integrity, /ORDER BY id FOR UPDATE/u);
});

test("provider envelope and webhook ingress fail closed before financial settlement", () => {
  assert.match(startup, /if \(!process\.env\["MOLLIE_WEBHOOK_SECRET"\]\)/u);
  assert.match(webhook, /verifyMollieSignature/u);
  assert.match(webhook, /fetchMolliePayment/u);
  assert.match(webhook, /applyProviderPaymentSnapshot/u);
  assert.match(provider, /Provider amount mismatch/u);
  assert.match(provider, /Provider currency mismatch/u);
  assert.match(provider, /Provider metadata mismatch/u);
  assert.match(provider, /Provider mode mismatch/u);
  assert.match(provider, /Provider profile mismatch/u);
});

test("settlement derives exact balances and quarantines contradictions", () => {
  assert.match(integrity, /sum\(allocation\.amount_cents\)/u);
  assert.match(integrity, /credit\.type = 'credit_note'/u);
  assert.match(integrity, /outstanding !== intent\.amountCents/u);
  assert.match(integrity, /Collection items no longer exactly reconcile/u);
  assert.match(integrity, /reversalObserved/u);
  assert.match(integrity, /ON CONFLICT \(payment_id, invoice_id\) DO NOTHING/u);
});

test("database migration enforces provider intent shape, active uniqueness and monotonic status", () => {
  assert.match(migration, /payments_provider_intent_shape_check/u);
  assert.match(migration, /payments_active_request_hash_unique_idx/u);
  assert.match(migration, /'provider_pending'.*'pending'.*'authorized'/su);
  assert.match(migration, /fieldgrid_guard_payment_status_transition/u);
  assert.match(migration, /A settled payment is terminal and cannot regress/u);
  assert.match(migration, /REVOKE UPDATE \(/u);
  assert.match(migration, /FROM PUBLIC, anon, authenticated/u);
});
