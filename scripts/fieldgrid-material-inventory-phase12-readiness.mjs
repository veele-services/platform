import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPhase11HardeningPlan,
  validatePhase11HardeningPlan,
} from "./fieldgrid-material-inventory-phase11-hardening.mjs";

export const PHASE12_MONITOR_SIGNALS = [
  "negative_stock",
  "qr_denial",
  "cross_tenant_denial",
  "migration_error",
  "stock_conflict",
  "legacy_material_fallback",
  "nullable_transition_column",
  "storage_signed_url_denial",
  "invoice_approval_conflict",
  "notification_scope_denial",
];

export const PHASE12_PRODUCTION_GATES = [
  "phase11_contract_green",
  "phase12_readiness_green",
  "unit_tests_green",
  "typecheck_green",
  "build_green",
  "empty_database_migration_smoke_green",
  "staging_copy_migration_smoke_green",
  "cross_tenant_suite_green",
  "pwa_material_suite_green",
  "qr_scan_suite_green",
  "storage_signed_url_suite_green",
  "billing_approval_suite_green",
  "audit_notification_suite_green",
  "rollback_plan_confirmed",
];

export const PHASE12_CANON_TERMS = [
  "legacy material fields",
  "historical fallback",
  "Overig",
  "nullable transition columns",
  "negative stock",
  "QR denials",
  "cross-tenant denials",
  "migration errors",
  "stock conflicts",
  "production rollout checklist",
  "staging-copy",
  "no staging reset",
];

export function buildPhase12ReadinessPlan() {
  const phase11 = buildPhase11HardeningPlan();

  return {
    marker: "fieldgrid-material-inventory-phase-12-production-readiness",
    phase: 12,
    title: "Material and inventory production readiness and canon closure",
    destructive: false,
    mutatesExistingTenants: false,
    keepsStagingReachable: true,
    dependsOn: [phase11.marker],
    requiredDocs: [
      "docs/research-material-inventory-management.md",
      "docs/plan-material-inventory-management.md",
      "docs/testmatrix-material-inventory-management.md",
      "docs/fieldgrid-material-inventory-phase11-hardening.md",
      "docs/fieldgrid-material-inventory-production-readiness.md",
    ],
    requiredScripts: [
      "scripts/fieldgrid-material-inventory-phase11-hardening.mjs",
      "scripts/fieldgrid-material-inventory-phase12-readiness.mjs",
    ],
    commands: [
      "pnpm run fieldgrid:material-inventory-phase11:check",
      "pnpm run fieldgrid:material-inventory-phase12:check",
      "pnpm test",
      "pnpm run typecheck",
      "pnpm run build",
    ],
    closureRules: [
      {
        id: "MI12-LEGACY-001",
        area: "legacy material fields",
        rule:
          "Legacy material fields may not be used for new runtime decisions and remain available only as historical fallback.",
      },
      {
        id: "MI12-LEGACY-002",
        area: "free text material usage",
        rule: "Old free-text flows must be represented as Overig in the new material usage model.",
      },
      {
        id: "MI12-HARDEN-001",
        area: "nullable transition columns",
        rule:
          "Nullable tenant, approval, storage and audit transition columns must be validated on staging-copy before NOT NULL or stricter constraints are promoted.",
      },
      {
        id: "MI12-MONITOR-001",
        area: "monitoring",
        rule:
          "Production rollout requires monitoring for negative stock, QR denials, cross-tenant denials, migration errors and stock conflicts.",
      },
      {
        id: "MI12-ROLLOUT-001",
        area: "rollout",
        rule:
          "Production rollout must keep staging reachable, preserve staging data and include a rollback plan before manual promotion.",
      },
    ],
    monitorSignals: PHASE12_MONITOR_SIGNALS.map((signal) => ({
      signal,
      required: true,
      owner: "platform operations",
      action: "alert and investigate before promotion if active after staging smoke",
    })),
    productionGates: PHASE12_PRODUCTION_GATES,
    finalAcceptance: [
      "materials module complete",
      "inventory module complete",
      "tenant isolation proven for demo-a, demo-b and veele",
      "material code M00001 contract preserved",
      "inventory code I000001 contract preserved",
      "management approval supports zero and custom pricing",
      "customer_visible controls customer exposure",
      "storage, audit and notifications are tenant-bound",
      "migration smokes passed on empty-db and staging-copy",
      "canon and testmatrix are current",
    ],
  };
}

export function validatePhase12ReadinessPlan(
  plan = buildPhase12ReadinessPlan(),
  { root = process.cwd() } = {},
) {
  const errors = [];
  const phase11Validation = validatePhase11HardeningPlan(buildPhase11HardeningPlan(), { root });

  if (!phase11Validation.ok) {
    errors.push(...phase11Validation.errors.map((error) => `Phase 11 dependency: ${error}`));
  }

  if (plan.destructive || plan.mutatesExistingTenants) {
    errors.push("Phase 12 must stay non-destructive and must not mutate existing tenants.");
  }

  for (const docPath of plan.requiredDocs) {
    const absolutePath = resolve(root, docPath);
    if (!existsSync(absolutePath)) {
      errors.push(`Missing required document: ${docPath}`);
      continue;
    }

    if (docPath.endsWith("production-readiness.md")) {
      const content = readFileSync(absolutePath, "utf8");
      for (const term of PHASE12_CANON_TERMS) {
        if (!content.includes(term)) {
          errors.push(`Production readiness doc must include: ${term}`);
        }
      }
    }
  }

  for (const scriptPath of plan.requiredScripts) {
    if (!existsSync(resolve(root, scriptPath))) {
      errors.push(`Missing required script: ${scriptPath}`);
    }
  }

  for (const signal of PHASE12_MONITOR_SIGNALS) {
    if (!plan.monitorSignals.some((entry) => entry.signal === signal)) {
      errors.push(`Missing monitor signal: ${signal}`);
    }
  }

  for (const gate of PHASE12_PRODUCTION_GATES) {
    if (!plan.productionGates.includes(gate)) {
      errors.push(`Missing production gate: ${gate}`);
    }
  }

  for (const ruleId of [
    "MI12-LEGACY-001",
    "MI12-LEGACY-002",
    "MI12-HARDEN-001",
    "MI12-MONITOR-001",
    "MI12-ROLLOUT-001",
  ]) {
    if (!plan.closureRules.some((rule) => rule.id === ruleId)) {
      errors.push(`Missing closure rule: ${ruleId}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function printPlan(plan) {
  console.log(JSON.stringify(plan, null, 2));
}

function printCheck(result) {
  if (result.ok) {
    console.log("Fieldgrid material/inventory phase 12 production-readiness contract is valid.");
    return;
  }

  console.error("Fieldgrid material/inventory phase 12 production-readiness contract failed:");
  for (const error of result.errors) {
    console.error(`- ${error}`);
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
  const plan = buildPhase12ReadinessPlan();

  if (process.argv.includes("--json")) {
    printPlan(plan);
  }

  if (process.argv.includes("--check")) {
    const result = validatePhase12ReadinessPlan(plan);
    printCheck(result);
    process.exitCode = result.ok ? 0 : 1;
  }

  if (!process.argv.includes("--json") && !process.argv.includes("--check")) {
    console.log("Fieldgrid material/inventory phase 12 production-readiness plan");
    console.log(`Monitor signals: ${plan.monitorSignals.length}`);
    console.log(`Production gates: ${plan.productionGates.length}`);
    console.log("Run with --check before production promotion.");
  }
}
