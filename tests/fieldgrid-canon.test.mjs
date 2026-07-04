import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  const normalized = content.toLowerCase();

  for (const phrase of phrases) {
    assert.ok(normalized.includes(phrase.toLowerCase()), `${label} should mention ${phrase}`);
  }
}

const canonicalDocs = [
  "docs/fieldgrid-saas-masterplan.md",
  "docs/fieldgrid-data-classification.md",
  "docs/fieldgrid-cross-tenant-testmatrix.md",
  "docs/fieldgrid-recovery-execution-plan.md",
  "docs/fieldgrid-next-major-update-plan.md",
  "docs/fieldgrid-staging-promotion-checklist.md",
  "docs/fieldgrid-saas-proof-sprint-plan.md",
  "docs/fieldgrid-sprint-7-migration-smoke.md",
  "docs/fieldgrid-sprint-10-audit-security.md",
  "docs/fieldgrid-phase-1-testbasis.md",
  "docs/fieldgrid-phase-2-tenant-hardening.md",
  "docs/fieldgrid-phase-3-storage-media-news.md",
  "docs/fieldgrid-phase-4-module-enforcement.md",
  "docs/fieldgrid-phase-5-support-security.md",
  "docs/fieldgrid-phase-6-productization.md",
  "docs/fieldgrid-sprint-13-tenant-first-run.md",
];

const governanceDocs = [".github/pull_request_template.md"];
const statusTerms = ["done", "partial", "runtime-proof-open", "hardening-open", "nice-to-have"];

test("Fieldgrid canon docs exist", () => {
  for (const path of canonicalDocs) {
    assert.ok(read(path).trim().length > 0, `${path} should not be empty`);
  }
});

test("Fieldgrid governance docs exist", () => {
  for (const path of governanceDocs) {
    assert.ok(read(path).trim().length > 0, `${path} should not be empty`);
  }
});

test("sprint 0 canon refresh removes stale current PR 125 status", () => {
  const refreshedCanon = [
    read("docs/fieldgrid-saas-masterplan.md"),
    read("docs/fieldgrid-data-classification.md"),
    read("docs/fieldgrid-cross-tenant-testmatrix.md"),
    read("docs/fieldgrid-next-major-update-plan.md"),
  ].join("\n");

  assert.ok(!refreshedCanon.includes("t/m PR #125"), "canon should not describe PR #125 as the current status");
  assertContains(refreshedCanon, ["sprint 0 canon refresh 2.0", "docs/fieldgrid-saas-proof-sprint-plan.md"], "refreshed canon");
});

test("canon uses the sprint 0 status taxonomy", () => {
  const combined = [
    read("docs/fieldgrid-saas-masterplan.md"),
    read("docs/fieldgrid-data-classification.md"),
    read("docs/fieldgrid-cross-tenant-testmatrix.md"),
    read("docs/fieldgrid-saas-proof-sprint-plan.md"),
  ].join("\n");

  assertContains(combined, statusTerms, "canon status taxonomy");
});

test("data classification contains canonical tenant strategies and priorities", () => {
  const classification = read("docs/fieldgrid-data-classification.md");

  assertContains(
    classification,
    [
      "direct_tenant_id",
      "parent_scoped",
      "global_template",
      "platform_only",
      "tenant_config",
      "needs_migration",
      "P0",
      "P1",
      "P2",
    ],
    "data classification",
  );
});

test("data classification keeps sensitive SaaS hardening points explicit", () => {
  const classification = read("docs/fieldgrid-data-classification.md");

  assertContains(
    classification,
    [
      "documents",
      "invoices",
      "quotes",
      "reports",
      "payments",
      "customer_payment_batches",
      "assignment_photos",
      "assignment_report_note_attachments",
      "audit_log",
      "nullable",
      "hardening",
      "DEFAULT_TENANT_ID",
    ],
    "data classification",
  );
});

test("data classification captures tenant regions as tenant config", () => {
  const classification = read("docs/fieldgrid-data-classification.md");

  assertContains(
    classification,
    [
      "Tenant regions",
      "tenant_regions",
      "personnel_regions",
      "object_regions",
      "assignment_required_regions",
      "tenant_config",
      "FG-REGION",
      "legacy `personnel.region`",
      "preferred_regions",
      "required_region",
    ],
    "data classification region canon",
  );
});

test("cross-tenant matrix covers required security boundaries", () => {
  const matrix = read("docs/fieldgrid-cross-tenant-testmatrix.md");

  assertContains(
    matrix,
    [
      "host-first",
      "RBAC",
      "support",
      "module",
      "sector",
      "regio",
      "storage",
      "direct-ID",
      "demo-a",
      "demo-b",
      "veele",
      "minimum green before staging",
    ],
    "cross-tenant matrix",
  );
});

test("cross-tenant matrix includes region proof scenarios", () => {
  const matrix = read("docs/fieldgrid-cross-tenant-testmatrix.md");

  assertContains(
    matrix,
    [
      "FG-REGION-001",
      "FG-REGION-002",
      "FG-REGION-003",
      "FG-REGION-004",
      "FG-REGION-005",
      "FG-REGION-006",
      "FG-REGION-007",
      "FG-REGION-008",
      "multiselect",
      "autocomplete",
      "planning overlap",
    ],
    "cross-tenant matrix region tests",
  );
});

