#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import http from "node:http";
import {
  AmbiguousProviderResultError,
  assertProviderEnvelope,
  createMolliePayment,
  fetchMolliePayment,
  MollieProviderError,
  type FieldgridPaymentMetadata,
} from "../lib/db/src/mollie-payment-provider";

const port = Number(process.env.FIELDGRID_PAYMENT_PROVIDER_TEST_PORT ?? "4198");
const origin = `http://127.0.0.1:${port}`;
const attempts: Array<{ key: string; body: Record<string, unknown> }> = [];
const accepted = new Map<
  string,
  { hash: string; payment: Record<string, unknown> }
>();

const metadata: FieldgridPaymentMetadata = {
  schemaVersion: "fieldgrid-payment-v1",
  purpose: "invoice_payment",
  paymentIntentId: "94000000-0000-4000-8000-000000000101",
  tenantId: "10000000-0000-4000-8000-000000000001",
  customerId: "40000000-0000-4000-8000-000000000001",
  sourceType: "invoice",
  sourceId: "94000000-0000-4000-8000-000000000102",
};

function providerPayment(id: string, body: Record<string, unknown>) {
  return {
    id,
    status: "open",
    amount: body.amount,
    metadata: body.metadata,
    mode: "test",
    profileId: "pfl_runtime_provider",
    createdAt: "2026-07-19T12:00:00.000Z",
    _links: { checkout: { href: `${origin}/checkout/${id}` } },
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url?.startsWith("/v2/payments/")) {
    const paymentId = decodeURIComponent(req.url.slice("/v2/payments/".length));
    if (paymentId === "tr_runtime_timeout") {
      res.writeHead(200, { "content-type": "application/json" });
      res.write('{"id":"tr_runtime_timeout"');
      setTimeout(() => res.end("}"), 300).unref();
      return;
    }
    if (paymentId === "tr_runtime_500") {
      res
        .writeHead(500, { "content-type": "application/json" })
        .end(JSON.stringify({ detail: "temporary outage" }));
      return;
    }
    if (paymentId === "tr_runtime_404") {
      res
        .writeHead(404, { "content-type": "application/json" })
        .end(JSON.stringify({ detail: "unknown payment" }));
      return;
    }
    if (paymentId === "tr_runtime_malformed") {
      res.writeHead(200, { "content-type": "application/json" }).end('{"id":');
      return;
    }
    const returnedId =
      paymentId === "tr_runtime_wrong_id" ? "tr_runtime_other" : paymentId;
    res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify(
        providerPayment(returnedId, {
          amount: { currency: "EUR", value: "71.00" },
          metadata,
        }),
      ),
    );
    return;
  }
  if (req.method !== "POST" || req.url !== "/v2/payments") {
    res.writeHead(404).end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;
  const key = String(req.headers["idempotency-key"] ?? "");
  attempts.push({ key, body });
  if (key === "94000000-0000-4000-8000-000000000409") {
    res
      .writeHead(409, { "content-type": "application/json" })
      .end(JSON.stringify({ detail: "in progress" }));
    return;
  }
  const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const existing = accepted.get(key);
  if (existing && existing.hash !== hash) {
    res
      .writeHead(409, { "content-type": "application/json" })
      .end(JSON.stringify({ detail: "idempotency conflict" }));
    return;
  }
  const payment =
    existing?.payment ??
    providerPayment(`tr_runtime_${accepted.size + 1}`, body);
  accepted.set(key, { hash, payment });
  res
    .writeHead(200, { "content-type": "application/json" })
    .end(JSON.stringify(payment));
});

await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", resolve);
});

process.env.MOLLIE_API_BASE_URL = origin;
process.env.MOLLIE_API_KEY = "runtime-provider-test-key";
process.env.MOLLIE_REQUEST_TIMEOUT_MS = "100";

