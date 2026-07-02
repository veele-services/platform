import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.match(content, new RegExp(escapeRegExp(phrase), "iu"), `${label} should mention ${phrase}`);
  }
}

const canonicalDocs = [
  "docs/fieldgrid-saas-masterplan.md",
  "docs/fieldgrid-data-classification.md",
  "docs/fieldgrid-cross-tenant-testmatrix.md",
  "docs/fieldgrid-recovery-execution-plan.md",
];

test("Fieldgrid canon docs exist", () => {
  for (const path of canonicalDocs) {
    assert.ok(read(path).trim().length > 0, `${path} should not be empty`);
  }
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

test("data classification keeps known sensitive SaaS rest points explicit", () => {
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
    ],
    "data classification",
  );
});

test("data classification captures refreshed current backlog", () => {
  const classification = read("docs/fieldgrid-data-classification.md");

  assertContains(
    classification,
    ["Actuele stand", "module-aware", "tenant-prefix", "integration", "Tenant A/B/Veele"],
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

test("cross-tenant matrix tracks required automation layers", () => {
  const matrix = read("docs/fieldgrid-cross-tenant-testmatrix.md");

  assertContains(
    matrix,
    ["Automatiseringsstatus", "Tenant A/B/Veele", "static", "Playwright", "DB/RLS", "storage"],
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
    ],
    "masterplan",
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
