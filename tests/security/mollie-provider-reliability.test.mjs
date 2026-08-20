import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const provider = readFileSync(
  new URL("../../lib/db/src/mollie-payment-provider.ts", import.meta.url),
  "utf8",
);

test("all Mollie calls share one timeout that covers bounded body consumption", () => {
  assert.equal((provider.match(/await fetch\(/gu) ?? []).length, 1);
  assert.match(provider, /const DEFAULT_MOLLIE_REQUEST_TIMEOUT_MS = 15_000/u);
  assert.match(
    provider,
    /const rawBody = await readBoundedResponseBody\(response\)/u,
  );
  assert.match(provider, /finally \{\s*clearTimeout\(timeout\)/u);
  assert.match(provider, /const MAX_MOLLIE_RESPONSE_BYTES = 1_048_576/u);
  assert.match(
    provider,
    /createMolliePayment[\s\S]*requestMollie\(\{[\s\S]*ambiguousTransportResult: true/u,
  );
  assert.match(
    provider,
    /fetchMolliePayment[\s\S]*requestMollie\(\{[\s\S]*ambiguousTransportResult: false/u,
  );
});

test("Mollie transport exposes explicit retry and failure classifications", () => {
  for (const kind of [
    "timeout",
    "network",
    "client_error",
    "server_error",
    "malformed_response",
    "envelope_mismatch",
  ]) {
    assert.ok(provider.includes(`"${kind}"`));
  }
  assert.match(provider, /readonly retryable: boolean/u);
  assert.match(provider, /response\.status === 429/u);
  assert.match(provider, /response\.status >= 500/u);
  assert.match(
    provider,
    /class AmbiguousProviderResultError extends MollieProviderError/u,
  );
});

test("payment ID and financial envelope checks remain fail closed", () => {
  assert.match(provider, /snapshot\.id !== paymentId/u);
  assert.match(provider, /Provider amount mismatch/u);
  assert.match(provider, /Provider currency mismatch/u);
  assert.match(provider, /Provider metadata mismatch/u);
  assert.match(provider, /Provider mode mismatch/u);
  assert.match(provider, /Provider profile mismatch/u);
});