const requestKey = "94000000-0000-4000-8000-000000000100";
const input = {
  requestKey,
  amountCents: 7100,
  currency: "EUR",
  description: "Runtime invoice payment",
  redirectUrl: `${origin}/return`,
  webhookUrl: `${origin}/webhook`,
  metadata,
};

try {
  const [first, concurrent] = await Promise.all([
    createMolliePayment(input),
    createMolliePayment(input),
  ]);
  assert.equal(first.id, concurrent.id);
  assert.equal(first.amountCents, 7100);
  assert.equal(first.currency, "EUR");
  assert.equal(first.profileId, "pfl_runtime_provider");
  assert.equal(first.mode, "test");
  assert.equal(accepted.size, 1);
  assert.ok(attempts.every((attempt) => attempt.key === requestKey));

  const fetched = await fetchMolliePayment(first.id);
  assert.equal(fetched.id, first.id);
  assert.equal(fetched.amountCents, 7100);

  await assert.rejects(
    createMolliePayment({ ...input, amountCents: 7200 }),
    (error) =>
      error instanceof AmbiguousProviderResultError && error.status === 409,
  );
  await assert.rejects(
    createMolliePayment({
      ...input,
      requestKey: "94000000-0000-4000-8000-000000000409",
    }),
    (error) =>
      error instanceof AmbiguousProviderResultError && error.status === 409,
  );

  await assert.rejects(
    fetchMolliePayment("tr_runtime_timeout"),
    (error) =>
      error instanceof MollieProviderError &&
      error.kind === "timeout" &&
      error.retryable,
  );
  await assert.rejects(
    fetchMolliePayment("tr_runtime_500"),
    (error) =>
      error instanceof MollieProviderError &&
      error.kind === "server_error" &&
      error.status === 500 &&
      error.retryable,
  );
  await assert.rejects(
    fetchMolliePayment("tr_runtime_404"),
    (error) =>
      error instanceof MollieProviderError &&
      error.kind === "client_error" &&
      error.status === 404 &&
      !error.retryable,
  );
  await assert.rejects(
    fetchMolliePayment("tr_runtime_malformed"),
    (error) =>
      error instanceof MollieProviderError &&
      error.kind === "malformed_response" &&
      error.retryable,
  );
  await assert.rejects(
    fetchMolliePayment("tr_runtime_wrong_id"),
    (error) =>
      error instanceof MollieProviderError &&
      error.kind === "envelope_mismatch" &&
      !error.retryable,
  );

  assert.throws(
    () =>
      assertProviderEnvelope(first, {
        amountCents: 7200,
        currency: input.currency,
        metadata,
      }),
    /Provider amount mismatch/u,
  );
  assert.throws(
    () =>
      assertProviderEnvelope(first, {
        amountCents: first.amountCents,
        currency: first.currency,
        metadata: { ...metadata, tenantId: "wrong-tenant" },
      }),
    /Provider metadata mismatch for tenantId/u,
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

await assert.rejects(
  createMolliePayment({
    ...input,
    requestKey: "94000000-0000-4000-8000-000000000500",
  }),
  (error) =>
    error instanceof AmbiguousProviderResultError &&
    error.ambiguous &&
    error.kind === "network" &&
    error.retryable,
);
await assert.rejects(
  fetchMolliePayment("tr_runtime_network"),
  (error) =>
    error instanceof MollieProviderError &&
    error.kind === "network" &&
    error.retryable,
);

console.log(
  JSON.stringify({
    status: "passed",
    stableIdempotencyKey: requestKey,
    createAttempts: attempts.length,
    uniqueLogicalPayments: accepted.size,
    changedPayloadRejected: true,
    provider409Reconciled: true,
    fullResponseTimeoutBounded: true,
    ambiguousNetworkResult: true,
    fetchNetworkResultClassified: true,
    httpFailuresClassified: true,
    malformedAndEnvelopeFailuresClassified: true,
    financialEnvelopeMismatchesRejected: true,
  }),
);
