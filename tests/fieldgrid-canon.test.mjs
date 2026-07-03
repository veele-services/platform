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
  "docs/fieldgrid-phase-1-testbasis.md",
  "docs/fieldgrid-phase-2-tenant-hardening.md",
];

const governanceDocs = [".github/pull_request_template.md"];

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

test("phase 0 canon refresh removes stale current PR 125 status", () => {
  const refreshedCanon = [
    read("docs/fieldgrid-saas-masterplan.md"),
    read("docs/fieldgrid-data-classification.md"),
    read("docs/fieldgrid-cross-tenant-testmatrix.md"),
  ].join("\n");

  assert.ok(!refreshedCanon.includes("t/m PR #125"), "canon should not describe PR #125 as the current status");
  assertContains(refreshedCanon, ["PR #149", "fase 0 canonrefresh"], "refreshed canon");
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
    ],
    "data classification",
  );

  assertContains(classification, ["P0", "P1", "P2"], "data classification");
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
    ],
    "data classification",
  );
});

test("data classification captures refreshed current backlog", () => {
  const classification = read("docs/fieldgrid-data-classification.md");

  assertContains(
    classification,
    [
      "Actuele stand",
      "module enforcement",
      "tenant-prefix",
      "integration",
      "Tenant A/B/Veele",
      "DEFAULT_TENANT_ID",
      "tenant_sector_settings",
    ],
    "data classification",
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
      "storage",
      "direct ID",
      "demo-a",
      "demo-b",
      "veele",
      "minimum green before staging",
    ],
    "cross-tenant matrix",
  );
});

test("cross-tenant matrix tracks required automation layers and status", () => {
  const matrix = read("docs/fieldgrid-cross-tenant-testmatrix.md");

  assertContains(
    matrix,
    [
      "Automatiseringsstatus",
      "Teststatus per securitygrens",
      "Fase 0 status",
      "Tenant A/B/Veele",
      "static",
      "Playwright",
      "DB/RLS",
      "storage",
      "migration",
    ],
    "cross-tenant matrix",
  );
});

test("masterplan captures the current SaaS backlog", () => {
  const masterplan = read("docs/fieldgrid-saas-masterplan.md");

  assertContains(
    masterplan,
    [
      "API module guards",
      "Portal module guards",
      "DEFAULT_TENANT_ID",
      "tenant_sector_settings",
      "tenant_id",
      "Echte verbeteringen",
      "Nice-to-have",
      "Tenant A/B/Veele",
      "nullable",
      "Assignment media blijft P1",
    ],
    "masterplan",
  );
});

test("masterplan captures the next major update phase plan", () => {
  const masterplan = read("docs/fieldgrid-saas-masterplan.md");

  assertContains(
    masterplan,
    [
      "Faseplanning vanaf nu",
      "Fase 0 - Canon en updatecontract vastzetten",
      "Fase 1 - Echte testbasis en demo-data",
      "Fase 2 - Post-migration hardening en tenant_id afdwingen",
      "Fase 3 - Assignment media, news en storage bewijs",
      "Fase 4 - Module enforcement harmoniseren",
      "Fase 5 - Support break-glass en security dashboard",
      "Fase 6 - Productisering: onboarding, first-run, usage en branding",
      "Fase 7 - Staging smoke dashboard en operationele acceptatie",
    ],
    "masterplan",
  );
});

test("next major update plan captures remaining hardening and staging safety", () => {
  const plan = read("docs/fieldgrid-next-major-update-plan.md");

  assertContains(
    plan,
    [
      "volgende grote update",
      "staging zoveel mogelijk bereikbaar",
      "Canon refresh",
      "Tests zijn nog te statisch",
      "Directe tenant_id is vaak nog nullable",
      "Assignment media blijft P1",
      "News scope is nog open",
      "Backoffice module mapping is smaller dan API",
      "DEFAULT_TENANT_ID",
      "Support break-glass TTL",
      "Usage dashboard is incompleet",
      "Storage is applicatie-hard",
      "Platform-admin onboarding wizard",
      "Tenant first-run wizard",
      "Staging smoke dashboard",
    ],
    "next major update plan",
  );
});

test("next major update plan defines phased execution", () => {
  const plan = read("docs/fieldgrid-next-major-update-plan.md");

  assertContains(
    plan,
    [
      "Fase 0 - Canon en updatecontract vastzetten",
      "Fase 1 - Echte testbasis en demo-data",
      "Fase 2 - Post-migration hardening en tenant_id afdwingen",
      "Fase 3 - Assignment media, news en storage bewijs",
      "Fase 4 - Module enforcement harmoniseren",
      "Fase 5 - Support break-glass en security dashboard",
      "Fase 6 - Productisering: onboarding, first-run, usage en branding",
      "Fase 7 - Staging smoke dashboard en operationele acceptatie",
      "Aanbevolen PR-volgorde",
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

test("phase docs capture executable follow-up contracts", () => {
  const phase1 = read("docs/fieldgrid-phase-1-testbasis.md");
  const phase2 = read("docs/fieldgrid-phase-2-tenant-hardening.md");

  assertContains(phase1, ["Tenant A/B/Veele", "demo-data", "FG-MIG-001"], "phase 1 docs");
  assertContains(phase2, ["fase 2 post-migration hardening", "staging-copy", "tenant-hardening-report", "audit_log"], "phase 2 docs");
});

test("pull request template enforces Fieldgrid canon discipline", () => {
  const template = read(".github/pull_request_template.md");

  assertContains(
    template,
    [
      "Fieldgrid canon-impact",
      "docs/fieldgrid-next-major-update-plan.md",
      "docs/fieldgrid-data-classification.md",
      "docs/fieldgrid-cross-tenant-testmatrix.md",
      "docs/fieldgrid-staging-promotion-checklist.md",
      "Geraakte test-id's",
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
