import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function assertFileExists(relativePath) {
  assert.equal(existsSync(new URL(`../${relativePath}`, import.meta.url)), true, `${relativePath} bestaat`);
}

const GOOGLE_MAPS_MODULE_FILES = [
  "artifacts/backoffice/src/lib/google-maps/types.ts",
  "artifacts/backoffice/src/lib/google-maps/config.ts",
  "artifacts/backoffice/src/lib/google-maps/travel-modes.ts",
  "artifacts/backoffice/src/lib/google-maps/marker-status.ts",
  "artifacts/backoffice/src/lib/google-maps/errors.ts",
  "artifacts/backoffice/src/lib/google-maps/cache.ts",
  "artifacts/backoffice/src/lib/google-maps/metrics.ts",
  "artifacts/backoffice/src/lib/google-maps/client-loader.ts",
  "artifacts/backoffice/src/lib/google-maps/index.ts",
];

test("Sprint 1: central Google Maps module files exist", () => {
  for (const file of GOOGLE_MAPS_MODULE_FILES) {
    assertFileExists(file);
  }
});

test("Sprint 1: server config has server-only guard and canon env names", () => {
  const config = read("artifacts/backoffice/src/lib/google-maps/config.ts");

  assert.match(config, /import "server-only"/u);
  assert.match(config, /NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY/u);
  assert.match(config, /GOOGLE_MAPS_SERVER_API_KEY/u);
  assert.match(config, /GOOGLE_MAPS_MAP_ID/u);
  assert.match(config, /GOOGLE_MAPS_ENABLED/u);
  assert.match(config, /GOOGLE_PLACES_AUTOCOMPLETE_ENABLED/u);
  assert.match(config, /GOOGLE_ROUTES_TRAFFIC_ENABLED/u);
  assert.match(config, /assertGoogleMapsServerSecretsSafe/u);
  assert.match(config, /assertNoGoogleMapsServerSecretLeak/u);
});

test("Sprint 1: client loader never references server-only Google secrets", () => {
  const clientLoader = read("artifacts/backoffice/src/lib/google-maps/client-loader.ts");

  assert.match(clientLoader, /"use client"/u);
  assert.match(clientLoader, /maps\.googleapis\.com\/maps\/api\/js/u);
  assert.doesNotMatch(clientLoader, /GOOGLE_MAPS_SERVER_API_KEY/u);
  assert.doesNotMatch(clientLoader, /GOOGLE_ROUTES_API_KEY/u);
  assert.doesNotMatch(clientLoader, /process\.env/u);
});

test("Sprint 1: no public env example exposes a Google server key", () => {
  const rootEnv = read(".env.example");
  const backofficeEnv = read("artifacts/backoffice/.env.example");

  for (const content of [rootEnv, backofficeEnv]) {
    assert.match(content, /NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY/u);
    assert.match(content, /GOOGLE_MAPS_SERVER_API_KEY/u);
    assert.match(content, /GOOGLE_MAPS_MAP_ID/u);
    assert.match(content, /GOOGLE_MAPS_DEFAULT_COUNTRY="NL"/u);
    assert.doesNotMatch(content, /NEXT_PUBLIC_GOOGLE_MAPS_SERVER_API_KEY/u);
  }
});

test("Sprint 1: travel modes and marker statuses are central and canon-safe", () => {
  const travelModes = read("artifacts/backoffice/src/lib/google-maps/travel-modes.ts");
  const markerStatus = read("artifacts/backoffice/src/lib/google-maps/marker-status.ts");

  for (const mode of ["DRIVE", "BICYCLE", "WALK", "TRANSIT"]) {
    assert.match(travelModes, new RegExp(`"${mode}"`, "u"));
  }

  assert.doesNotMatch(travelModes, /TWO_WHEELER/u);
  assert.match(travelModes, /case "moped_or_scooter":[\s\S]*?return "DRIVE"/u);
  assert.match(travelModes, /trafficPreferenceForTravelMode/u);
  assert.match(travelModes, /TRAFFIC_AWARE/u);

  for (const status of [
    "draft",
    "open",
    "planned",
    "assigned",
    "seen",
    "started",
    "paused",
    "completed",
    "cancelled",
    "overdue",
    "urgent",
  ]) {
    assert.match(markerStatus, new RegExp(`${status}:`, "u"));
  }
});

test("Sprint 1: metrics and dedupe helpers avoid personal address payloads", () => {
  const metrics = read("artifacts/backoffice/src/lib/google-maps/metrics.ts");
  const cache = read("artifacts/backoffice/src/lib/google-maps/cache.ts");
  const types = read("artifacts/backoffice/src/lib/google-maps/types.ts");

  assert.match(metrics, /sanitizeGoogleMapsMetricMetadata/u);
  assert.match(metrics, /address\|api\.\?key\|secret\|token\|polyline/u);
  assert.match(cache, /stableGoogleMapsDedupeKey/u);
  assert.match(cache, /sha256/u);
  assert.match(types, /maps_view_opened/u);
  assert.match(types, /autocomplete_request/u);
  assert.match(types, /route_request_drive_traffic/u);
  assert.match(types, /google_api_rate_limited/u);
});

test("Sprint 1: deployment docs cover development, staging, production and test fallback", () => {
  const docs = read("docs/deployment/google-maps-platform.md");

  for (const expected of [
    "Development",
    "Staging",
    "Production",
    "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY",
    "GOOGLE_MAPS_SERVER_API_KEY",
    "GOOGLE_MAPS_MAP_ID",
    "FIELDGRID_ROUTE_PROVIDER",
    "testfallback",
    "Rollback",
  ]) {
    assert.match(docs, new RegExp(expected, "iu"));
  }
});
