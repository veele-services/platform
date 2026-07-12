# Payment Runtime Test Matrix

Status: reproduction matrix. Current tests are source-backed executable evidence and provider-free. Real DB tests are still required for concurrency and partial-failure proof.

## Executable Tests

Run:

```bash
node --test tests/security/payment-integrity-reproduction.test.mjs
node --test tests/security/worker-lifecycle-reproduction.test.mjs
```

These tests are intentionally not included in the normal root `npm test` glob.

## Scenario Matrix

| Scenario | Current artifact | Assertion type | Current result |
| --- | --- | --- | --- |
| Two concurrent payment clicks | `payment-integrity-reproduction.test.mjs` | Preflight read before provider call; no transaction or active-payment unique key. | Current-failing exploit evidence, needs DB race test. |
| Provider success followed by local DB failure | `payment-integrity-reproduction.test.mjs` | Provider call occurs before local insert; local insert failure returns app error. | Reproduced source evidence. |
| Local intent followed by provider timeout | Threat model doc | No durable pre-provider intent exists. | Modeled gap. |
| Duplicate webhook | `payment-integrity-reproduction.test.mjs` | No transaction/unique allocation guard around paid side effects. | Reproduced source evidence, needs DB race test. |
| Out-of-order webhook | `payment-integrity-reproduction.test.mjs` | Status update is direct provider status mapping. | Reproduced source evidence. |
| Webhook wrong amount/currency/metadata | `payment-integrity-reproduction.test.mjs` | Webhook type only reads `id`, `status`, `paidAt`. | Reproduced source evidence. |
| Missing webhook secret | `payment-integrity-reproduction.test.mjs` | Missing secret accepts with warning. | Reproduced source evidence. |
| Retryable internal error returning 200 | `payment-integrity-reproduction.test.mjs` | Missing API key, provider fetch failure and catch-all return 200. | Reproduced source evidence. |
| Partial payment then customer payment | `payment-integrity-reproduction.test.mjs` | Manual partial leaves invoice `sent`; customer flow charges `totalAmount`. | Reproduced source evidence. |
| Overpayment | `payment-integrity-reproduction.test.mjs` | Invoice paid total is clamped while payment/allocation amount remains requested amount. | Reproduced source evidence. |
| Duplicate allocation | `payment-integrity-reproduction.test.mjs` | No unique allocation key, allocation insert after status check. | Reproduced source evidence, needs DB race test. |
| Collection payment with nullable invoice id | `payment-integrity-reproduction.test.mjs` | Batch payments insert `invoiceId: null`; old tenant trigger requires `NEW.invoice_id`. | Reproduced source evidence, needs DB migration-state proof. |
| Backoffice mark paid bypass | `payment-integrity-reproduction.test.mjs` | `markInvoicePaid` updates invoice/assignment without payment/allocation ledger state. | Reproduced source evidence. |
| Suspended tenant queued delivery | `worker-lifecycle-reproduction.test.mjs` | Worker claim lacks tenant lifecycle filter. | Reproduced source evidence, needs DB lifecycle fixtures. |
| Module disabled after queue creation | `worker-lifecycle-reproduction.test.mjs` | Notification worker lacks module guard; reminders have one. | Reproduced partial gap. |
| Endpoint succeeds once then worker retries | `worker-lifecycle-reproduction.test.mjs` | Route returns `ok: true` worker result containing retry counts. | Reproduced source evidence. |

## Real DB Tests Still Required

| Required test | Why source tests are not enough |
| --- | --- |
| Concurrent paid webhooks | Need two transactions observing invoice `sent` before either commits. |
| Concurrent customer clicks | Need unique provider ids and local rows under simultaneous requests. |
| Audit trigger tenant inference | Several webhook audit rows rely on DB trigger behavior. |
| Provider success then DB failure | Needs injected DB failure after mocked provider success. |
| Collection trigger drift | Needs migrated test database to prove the trigger rejects `invoice_id = null`. |
| Worker attempt-log failure | Needs injected failure between queue completion and attempt insert. |
| Tenant suspended after queue creation | Needs tenant lifecycle fixtures and delivery adapters. |

## Release Gate Position

These tests document currently vulnerable or incomplete behavior. Keep them out of the normal green release gate until the corresponding cases are converted into expected-denial tests or real remediation tests.
