#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..");
const args = new Set(process.argv.slice(2));

export function buildPhase7StagingSmokePlan() {
  return {
    marker: "fieldgrid-phase-7-staging-smoke",
    destructive: false,
    mutatesExistingTenants: false,
    dashboardRoute: "/platform/staging-smoke",
    smokeApiRoute: "/api/platform/staging-smoke",
    recommendedStagingUrl: "https://staging.fieldgrid.nl/platform/staging-smoke",
    requiredTenants: ["field-demo"],
    requiredHosts: [
      "platform.fieldgrid.nl",
      "staging.fieldgrid.nl",
      "field-demo.fieldgrid.nl",
    ],
    checks: [
      { id: "FG-SMOKE-HOST", boundary: "host", testIds: ["FG-HOST-001", "FG-HOST-002", "FG-HOST-003", "FG-HOST-004"] },
      { id: "FG-SMOKE-LOGIN", boundary: "login", testIds: ["FG-PLATFORM-001", "FG-RBAC-001"] },
      { id: "FG-SMOKE-MODULES", boundary: "modules", testIds: ["FG-MODULE-001", "FG-MODULE-003", "FG-MODULE-005"] },
      { id: "FG-SMOKE-SECTORS", boundary: "sectoren", testIds: ["FG-SECTOR-001", "FG-SECTOR-002", "FG-SECTOR-006"] },
      { id: "FG-SMOKE-STORAGE", boundary: "storage", testIds: ["FG-STORAGE-001", "FG-STORAGE-002", "FG-STORAGE-007"] },
      { id: "FG-SMOKE-PDF-DOWNLOADS", boundary: "pdf-downloads", testIds: ["FG-DATA-004", "FG-DATA-005", "FG-AUDIT-001"] },
      { id: "FG-SMOKE-MIGRATIONS", boundary: "migraties", testIds: ["FG-MIG-001", "FG-MIG-002", "FG-MIG-003"] },
      { id: "FG-SMOKE-SUPPORT", boundary: "support grants", testIds: ["FG-SUPPORT-001", "FG-SUPPORT-002", "FG-SUPPORT-005"] },
      { id: "FG-SMOKE-AUDIT", boundary: "audit", testIds: ["FG-AUDIT-001", "FG-AUDIT-002", "FG-AUDIT-004"] },
    ],
    requiredDocs: [
      "docs/fieldgrid-phase-7-operations.md",
      "docs/fieldgrid-backup-restore-rollback-playbook.md",
      "docs/fieldgrid-first-external-tenant-checklist.md",
      "docs/fieldgrid-staging-promotion-checklist.md",
      "docs/fieldgrid-cross-tenant-testmatrix.md",
    ],
  };
}

export function validatePhase7StagingSmokePlan(plan = buildPhase7StagingSmokePlan()) {
  const errors = [];

  for (const docPath of plan.requiredDocs) {
    const absolutePath = join(repoRoot, docPath);
    if (!existsSync(absolutePath)) {
      errors.push(`${docPath} ontbreekt.`);
      continue;
    }

    const content = readFileSync(absolutePath, "utf8");
    if (!content.trim()) errors.push(`${docPath} is leeg.`);
  }

  const checkIds = new Set(plan.checks.map((check) => check.id));
  for (const requiredCheck of ["FG-SMOKE-HOST", "FG-SMOKE-MIGRATIONS", "FG-SMOKE-SUPPORT", "FG-SMOKE-AUDIT"]) {
    if (!checkIds.has(requiredCheck)) errors.push(`${requiredCheck} ontbreekt in het smokeplan.`);
  }

  if (plan.destructive) errors.push("Fase 7 smokeplan mag niet destructief zijn.");
  if (plan.mutatesExistingTenants) errors.push("Fase 7 smokeplan mag bestaande tenants niet wijzigen.");

  return errors;
}

const plan = buildPhase7StagingSmokePlan();
const errors = validatePhase7StagingSmokePlan(plan);

if (errors.length > 0) {
  console.error("Fieldgrid phase 7 staging smoke validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

if (args.has("--check")) {
  console.log("Fieldgrid phase 7 staging smoke contract is valid.");
  process.exit(0);
}

if (args.has("--json")) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

console.log("Fieldgrid phase 7 staging smoke plan");
console.log("");
console.log(`Marker: ${plan.marker}`);
console.log(`Destructive: ${plan.destructive ? "yes" : "no"}`);
console.log(`Mutates existing tenants: ${plan.mutatesExistingTenants ? "yes" : "no"}`);
console.log(`Dashboard: ${plan.recommendedStagingUrl}`);
console.log(`JSON API: ${plan.smokeApiRoute}`);
console.log(`Required tenants: ${plan.requiredTenants.join(", ")}`);
console.log(`Checks: ${plan.checks.length}`);
console.log("");
console.log("Minimum operationele bronnen:");
for (const docPath of plan.requiredDocs) console.log(`- ${docPath}`);
console.log("");
console.log("Use --json voor machine-readable output of --check voor CI-validatie.");
