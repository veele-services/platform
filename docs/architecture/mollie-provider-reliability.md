# Mollie provider reliability boundary

All Mollie payment creation and lookup calls use the shared transport in
`lib/db/src/mollie-payment-provider.ts`. The default 15-second deadline covers
the complete exchange, including response-body consumption. Responses are also
limited to 1 MiB. A request cannot become unbounded after the provider has sent
its headers.

The transport reports a stable failure kind and `retryable` flag:

- timeouts and network failures are transient;
- HTTP 408, 425, 429, and 5xx responses are transient;
- other 4xx responses, malformed JSON, oversized bodies, and envelope
  mismatches are not transient.

Transport failures during an idempotent create remain
`AmbiguousProviderResultError` instances because Mollie may have accepted the
request before the connection failed. Callers must reconcile or retry with the
same durable idempotency key. A provider 409 has the same ambiguous treatment.
Fetch failures are not ambiguous, but still expose the retry classification.

Successful JSON is never sufficient by itself. The adapter validates the
payment ID, canonical amount, currency, metadata, mode, profile, and checkout
envelope. The payment-integrity layer then compares those values with the
durable tenant-bound intent before it binds or settles a payment.

`MOLLIE_REQUEST_TIMEOUT_MS` exists for deterministic tests and constrained
deployments. Values outside 1–60,000 milliseconds fail closed; production uses
15,000 milliseconds when the variable is absent.
