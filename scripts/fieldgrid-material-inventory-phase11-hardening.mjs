import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMaterialInventoryPhase11Fixtures,
  validateMaterialInventoryPhase11Fixtures,
} from "../tests/fixtures/fieldgrid-material-inventory-phase11-fixtures.mjs";

export const REQUIRED_PHASE11_SCENARIOS = [
  "MI-HOST-001",
  "MI-RBAC-001",
  "MI-MATERIAL-001",
  "MI-MATERIAL-002",
  "MI-INVENTORY-001",
  "MI-INVENTORY-002",
  "MI-QR-001",
  "MI-QR-002",
  "MI-STORAGE-001",
  "MI-STORAGE-002",
  "MI-BILLING-001",
  "MI-BILLING-002",
  "MI-AUDIT-001",
  "MI-NOTIFY-001",
  "MI-MIG-EMPTY",
  "MI-MIG-STAGING-COPY",
];

export function buildPhase11HardeningPlan() {
  const fixtures = buildMaterialInventoryPhase11Fixtures();

  return {
    marker: "fieldgrid-material-inventory-phase-11-hardening",
    phase: 11,
    title: "Material and inventory hardening, fixtures, tests and staging rollout basis",
    destructive: false,
    mutatesExistingTenants: false,
    keepsStagingReachable: true,
    tenants: fixtures.tenants.map((tenant) => tenant.slug),
    requiredDocs: [
      "docs/research-material-inventory-management.md",
      "docs/plan-material-inventory-management.md",
      "docs/testmatrix-material-inventory-management.md",
      "docs/fieldgrid-staging-promotion-checklist.md",
      "docs/fieldgrid-material-inventory-phase11-hardening.md",
    ],
    commands: [
      "pnpm run fieldgrid:material-inventory-phase11:check",
      "pnpm test",
      "pnpm run typecheck",
      "pnpm run build",
    ],
    migrationSmokes: [
      {
        id: "MI-MIG-EMPTY",
        target: "empty-db",
        command: "pnpm run db:migrate",
        requirement: "Run against a disposable empty database before staging promotion.",
      },
      {
        id: "MI-MIG-STAGING-COPY",
        target: "staging-copy",
        command: "pnpm run db:migrate",
        requirement: "Run against a recent staging-copy database before staging promotion.",
      },
    ],
    scenarioMatrix: [
      {
        id: "MI-HOST-001",
        boundary: "host",
        actor: "tenant user",
        action: "Open material and inventory routes on demo-a, demo-b and veele hosts.",
        expected: "Host-first tenant context wins and cannot be overridden by tenant switcher state.",
        futureTestType: "Playwright",
      },
      {
        id: "MI-RBAC-001",
        boundary: "rbac",
        actor: "tenant role",
        action: "Use material and inventory permissions across owner, admin, management, finance, planner, personnel and customer actors.",
        expected: "Only tenant roles with explicit permissions can view costs, approve usage, transfer stock or manage inventory.",
        futureTestType: "integration",
      },
      {
        id: "MI-MATERIAL-001",
        boundary: "entity_tenant",
        actor: "Tenant A planner",
        action: "Guess or fetch Tenant B material id and stock balance id.",
        expected: "Tenant B material, balance and movement data stays inaccessible.",
        futureTestType: "integration",
      },
      {
        id: "MI-MATERIAL-002",
        boundary: "personnel_pwa",
        actor: "personnel user",
        action: "Register material usage from object or personnel stock in the PWA.",
        expected: "Usage is saved tenant-scoped, stock decreases only when allowed, and cost fields stay hidden.",
        futureTestType: "Playwright",
      },
      {
        id: "MI-INVENTORY-001",
        boundary: "entity_tenant",
        actor: "Tenant A personnel",
        action: "Open or scan Tenant B inventory item I000001.",
        expected: "The item does not leak and the denial is tenant-audited.",
        futureTestType: "integration",
      },
      {
        id: "MI-INVENTORY-002",
        boundary: "billing_approval",
        actor: "management user",
        action: "Approve optional inventory rental or usage line from an assignment.",
        expected: "Line can remain zero, become billable, or stay internal per approval decision.",
        futureTestType: "integration",
      },
      {
        id: "MI-QR-001",
        boundary: "qr_scan",
        actor: "anonymous user",
        action: "Scan inventory QR code route for I000001.",
        expected: "No item data is exposed before login; redirect preserves intended route.",
        futureTestType: "Playwright",
      },
      {
        id: "MI-QR-002",
        boundary: "qr_scan",
        actor: "authorized personnel",
        action: "Scan own-tenant QR code and report an issue with media.",
        expected: "Issue is tenant-scoped, creates or links a ticket, stores media safely and writes audit log.",
        futureTestType: "Playwright",
      },
      {
        id: "MI-STORAGE-001",
        boundary: "storage",
        actor: "Tenant A user",
        action: "Guess Tenant B storage path for material image, inventory media or QR label.",
        expected: "Path guessing and direct URL access fail.",
        futureTestType: "storage",
      },
      {
        id: "MI-STORAGE-002",
        boundary: "storage",
        actor: "authorized tenant user",
        action: "Request signed URL for own-tenant material and inventory files.",
        expected: "Signed URL is tenant-bound, short-lived and audited when sensitive.",
        futureTestType: "storage",
      },
      {
        id: "MI-BILLING-001",
        boundary: "customer_visibility",
        actor: "customer user",
        action: "Open approved assignment report with material lines.",
        expected: "Only customer_visible material lines are shown, including zero-value approved lines.",
        futureTestType: "integration",
      },
      {
        id: "MI-BILLING-002",
        boundary: "billing_approval",
        actor: "finance user",
        action: "Create invoice proposal from approved material usage.",
        expected: "Only approved billable lines enter invoice proposal; internal usage remains excluded.",
        futureTestType: "integration",
      },
      {
        id: "MI-AUDIT-001",
        boundary: "audit_log",
        actor: "tenant admin",
        action: "Download QR labels, view sensitive files, approve usage and resolve inventory issue.",
        expected: "Tenant-aware audit events include actor, tenant, entity id and action.",
        futureTestType: "DB/RLS",
      },
      {
        id: "MI-NOTIFY-001",
        boundary: "notification_scope",
        actor: "tenant admin",
        action: "Trigger low stock, expired inspection and new issue notifications.",
        expected: "Notifications are tenant-scoped and cannot leak to other tenants.",
        futureTestType: "integration",
      },
      {
        id: "MI-MIG-EMPTY",
        boundary: "migration",
        actor: "release operator",
        action: "Run migrations on empty database.",
        expected: "Migrations complete without destructive reset.",
        futureTestType: "migration smoke",
      },
      {
        id: "MI-MIG-STAGING-COPY",
        boundary: "migration",
        actor: "release operator",
        action: "Run migrations on staging-copy database.",
        expected: "Existing tenant data remains usable after migration and backfill checks.",
        futureTestType: "migration smoke",
      },
    ],
    minimumGreenBeforeStaging: [
      "phase11 contract check",
      "unit/static tests",
      "typecheck",
      "build",
      "empty-db migration smoke",
      "staging-copy migration smoke",
      "cross-tenant integration suite",
      "host-first Playwright suite",
      "PWA material and QR suite",
      "storage signed URL suite",
      "billing approval suite",
    ],
  };
}

