#!/usr/bin/env node
import {
  buildPhase1DemoDataPlan,
  validatePhase1Fixtures,
} from "../tests/fixtures/fieldgrid-phase-1-fixtures.mjs";

const args = new Set(process.argv.slice(2));
const errors = validatePhase1Fixtures();

if (errors.length > 0) {
  console.error("Fieldgrid phase 1 fixture validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const plan = buildPhase1DemoDataPlan();

if (args.has("--check")) {
  console.log("Fieldgrid phase 1 fixture contract is valid.");
  process.exit(0);
}

if (args.has("--json")) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

console.log("Fieldgrid phase 1 demo-data plan");
console.log("");
console.log(`Marker: ${plan.marker}`);
console.log(`Destructive: ${plan.destructive ? "yes" : "no"}`);
console.log(`Mutates existing tenants: ${plan.mutatesExistingTenants ? "yes" : "no"}`);
console.log(`Tenants: ${plan.allowedTenantSlugs.join(", ")}`);
console.log(`Actors: ${plan.actors.length}`);
console.log(`Records: ${plan.records.length}`);
console.log(`Storage objects: ${plan.storageObjects.length}`);
console.log("");
console.log("Migration smoke targets:");
for (const smoke of plan.migrationSmokes) {
  console.log(`- ${smoke.id}: ${smoke.target} -> ${smoke.command}`);
}
console.log("");
console.log("This script is intentionally plan-only. It does not connect to a database and it does not write staging data.");
console.log("Use --json for machine-readable fixtures or --check for CI validation.");
