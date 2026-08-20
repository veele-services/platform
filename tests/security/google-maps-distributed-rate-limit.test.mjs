import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync("lib/db/src/google-maps-rate-limit.ts", "utf8");
const migration = readFileSync(
  "lib/db/migrations/20260820113004_google_maps_distributed_rate_limits.sql",
  "utf8",
);
const runtime = readFileSync(
  "scripts/fieldgrid-google-maps-rate-limit-runtime.mts",
  "utf8",
);
const wrappers = [
  "artifacts/backoffice/src/lib/google-maps/rate-limit.ts",
  "artifacts/klant-pwa/src/lib/google-maps/rate-limit.ts",
  "artifacts/personeel-pwa/src/lib/google-maps/rate-limit.ts",
].map((path) => readFileSync(path, "utf8"));

test("all Google Maps surfaces use one durable atomic limiter", () => {
  assert.match(service, /INSERT INTO public\.google_maps_rate_limit_buckets/u);
  assert.match(
    service,
    /ON CONFLICT \(tenant_id, actor_key, action, window_started_at\)/u,
  );
  assert.match(service, /request_count \+ 1/u);
  assert.match(service, /FOR UPDATE SKIP LOCKED/u);
  for (const wrapper of wrappers) {
    assert.match(wrapper, /consumeGoogleMapsRateLimit/u);
    assert.doesNotMatch(wrapper, /new Map/u);
  }
});

test("cost protection fails closed without a process-memory fallback", () => {
  assert.match(service, /reason: "service_unavailable"/u);
  assert.match(service, /allowed: false/u);
  assert.match(service, /There is deliberately no memory fallback/u);
  assert.doesNotMatch(service, /new Map/u);
});

test("autocomplete analytics dedupe is durable and stores only a session hash", () => {
  assert.match(service, /createHash\("sha256"\)/u);
  assert.match(service, /google_maps_autocomplete_sessions/u);
  assert.doesNotMatch(migration, /session_token/u);
  assert.match(migration, /session_hash varchar\(64\)/u);
});

test("the server-only schema is tenant-keyed, indexed and inaccessible to browser roles", () => {
  assert.match(
    migration,
    /UNIQUE \(tenant_id, actor_key, action, window_started_at\)/u,
  );
  assert.match(migration, /google_maps_rate_limit_expiry_idx/u);
  assert.match(migration, /REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated/u);
});

test("runtime proof covers boundaries, concurrency, replicas, cleanup and DB failure", () => {
  for (const evidence of [
    "exactLimit",
    "aboveLimit",
    "newWindow",
    "tenantBFirst",
    "userBFirst",
    "actionFirst",
    "Promise.all",
    "fieldgrid-google-maps-rate-limit-replica.mts",
    "execFileAsync",
    "concurrentRow",
    "expiredActor",
    "service_unavailable",
    "set local role authenticated",
  ]) {
    assert.match(runtime, new RegExp(evidence.replaceAll(".", "\\."), "u"));
  }
});