export function validatePhase11HardeningPlan(
  plan = buildPhase11HardeningPlan(),
  { root = process.cwd() } = {},
) {
  const errors = [];
  const fixtureValidation = validateMaterialInventoryPhase11Fixtures();
  const scenarioIds = plan.scenarioMatrix.map((scenario) => scenario.id);
  const migrationTargets = plan.migrationSmokes.map((smoke) => smoke.target);

  if (!fixtureValidation.ok) {
    errors.push(...fixtureValidation.errors);
  }

  if (plan.destructive || plan.mutatesExistingTenants) {
    errors.push("Phase 11 hardening plan must stay non-destructive.");
  }

  for (const scenarioId of REQUIRED_PHASE11_SCENARIOS) {
    if (!scenarioIds.includes(scenarioId)) {
      errors.push(`Missing phase 11 scenario: ${scenarioId}`);
    }
  }

  for (const target of ["empty-db", "staging-copy"]) {
    if (!migrationTargets.includes(target)) {
      errors.push(`Missing migration smoke target: ${target}`);
    }
  }

  for (const docPath of plan.requiredDocs) {
    const absolutePath = resolve(root, docPath);
    if (!existsSync(absolutePath)) {
      errors.push(`Missing required document: ${docPath}`);
      continue;
    }

    const content = readFileSync(absolutePath, "utf8");
    if (docPath.endsWith("phase11-hardening.md")) {
      for (const term of [
        "minimum green before staging",
        "staging-copy",
        "demo-a",
        "demo-b",
        "veele",
        "signed URL",
        "customer_visible",
      ]) {
        if (!content.includes(term)) {
          errors.push(`Phase 11 hardening doc must include: ${term}`);
        }
      }
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
    console.log("Fieldgrid material/inventory phase 11 contract is valid.");
    return;
  }

  console.error("Fieldgrid material/inventory phase 11 contract failed:");
  for (const error of result.errors) {
    console.error(`- ${error}`);
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
  const plan = buildPhase11HardeningPlan();

  if (process.argv.includes("--json")) {
    printPlan(plan);
  }

  if (process.argv.includes("--check")) {
    const result = validatePhase11HardeningPlan(plan);
    printCheck(result);
    process.exitCode = result.ok ? 0 : 1;
  }

  if (!process.argv.includes("--json") && !process.argv.includes("--check")) {
    console.log("Fieldgrid material/inventory phase 11 hardening plan");
    console.log(`Scenarios: ${plan.scenarioMatrix.length}`);
    console.log(`Migration smokes: ${plan.migrationSmokes.map((smoke) => smoke.target).join(", ")}`);
    console.log("Run with --check before staging promotion.");
  }
}
