import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyOfflineSyncFailure,
  computeOfflineRetryDelayMs,
} from "../../artifacts/personeel-pwa/src/lib/offline/offline-sync-errors.ts";

test("network, timeout and transient HTTP failures are retryable", () => {
  for (const failure of [
    new TypeError("Failed to fetch"),
    new DOMException("request timed out", "TimeoutError"),
    { success: false, status: 408, error: "timeout" },
    { success: false, status: 425, error: "too early" },
    { success: false, status: 429, error: "rate limited" },
    { success: false, status: 502, error: "bad gateway" },
    { success: false, status: 503, error: "unavailable" },
    { success: false, status: 504, error: "gateway timeout" },
    { success: false, code: "57P01", error: "database unavailable" },
  ]) {
    assert.equal(classifyOfflineSyncFailure(failure).kind, "transient");
  }
});

test("authorization, validation, tenant and version failures are terminal", () => {
  for (const failure of [
    { success: false, status: 401, error: "Niet ingelogd" },
    { success: false, status: 403, error: "Geen toegang" },
    { success: false, status: 422, error: "Ongeldige invoer" },
    { success: false, code: "tenant_mismatch", error: "tenant mismatch" },
  ]) {
    assert.equal(classifyOfflineSyncFailure(failure).kind, "permanent");
  }
  assert.equal(
    classifyOfflineSyncFailure({ success: false, code: "expected_version_conflict", error: "Conflict" }).kind,
    "conflict",
  );
});

test("429 backoff is bounded, exponential, jittered and honors Retry-After", () => {
  assert.equal(computeOfflineRetryDelayMs({ attempt: 1, random: () => 0.5, status: 429 }), 2_000);
  assert.equal(computeOfflineRetryDelayMs({ attempt: 2, random: () => 0.5, status: 429 }), 4_000);
  assert.equal(
    computeOfflineRetryDelayMs({ attempt: 1, random: () => 0, retryAfterMs: 30_000, status: 429 }),
    30_000,
  );
  assert.ok(computeOfflineRetryDelayMs({ attempt: 99, random: () => 1 }) <= 75_000);
});

test("stored error messages redact credential-shaped material", () => {
  const classified = classifyOfflineSyncFailure(
    new TypeError("Failed to fetch Authorization=Bearer abcdefghijklmnopqrstuvwxyz token=supersecret"),
  );
  assert.equal(classified.kind, "transient");
  assert.doesNotMatch(classified.message, /abcdefghijklmnopqrstuvwxyz|supersecret/u);
  assert.match(classified.message, /\[redacted\]/u);
});
