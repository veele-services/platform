#!/usr/bin/env node
import {
  buildSprint6PortalAcceptanceManifest,
  runSprint6PortalAcceptanceCases,
  validateSprint6PortalAcceptance,
} from "../tests/fixtures/fieldgrid-sprint-6-portal-acceptance.mjs";

const args = new Set(process.argv.slice(2));
const errors = validateSprint6PortalAcceptance();

if (errors.length > 0) {
  console.error("Fieldgrid sprint 6 portal acceptance failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const manifest = buildSprint6PortalAcceptanceManifest();
const results = runSprint6PortalAcceptanceCases();

if (args.has("--check")) {
  console.log("Fieldgrid sprint 6 portal acceptance is valid.");
  process.exit(0);
}

if (args.has("--json")) {
  console.log(JSON.stringify(manifest, null, 2));
  process.exit(0);
}

console.log("Fieldgrid sprint 6 portal acceptance");
console.log("");
console.log(`Version: ${manifest.version}`);
console.log(`Destructive: ${manifest.destructive ? "yes" : "no"}`);
console.log(`Direct database writes: ${manifest.directDatabaseWrites ? "yes" : "no"}`);
console.log(`Mutates existing tenants: ${manifest.mutatesExistingTenants ? "yes" : "no"}`);
console.log(`Cases: ${manifest.summary.passed}/${manifest.summary.total} passed`);
console.log("");
console.log("Surfaces:");
for (const surface of manifest.summary.surfaces) {
  console.log(`- ${surface.surface}: ${surface.happy} happy, ${surface.denial} denial`);
}
console.log("");
console.log("Cases:");
for (const result of results) {
  const status = result.passed ? "PASS" : "FAIL";
  console.log(`- ${status} ${result.testId} [${result.surface}/${result.mode}] ${result.action}`);
}
console.log("");
console.log("Use --json for machine-readable output or --check for CI validation.");
