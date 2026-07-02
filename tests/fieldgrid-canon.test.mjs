import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
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

  for (const strategy of [
    "direct_tenant_id",
    "parent_scoped",
    "global_template",
    "platform_only",
    "tenant_config",
    "needs_migration",
  ]) {
    assert.match(classification, new RegExp(`\\b${strategy}\\b`, "u"));
  }

  for (const priority of ["P0", "P1", "P2"]) {
    assert.match(classification, new RegExp(`\\b${priority}\\b`, "u"));
  }
});

test("data classification keeps known sensitive SaaS rest points explicit", () => {
  const classification = read("docs/fieldgrid-data-classification.md");

  for (const restPoint of [
    "documents",
    "invoices",
    "quotes",
    "reports",
    "payments",
    "customer_payment_batches",
    "assignment_photos",
    "assignment_report_note_attachments",
    "audit_log",
  ]) {
    assert.match(classification, new RegExp(restPoint, "u"));
  }
});

test("cross-tenant matrix covers required security boundaries", () => {
  const matrix = read("docs/fieldgrid-cross-tenant-testmatrix.md");

  for (const phrase of [
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
  ]) {
    assert.match(matrix, new RegExp(phrase, "iu"));
  }
});

test("masterplan and recovery docs point to the canon sources", () => {
  const masterplan = read("docs/fieldgrid-saas-masterplan.md");
  const recoveryPlan = read("docs/fieldgrid-recovery-execution-plan.md");
  const combined = `${masterplan}\n${recoveryPlan}`;

  for (const path of [
    "docs/fieldgrid-saas-masterplan.md",
    "docs/fieldgrid-data-classification.md",
    "docs/fieldgrid-cross-tenant-testmatrix.md",
  ]) {
    assert.match(combined, new RegExp(path.replaceAll("/", "\\/"), "u"));
  }
});
