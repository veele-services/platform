import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  assertNoNativeIgnores,
  evaluateAudit,
  evaluateSignatures,
} from "../../scripts/fieldgrid-dependency-security.mjs";

function auditFixture({ severity = "moderate", dev = false, optional = false } = {}) {
  return {
    advisories: {
      1: {
        github_advisory_id: "GHSA-test-test-test",
        module_name: "example-package",
        severity,
        patched_versions: ">=2.0.0",
        url: "https://github.com/advisories/GHSA-test-test-test",
        findings: [{ version: "1.0.0", paths: ["workspace>example-package"], dev, optional }],
      },
    },
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical: 0 } },
  };
}

test("production and optional moderate findings block", () => {
  assert.equal(evaluateAudit(auditFixture()).passed, false);
  assert.equal(evaluateAudit(auditFixture({ optional: true })).passed, false);
});

test("development moderate reports but does not block", () => {
  const result = evaluateAudit(auditFixture({ dev: true }));
  assert.equal(result.passed, true);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].blocking, false);
});

test("development high and every critical finding block", () => {
  assert.equal(evaluateAudit(auditFixture({ severity: "high", dev: true })).passed, false);
  assert.equal(evaluateAudit(auditFixture({ severity: "critical", dev: true })).passed, false);
});

test("malformed audit evidence fails closed", () => {
  assert.throws(() => evaluateAudit({}), /malformed/u);
  const malformed = auditFixture();
  delete malformed.advisories[1].github_advisory_id;
  assert.throws(() => evaluateAudit(malformed), /missing required fields/u);
});

test("registry signature evidence must be complete and exact", () => {
  assert.equal(evaluateSignatures({ audited: 5, verified: 5, invalid: [], missing: [] }).passed, true);
  assert.equal(evaluateSignatures({ audited: 5, verified: 4, invalid: [], missing: [] }).passed, false);
  assert.equal(evaluateSignatures({ audited: 5, verified: 5, invalid: ["x"], missing: [] }).passed, false);
  assert.throws(() => evaluateSignatures({}), /malformed/u);
});

test("native pnpm audit ignores are forbidden and repository contract is explicit", () => {
  assert.doesNotThrow(() => assertNoNativeIgnores("minimumReleaseAge: 1440"));
  assert.throws(() => assertNoNativeIgnores("ignoreGhsas: [GHSA-x]"), /Forbidden fail-open/u);
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(typeof packageJson.scripts["fieldgrid:dependency-security:audit"], "string");
  assert.equal(typeof packageJson.scripts["fieldgrid:dependency-security:check"], "string");
});
