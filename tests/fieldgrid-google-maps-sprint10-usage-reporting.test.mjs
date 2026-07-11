import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const usageEvents = [
  "maps_view_opened",
  "autocomplete_request",
  "autocomplete_session_started",
  "autocomplete_selection",
  "place_details_request",
  "route_request",
  "route_request_drive_traffic",
  "route_request_bicycle",
  "route_request_walk",
  "route_request_transit",
  "google_api_error",
  "google_api_rate_limited",
];

const forbiddenMetadataKeys = [
  "address",
  "apiKey",
  "secret",
  "token",
  "polyline",
  "payload",
  "placeId",
  "query",
  "input",
  "origin",
  "destination",
  "coordinate",
  "lat",
  "lng",
  "postal",
  "city",
  "street",
  "hasPlaceId",
  "hasCoordinates",
];

const metadataGuardPatterns = [
  "address",
  "api.\\?key",
  "secret",
  "token",
  "polyline",
  "payload",
  "place.\\?id",
  "query",
  "input",
  "origin",
  "destination",
  "coordinate",
  "lat",
  "lng",
  "postal",
  "city",
  "street",
];

test("Sprint 10 usage schema contains every canon Google Maps event", () => {
  const schema = read("lib/db/src/schema/google-maps-usage.ts");

  for (const event of usageEvents) {
    assert.match(schema, new RegExp(`"${event}"`, "u"));
  }

  assert.match(schema, /tenantId: uuid\("tenant_id"\)/u);
  assert.match(schema, /provider: varchar\("provider"/u);
  assert.match(schema, /estimatedSku: varchar\("estimated_sku"/u);
  assert.match(schema, /cacheOrDedupeStatus: varchar\("cache_or_dedupe_status"/u);
});

test("Sprint 10 metadata hardening rejects PII, addresses, route payloads and credentials", () => {
  const migration = read("lib/db/migrations/20260710230000_google_maps_usage_metadata_hardening.sql");
  const metrics = read("artifacts/backoffice/src/lib/google-maps/metrics.ts");

  assert.match(migration, /google_maps_usage_events_metadata_safe_check/u);
  assert.match(migration, /jsonb_path_exists/u);
  assert.match(migration, /hasCoordinates/u);
  assert.match(migration, /locationResolved/u);
  assert.match(migration, /hasPlaceId/u);
  assert.match(migration, /selected/u);

  for (const pattern of metadataGuardPatterns) {
    assert.match(migration, new RegExp(pattern, "iu"), `${pattern} is blocked by DB constraint`);
    assert.match(metrics, new RegExp(pattern, "iu"), `${pattern} is stripped by sanitizer`);
  }
});

test("Sprint 10 browser map views are recorded without secrets or location payloads", () => {
  const canvas = read("artifacts/backoffice/src/components/google-maps/GoogleMapCanvas.tsx");
  const route = read("artifacts/backoffice/src/app/api/google-maps/usage/route.ts");

  assert.match(canvas, /\/backoffice-api\/google-maps\/usage/u);
  assert.match(canvas, /maps_view_opened/u);
  assert.match(canvas, /maps_javascript_api_dynamic_map/u);
  assert.match(canvas, /usageRecordedRef/u);
  assert.doesNotMatch(canvas, /GOOGLE_MAPS_SERVER_API_KEY/u);

  assert.match(route, /requireCurrentTenantIdFromRequest\(request\)/u);
  assert.match(route, /hasPermissionFromRequest\(request,\s*"planning", "read"\)/u);
  assert.match(route, /hasPermissionFromRequest\(request,\s*"personnel", "read"\)/u);
  assert.match(route, /hasPermissionFromRequest\(request,\s*"objects", "read"\)/u);
  assert.match(route, /hasPermissionFromRequest\(request,\s*"customers", "read"\)/u);
  assert.match(route, /recordGoogleMapsUsageEvent/u);
  assert.match(route, /maps_view_opened/u);
  assert.match(route, /autocomplete_session_started/u);
  assert.match(route, /autocomplete_selection/u);
  assert.doesNotMatch(route, /GOOGLE_MAPS_SERVER_API_KEY/u);
});

test("Sprint 10 Places endpoints record sessions, requests, selections, details, errors and rate limits", () => {
  const files = [
    "artifacts/backoffice/src/app/api/google-maps/places/autocomplete/route.ts",
    "artifacts/backoffice/src/app/api/google-maps/places/details/route.ts",
    "artifacts/klant-pwa/src/app/api/google-maps/places/autocomplete/route.ts",
    "artifacts/klant-pwa/src/app/api/google-maps/places/details/route.ts",
    "artifacts/personeel-pwa/src/app/api/google-maps/places/autocomplete/route.ts",
    "artifacts/personeel-pwa/src/app/api/google-maps/places/details/route.ts",
  ];

  for (const file of files) {
    const content = read(file);
    assert.match(content, /googleMapsUsageEventsTable|recordGoogleMapsUsageEvent/u, `${file} records usage`);
    assert.match(content, /google_api_error/u, `${file} records Google errors`);
    assert.match(content, /google_api_rate_limited/u, `${file} records rate limits`);
    assert.match(content, /provider: "google_maps"|GOOGLE_MAPS_PROVIDER/u, `${file} stores provider`);
    for (const forbidden of forbiddenMetadataKeys) {
      assert.doesNotMatch(content, new RegExp(`metadata:\\s*\\{[^}]*\\b${forbidden}\\s*:`, "iu"), `${file} must not store ${forbidden} as a metric metadata key`);
    }
  }

  for (const file of files.filter((name) => name.includes("autocomplete"))) {
    const content = read(file);
    assert.match(content, /autocomplete_session_started/u, `${file} starts a session event`);
    assert.match(content, /autocomplete_request/u, `${file} records autocomplete requests`);
    assert.match(content, /places_autocomplete_session/u, `${file} records session SKU`);
    assert.match(content, /places_autocomplete_new/u, `${file} records autocomplete SKU`);
  }

  for (const file of files.filter((name) => name.includes("details"))) {
    const content = read(file);
    assert.match(content, /autocomplete_selection/u, `${file} records selection`);
    assert.match(content, /place_details_request/u, `${file} records details request`);
    assert.match(content, /places_details_new_essentials/u, `${file} records details SKU`);
    assert.match(content, /selected/u, `${file} stores non-PII selection metadata`);
    assert.match(content, /locationResolved/u, `${file} stores non-PII resolution metadata`);
  }
});

test("Sprint 10 platform reporting aggregates by tenant, provider, SKU, cache status and anomalies", () => {
  const action = read("artifacts/backoffice/src/app/actions/google-maps-usage.ts");
  const operationsAction = read("artifacts/backoffice/src/app/actions/platform-operations.ts");
  const page = read("artifacts/backoffice/src/app/(platform)/platform/operations/page.tsx");

  assert.match(action, /getPlatformGoogleMapsUsageDashboard/u);
  assert.match(action, /getTenantGoogleMapsUsageDashboard/u);
  assert.match(action, /requirePlatformAdmin/u);
  assert.match(action, /requireCurrentTenantId/u);
  assert.match(action, /usage\.tenant_id = \$\{input\.tenantId\}::uuid/u);
  assert.match(action, /request_date >= \$\{periodStart\}::date/u);
  assert.match(action, /GROUP BY usage\.tenant_id, tenants\.name/u);
  assert.match(action, /GROUP BY usage\.event_type/u);
  assert.match(action, /GROUP BY usage\.provider/u);
  assert.match(action, /GROUP BY COALESCE\(usage\.estimated_sku, 'unknown'\)/u);
  assert.match(action, /GROUP BY usage\.cache_or_dedupe_status/u);
  assert.match(action, /anomalyReasons/u);
  assert.match(action, /Afwijkend veel events/u);
  assert.match(action, /Hoge foutgraad/u);

  assert.match(operationsAction, /googleMapsUsage: GoogleMapsUsageDashboard/u);
  assert.match(operationsAction, /getPlatformGoogleMapsUsageDashboard/u);

  for (const label of [
    "Google Maps usage",
    "Tenantgebruik",
    "Estimated SKU",
    "Provider",
    "Cache en dedupe",
    "Afwijkend gebruik",
    "Recente fouten",
  ]) {
    assert.match(page, new RegExp(label, "u"));
  }
});
