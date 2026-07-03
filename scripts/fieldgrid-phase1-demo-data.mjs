#!/usr/bin/env node
import {
  buildPhase1DemoDataPlan,
  buildPhase1RuntimeFixtureManifest,
  validatePhase1Fixtures,
} from "../tests/fixtures/fieldgrid-phase-1-fixtures.mjs";

const args = new Set(process.argv.slice(2));
const errors = validatePhase1Fixtures();

if (errors.length > 0) {
  console.error("Fieldgrid sprint 1 fixture validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const manifest = buildPhase1RuntimeFixtureManifest();
const plan = buildPhase1DemoDataPlan();

if (args.has("--check")) {
  console.log("Fieldgrid sprint 1 runtime fixture contract is valid.");
  process.exit(0);
}

if (args.has("--json")) {
  console.log(JSON.stringify(manifest, null, 2));
  process.exit(0);
}

if (args.has("--plan-json")) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

console.log("Fieldgrid sprint 1 runtime fixture manifest");
console.log("");
console.log(`Version: ${manifest.version}`);
console.log(`Marker: ${manifest.marker}`);
console.log(`Scope: ${manifest.scope}`);
console.log(`Destructive: ${manifest.destructive ? "yes" : "no"}`);
console.log(`Direct database writes: ${manifest.directDatabaseWrites ? "yes" : "no"}`);
console.log(`Mutates existing tenants: ${manifest.mutatesExistingTenants ? "yes" : "no"}`);
console.log(`Tenants: ${manifest.allowedTenantSlugs.join(", ")}`);
console.log(`Tenant domains: ${manifest.tenantDomains.length}`);
console.log(`Actors: ${manifest.actors.length}`);
console.log(`Records: ${manifest.records.length}`);
console.log(`Storage objects: ${manifest.storageObjects.length}`);
console.log(`Seed batches: ${manifest.seedBatches.length}`);
console.log(`Cleanup batches: ${manifest.cleanupBatches.length}`);
console.log(`Runtime assertions: ${manifest.runtimeAssertions.length}`);
console.log("");
console.log("Seed batches:");
for (const batch of manifest.seedBatches) {
  console.log(`- ${batch.id}: ${batch.table}${batch.virtual ? " (virtual manifest)" : ""}, ${batch.rows.length} rows, unique by ${batch.uniqueBy.join(" + ")}`);
}
console.log("");
console.log("Cleanup batches:");
for (const batch of manifest.cleanupBatches) {
  console.log(`- ${batch.id}: ${batch.tables.join(", ")}`);
}
console.log("");
console.log("Migration smoke targets:");
for (const smoke of manifest.migrationSmokes) {
  console.log(`- ${smoke.id}: ${smoke.target} -> ${smoke.command}`);
}
console.log("");
console.log("This script is intentionally manifest-only. It does not connect to a database and it does not write staging data.");
console.log("Use --json for the runtime fixture manifest, --plan-json for the legacy demo-data plan, or --check for CI validation.");
