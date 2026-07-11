import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const migrationPath =
  "lib/db/migrations/20260710210000_google_maps_location_metrics.sql";

test("Sprint 2: migration adds canonical location fields without removing legacy address columns", () => {
  assert.equal(existsSync(new URL(`../${migrationPath}`, import.meta.url)), true);
  const migration = read(migrationPath);

  for (const table of ["customers", "objects", "personnel"]) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table}`, "u"));
  }

  for (const field of [
    "address_line_1",
    "address_line_2",
    "formatted_address",
    "google_place_id",
    "location_source",
    "location_verified_at",
    "location_updated_at",
    "country_code",
    "latitude",
    "longitude",
  ]) {
    assert.match(migration, new RegExp(field, "u"));
  }

  assert.match(migration, /COALESCE\(address_line_1, address\)/u);
  assert.match(migration, /COALESCE\(address_line_1, address_street\)/u);
});

test("Sprint 2: assignments receive execution location snapshots", () => {
  const migration = read(migrationPath);
  const assignmentsSchema = read("lib/db/src/schema/assignments.ts");

  for (const field of [
    "execution_address_line_1",
    "execution_address_line_2",
    "execution_postal_code",
    "execution_city",
    "execution_formatted_address",
    "execution_latitude",
    "execution_longitude",
    "execution_google_place_id",
    "execution_location_snapshot_at",
  ]) {
    assert.match(migration, new RegExp(field, "u"));
  }

  for (const property of [
    "executionAddressLine1",
    "executionFormattedAddress",
    "executionLatitude",
    "executionLongitude",
    "executionGooglePlaceId",
    "executionLocationSnapshotAt",
  ]) {
    assert.match(assignmentsSchema, new RegExp(property, "u"));
  }
});

test("Sprint 2: assignment snapshot backfill avoids target aliases inside FROM joins", () => {
  const migration = read(migrationPath);

  assert.doesNotMatch(
    migration,
    /FROM public\.customers AS c\s+LEFT JOIN public\.objects AS o\s+ON[\s\S]*?\ba\./u,
  );
  assert.match(
    migration,
    /FROM public\.objects AS o, public\.customers AS c[\s\S]*?o\.id = a\.object_id/u,
  );
  assert.match(
    migration,
    /FROM public\.customers AS c[\s\S]*?AND a\.execution_location_snapshot_at IS NULL/u,
  );
});

test("Sprint 2: travel modes are canonical and legacy values are migrated safely", () => {
  const migration = read(migrationPath);
  const personnelSchema = read("lib/db/src/schema/personnel.ts");
  const routeUtils = read("artifacts/backoffice/src/lib/planning/routes/route-utils.ts");

  for (const mode of ["DRIVE", "BICYCLE", "WALK", "TRANSIT"]) {
    assert.match(personnelSchema, new RegExp(`"${mode}"`, "u"));
    assert.match(migration, new RegExp(`'${mode}'`, "u"));
  }

  assert.match(personnelSchema, /LEGACY_PERSONNEL_VEHICLE_TYPES/u);
  assert.match(personnelSchema, /legacyVehicleType/u);
  assert.match(migration, /legacy_vehicle_type/u);
  assert.match(migration, /WHEN 'moped_or_scooter' THEN 'DRIVE'/u);
  assert.match(routeUtils, /case "moped_or_scooter":[\s\S]*?return "DRIVE"/u);
  assert.doesNotMatch(routeUtils, /TWO_WHEELER/u);
});

test("Sprint 2: provider-neutral usage metrics are tenant-scoped and payload-safe", () => {
  const migration = read(migrationPath);
  const usageSchema = read("lib/db/src/schema/google-maps-usage.ts");
  const schemaIndex = read("lib/db/src/schema/index.ts");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.google_maps_usage_events/u);
  assert.match(migration, /tenant_id uuid NOT NULL REFERENCES public\.tenants\(id\)/u);
  assert.match(migration, /event_type varchar\(80\) NOT NULL/u);
  assert.match(migration, /estimated_sku varchar\(120\)/u);
  assert.match(migration, /metadata jsonb NOT NULL DEFAULT '\{\}'::jsonb/u);
  assert.match(migration, /NOT \(metadata \? 'address'\)/u);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.google_maps_usage_events FROM anon/u);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.google_maps_usage_events FROM authenticated/u);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/u);

  for (const eventType of [
    "maps_view_opened",
    "autocomplete_request",
    "autocomplete_selection",
    "place_details_request",
    "route_request_drive_traffic",
    "route_request_bicycle",
    "route_request_walk",
    "route_request_transit",
    "google_api_error",
    "google_api_rate_limited",
  ]) {
    assert.match(usageSchema, new RegExp(eventType, "u"));
  }

  assert.match(usageSchema, /googleMapsUsageEventsTable/u);
  assert.match(schemaIndex, /google-maps-usage/u);
});

test("Sprint 2: Drizzle schemas expose canonical location properties", () => {
  const files = [
    "lib/db/src/schema/customers.ts",
    "lib/db/src/schema/objects.ts",
    "lib/db/src/schema/personnel.ts",
  ];

  for (const file of files) {
    const content = read(file);
    for (const property of [
      "addressLine1",
      "addressLine2",
      "formattedAddress",
      "googlePlaceId",
      "locationSource",
      "locationVerifiedAt",
      "locationUpdatedAt",
      "countryCode",
    ]) {
      assert.match(content, new RegExp(property, "u"), `${file} exposes ${property}`);
    }
  }
});