test("masterplan captures the sprint 0 SaaS backlog", () => {
  const masterplan = read("docs/fieldgrid-saas-masterplan.md");

  assertContains(
    masterplan,
    [
      "API module guards",
      "Portal module guards",
      "DEFAULT_TENANT_ID",
      "tenant_id",
      "Tenant A/B/Veele",
      "nullable",
      "assignment_photos",
      "assignment_report_note_attachments",
      "Veele Portaal",
      "Staging-promotiecontract",
      "Definition of Done",
    ],
    "masterplan",
  );
});

test("masterplan captures tenant region canon", () => {
  const masterplan = read("docs/fieldgrid-saas-masterplan.md");

  assertContains(
    masterplan,
    [
      "Regio-canon",
      "tenant_regions",
      "Personeelslid aanmaken/bewerken",
      "Object aanmaken/bewerken",
      "Opdracht aanmaken/bewerken",
      "multiselect",
      "autocomplete",
      "planning",
      "requireAllowedRegion",
    ],
    "masterplan region canon",
  );
});

test("sprint plan defines complete execution through final gate", () => {
  const sprintPlan = read("docs/fieldgrid-saas-proof-sprint-plan.md");

  assertContains(
    sprintPlan,
    [
      "Sprint 0 - Canon refresh 2.0",
      "Sprint 1 - Tenant A/B/Veele runtime fixtures",
      "Sprint 2 - Regio datamodel en backfill",
      "Sprint 3 - Regio UI backoffice breed",
      "Sprint 4 - Regio runtime en planninglogica",
      "Sprint 5 - Runtime security proof suite",
      "Sprint 6 - Playwright host en portal acceptance",
      "Sprint 7 - Migration smoke workflow",
      "Sprint 8 - Tenant-id hardening wave",
      "Sprint 9 - Storage hardening",
      "Sprint 10 - Audit en security dashboard 2.0",
      "Sprint 11 - Module enforcement harmonisatie",
      "Sprint 12 - Platform onboarding wizard",
      "Sprint 13 - Tenant first-run wizard",
      "Sprint 14 - Usage, branding en operational readiness",
      "Sprint 15 - Staging smoke dashboard",
      "Sprint 16 - Final hardening en externe tenant gate",
    ],
    "sprint plan",
  );
});

test("sprint 7 migration smoke canon is executable and staging-safe", () => {
  const sprint7 = read("docs/fieldgrid-sprint-7-migration-smoke.md");
  const packageJson = read("package.json");
  const workflow = read(".github/workflows/fieldgrid-migration-smoke.yml");

  assertContains(
    `${sprint7}\n${packageJson}\n${workflow}`,
    [
      "fieldgrid:sprint7-migration-smoke:check",
      "fieldgrid:sprint7-migration-smoke --run --target empty-database",
      "fieldgrid:sprint7-migration-smoke --run --target staging-copy",
      "FG-MIG-001",
      "FG-MIG-002",
      "FG-MIG-003",
      "staging-copy",
      "geen database gemigreerd",
    ],
    "sprint 7 migration smoke canon",
  );
});

test("next major update plan points to the sprint canon", () => {
  const plan = read("docs/fieldgrid-next-major-update-plan.md");

  assertContains(
    plan,
    [
      "docs/fieldgrid-saas-proof-sprint-plan.md",
      "Tests zijn nog te statisch",
      "Tenant-id hardening is nog niet definitief",
      "Storage is nog niet volledig bewezen",
      "Veele Portaal",
      "Audit moet scherper worden",
      "Platform onboarding",
      "Tenant first-run",
      "Staging smoke",
      "Regio's in backoffice",
      "Sprintvolgorde",
      "Definitie van klaar",
    ],
    "next major update plan",
  );
});

test("staging promotion checklist defines phase-safe promotion rules", () => {
  const checklist = read("docs/fieldgrid-staging-promotion-checklist.md");

  assertContains(
    checklist,
    [
      "staging zoveel mogelijk bereikbaar",
      "Geen drop, reset of rebuild",
      "Fase 0 - Canon en updatecontract",
      "Fase 1 - Echte testbasis en demo-data",
      "Fase 2 - Post-migration hardening en tenant_id afdwingen",
      "Fase 3 - Assignment media, news en storage bewijs",
      "Fase 4 - Module enforcement harmoniseren",
      "Fase 5 - Support break-glass en security dashboard",
      "Fase 6 - Productisering",
      "Fase 7 - Staging smoke dashboard en operatie",
    ],
    "staging promotion checklist",
  );
});

test("pull request template enforces Fieldgrid canon discipline", () => {
  const template = read(".github/pull_request_template.md");

  assertContains(
    template,
    [
      "Fieldgrid canon-impact",
      "docs/fieldgrid-next-major-update-plan.md",
      "docs/fieldgrid-saas-proof-sprint-plan.md",
      "docs/fieldgrid-data-classification.md",
      "docs/fieldgrid-cross-tenant-testmatrix.md",
      "docs/fieldgrid-staging-promotion-checklist.md",
      "Geraakte test-id's",
      "fieldgrid:sprint7-migration-smoke:check",
      "Staging-data blijft behouden",
      "Minimum green before staging",
      "staging blijft zoveel mogelijk bereikbaar",
    ],
    "pull request template",
  );
});

test("masterplan and recovery docs point to the canon sources", () => {
  const masterplan = read("docs/fieldgrid-saas-masterplan.md");
  const recoveryPlan = read("docs/fieldgrid-recovery-execution-plan.md");
  const combined = `${masterplan}\n${recoveryPlan}`;

  assertContains(
    combined,
    [
      "docs/fieldgrid-saas-masterplan.md",
      "docs/fieldgrid-data-classification.md",
      "docs/fieldgrid-cross-tenant-testmatrix.md",
    ],
    "masterplan/recovery docs",
  );
});
