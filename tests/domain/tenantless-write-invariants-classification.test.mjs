import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = process.cwd();
const allowedClassifications = new Set([
  "tenant-required",
  "platform-global",
  "hybrid",
  "parent-bound",
]);

function loadClassification() {
  return JSON.parse(
    readFileSync(join(repoRoot, "docs/testing/tenantless-write-invariants.json"), "utf8"),
  );
}

test("tenantless write invariant allowlist is explicit and classified", () => {
  const manifest = loadClassification();
  assert.equal(manifest.version, "fieldgrid-tenantless-write-invariants-v1");
  assert.ok(manifest.tables && typeof manifest.tables === "object");

  for (const [table, entry] of Object.entries(manifest.tables)) {
    assert.match(table, /^[a-z0-9_]+$/u);
    assert.ok(allowedClassifications.has(entry.classification), `${table} has invalid classification`);
    assert.ok(entry.reason && entry.reason.length > 20, `${table} must document why tenantless rows are handled safely`);
    if (entry.classification === "parent-bound") {
      assert.ok(entry.parent, `${table} must name the parent table that supplies tenant scope`);
    }
  }
});

test("known nullable tenant_id buckets are not collapsed into a generic nullable allow", () => {
  const { tables } = loadClassification();

  assert.equal(tables.assignment_personnel, undefined, "assignment_personnel remains parent-bound without tenant_id, not a nullable tenant_id table");
  assert.equal(tables.documents.classification, "tenant-required");
  assert.equal(tables.reports.classification, "tenant-required");
  assert.equal(tables.customer_types.classification, "platform-global");
  assert.equal(tables.audit_log.classification, "hybrid");
  assert.equal(tables.kb_article_media.classification, "parent-bound");
});
