# Payment and webhook integrity

Fieldgrid uses a classic Mollie payment callback as a wake-up signal. The form
body is authenticated by the trusted Fieldgrid ingress with a repository-specific
HMAC. The API then fetches the full payment through the authenticated Mollie API.
This endpoint does not implement Mollie Next-gen JSON event signing.

`payments` is the durable source of truth. A provider request is never made until
the intent, its immutable amount/currency/metadata, stable idempotency key, request
hash, and (for collections) batch and item snapshots have committed. The network
call is made without a database transaction or row lock being held.

The only interval in which a provider object can exist without its provider ID
being stored locally is between Mollie's successful create and Fieldgrid's bind
transaction. It is still searchable by the already-persisted intent ID and
idempotency key. A callback that wins that race binds through the immutable
`paymentIntentId`; a create-response persistence failure leaves the intent in
`reconciliation_required` and a retry reuses the same key.

```mermaid
sequenceDiagram
    participant U as Customer or backoffice
    participant A as Server action
    participant D as PostgreSQL
    participant M as Mollie
    participant W as Webhook API

    U->>A: Create direct or collection payment
    alt Direct invoice creation
        A->>D: Lock invoice and calculate ledger outstanding
        A->>D: Commit direct intent, key, hash and metadata
    else Collection creation
        A->>D: Lock invoice set in stable order and sum outstanding
        A->>D: Commit batch, items, intent, key, hash and metadata
    end
    A->>D: Commit provider_pending
    A->>M: POST /payments with stable Idempotency-Key
    alt response received
        M-->>A: Full payment envelope
        A->>D: Verify and bind ID, amount, currency, metadata, mode and profile
        A-->>U: Checkout URL
    else timeout or HTTP 409
        A->>D: Mark reconciliation_required; retain same intent and key
        A-->>U: Retry the same durable request
    end
    M-->>W: Classic callback id hint
    W->>W: Require ingress HMAC
    W->>M: GET authoritative payment
    M-->>W: Full payment envelope
    W->>D: Verify immutable intent and apply monotonic transition
    alt Direct invoice settlement
        D->>D: Lock payment and invoice; allocate and derive projections
    else Collection settlement
        D->>D: Lock payment, batch and invoices in deterministic order
        D->>D: Allocate every item or roll back the entire settlement
    end
    W-->>M: 200 after settlement or durable quarantine
```

## Financial authority

Outstanding cents are calculated in PostgreSQL as invoice total plus issued/paid
credit notes minus the sum of payment allocations. The stored `paid_amount` and
`outstanding_amount` fields are projections, not the ledger authority. A manual
payment and a live Mollie intent are mutually exclusive under the invoice lock.

Collections include each invoice's exact locked outstanding cents. Discounts and
surcharges are rejected until represented by an issued financial document; this
prevents a provider capture that cannot equal the allocation ledger.

The provider's idempotency cache is not the durable authority. Fieldgrid's unique
request key, request hash, and active source indexes remain effective after a
provider cache expires. Rotating Mollie credentials does not rotate existing
intent keys. Operations must retain access to the original provider organization
long enough to reconcile in-flight intents; otherwise those intents require
explicit accounting review rather than recreation.

## Provider and status authority

Every create response and callback fetch must match the bound provider ID,
integer-cent amount, currency, metadata schema/purpose/payment intent/tenant/
customer/source, provider mode, and profile. Contradictions are quarantined as
`reconciliation_required` before any allocation or invoice mutation.

Supported live transitions are `created -> provider_pending -> open -> pending ->
authorized -> paid`. A transition may skip forward. `paid`, `canceled`, `expired`,
and `failed` are terminal; delayed or duplicate callbacks cannot regress them.
Duplicate paid callbacks produce no second allocation or settlement audit.

Refund and chargeback observations never silently rewrite the original payment.
They retain the paid ledger and create a reconciliation requirement for an
explicit accounting reversal. Automated refund/reversal allocation is outside
this lifecycle and must not be represented as a negative payment.

## Webhook ingress and rotation

`MOLLIE_WEBHOOK_SECRET` is a Fieldgrid trusted-ingress HMAC secret, not a Mollie
Next-gen signing secret. Startup fails when it is missing. The ingress and API
must be rotated together: deploy the new value to both sides within one controlled
maintenance window, validate a signed callback, and then retire the old value.
There is intentionally no unsigned or optional fallback. A future dual-key
rotation window must be implemented explicitly and tested before use.

## Recovery boundaries

An ambiguous timeout or provider conflict retains the durable intent and original
idempotency key. Retrying converges on that record. A callback that arrives before
the create response is bound uses the immutable provider `paymentIntentId`
metadata and the same full-envelope verification to bind safely. A paid provider
payment whose locked local balances no longer match is acknowledged only after a
durable reconciliation reason is stored; it is never falsely allocated.

## Why the previous green gate missed this

PR #329's 31 green checks covered broad RLS, migration, API, typecheck, build, and
browser health, but did not execute customer payment creation against a fake
provider or apply fetched Mollie envelopes through the real Express route and a
PostgreSQL ledger. Provider-first persistence, per-attempt keys, gross-total
checkout, optional webhook authentication, partial envelope checks, and status
regression could therefore coexist with a green gate.

The authoritative API runtime now exercises the real adapter, route, and database
for signature failures, provider-fetch failures, stable idempotency and 409,
amount/currency/metadata/mode/profile/tenant/customer mismatches, concurrent and
duplicate callbacks, monotonic status, direct settlement, collection rollback,
and exact-once audit/allocation behavior. Playwright additionally creates direct
and collection intents through the customer UI and verifies exact checkout cents
and one logical provider payment. Removing any of the six fixes breaks an
authoritative exact-head lane.
