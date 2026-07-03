#!/usr/bin/env node
import {
  buildSprint5RuntimeProofManifest,
  runSprint5RuntimeProofCases,
  validateSprint5RuntimeProof,
} from "../tests/fixtures/fieldgrid-sprint-5-runtime-proof.mjs";

const args = new Set(process.argv.slice(2));
const errors = validateSprint5RuntimeProof();

if (errors.length > 0) {
  console.error("Fieldgrid sprint 5 runtime security proof failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const manifest = buildSprint5RuntimeProofManifest();
const results = runSprint5RuntimeProofCases();

if (args.has("--check")) {
  console.log("Fieldgrid sprint 5 runtime security proof is valid.");
  process.exit(0);
}

if (args.has("--json")) {
  console.log(JSON.stringify(manifest, null, 2));
  process.exit(0);
}

console.log("Fieldgrid sprint 5 runtime security proof");
console.log("");
console.log(`Version: ${manifest.version}`);
console.log(`Destructive: ${manifest.destructive ? "yes" : "no"}`);
console.log(`Direct database writes: ${manifest.directDatabaseWrites ? "yes" : "no"}`);
console.log(`Mutates existing tenants: ${manifest.mutatesExistingTenants ? "yes" : "no"}`);
console.log(`Cases: ${manifest.summary.passed}/${manifest.summary.total} passed`);
console.log("");
console.log("Boundaries:");
for (const boundary of manifest.summary.boundaries) {
  console.log(`- ${boundary.boundary}: ${boundary.happy} happy, ${boundary.denial} denial`);
}
console.log("");
console.log("Cases:");
for (const result of results) {
  const status = result.passed ? "PASS" : "FAIL";
  console.log(`- ${status} ${result.testId} [${result.boundary}/${result.mode}] ${result.action}`);
}
console.log("");
console.log("Use --json for machine-readable output or --check for CI validation.");
