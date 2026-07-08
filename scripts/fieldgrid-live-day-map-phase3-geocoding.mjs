#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checkMode = process.argv.includes("--check");

const files = {
  geocoder: "artifacts/backoffice/src/lib/planning/geocoding.ts",
  customers: "artifacts/backoffice/src/app/actions/customers.ts",
  objects: "artifacts/backoffice/src/app/actions/objects.ts",
  objectDetailSafe: "artifacts/backoffice/src/app/actions/object-detail-safe.ts",
  geocodeStatus: "artifacts/backoffice/src/components/geocoding/GeocodeStatus.tsx",
  customerActions: "artifacts/backoffice/src/components/customers/CustomerDetailActions.tsx",
  objectActions: "artifacts/backoffice/src/components/objects/ObjectDetailActions.tsx",
  customerOverview: "artifacts/backoffice/src/components/customers/tabs/CustomerOverviewTab.tsx",
  objectOverview: "artifacts/backoffice/src/components/objects/tabs/ObjectOverviewTab.tsx",
  docs: "docs/fieldgrid-live-day-map-phase3-geocoding.md",
  packageJson: "package.json",
};

function read(file) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) return null;
  return fs.readFileSync(absolute, "utf8");
}

const failures = [];

function requireFile(key) {
  const contents = read(files[key]);
  if (!contents) failures.push(`${files[key]} ontbreekt.`);
  return contents ?? "";
}

function mustContain(key, needle, label = needle) {
  const contents = requireFile(key);
  if (!contents.includes(needle)) {
    failures.push(`${files[key]} mist: ${label}`);
  }
}

function mustNotContain(key, needle, label = needle) {
  const contents = requireFile(key);
  if (contents.includes(needle)) {
    failures.push(`${files[key]} bevat verboden fase-3 patroon: ${label}`);
  }
}

mustContain("geocoder", 'import "server-only";', "server-only guard");
mustContain("geocoder", "api.pdok.nl", "PDOK provider");
mustContain("geocoder", "AbortController", "provider timeout");
mustContain("geocoder", "fetchImpl?: FetchLike", "mockable fetch");
mustContain("geocoder", "parsePdokPoint", "PDOK WKT parser");
mustContain("geocoder", "hasGeocodableAddress", "address fallback");
mustNotContain("geocoder", "NEXT_PUBLIC", "client env geocoder config");
mustNotContain("geocoder", "maplibre", "map rendering");

mustContain("customers", "geocodeCustomerLocation", "manual customer geocoding action");
mustContain("customers", "geocodingResetForAddress", "customer address reset");
mustContain("customers", "geocode_customer_location_failed", "customer failed audit action");
mustContain("customers", "locationChanged(existing, payload)", "customer address change detection");
mustContain("customers", "geocodingStatus", "customer geocoding status propagation");
mustContain("customers", "latitude", "customer latitude propagation");
mustContain("customers", "longitude", "customer longitude propagation");

mustContain("objects", "geocodeObjectLocation", "manual object geocoding action");
mustContain("objects", "geocodingResetForAddress", "object address reset");
mustContain("objects", "geocode_object_location_failed", "object failed audit action");
mustContain("objects", "locationChanged(existing, payload)", "object address change detection");
mustContain("objects", "geocodingStatus", "object geocoding status propagation");
mustContain("objects", "latitude", "object latitude propagation");
mustContain("objects", "longitude", "object longitude propagation");

mustContain("objectDetailSafe", "geocodingStatus", "safe object detail geocoding status");
mustContain("objectDetailSafe", "geocodedAt", "safe object detail geocoded date");

mustContain("geocodeStatus", "GeocodeStatusBadge", "shared geocode badge");
mustContain("geocodeStatus", "GeocodeStatusSummary", "shared geocode summary");
mustContain("geocodeStatus", "Wacht op geocoding", "Dutch pending label");
mustContain("geocodeStatus", "Niet gevonden", "Dutch failed label");

mustContain("customerActions", "Opnieuw geocoden", "customer manual geocode button");
mustContain("customerActions", "GeocodeStatusSummary", "customer geocode status UI");
mustContain("objectActions", "Locatie opnieuw geocoden", "object manual geocode action");
mustContain("objectActions", "GeocodeStatusSummary", "object geocode status UI");
mustContain("customerOverview", "GeocodeStatusBadge", "customer overview geocode badge");
mustContain("objectOverview", "GeocodeStatusBadge", "object overview geocode badge");

mustContain("docs", "Read-only geocoding", "phase doc title");
mustContain("docs", "PDOK", "phase doc provider");
mustContain("docs", "geen planningmutatie", "phase doc non-planning guarantee");
mustContain("docs", "handmatig", "phase doc manual workflow");

mustContain("packageJson", "fieldgrid:live-day-map-phase3:check", "package script");

if (failures.length > 0) {
  console.error("Fieldgrid live day map phase 3 geocoding check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const message = "Fieldgrid live day map phase 3 geocoding check passed.";
if (checkMode) {
  console.log(message);
} else {
  console.log(`${message} Run with --check in CI for strict mode.`);
}
