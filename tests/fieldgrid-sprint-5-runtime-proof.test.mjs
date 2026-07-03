import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import {
  SPRINT5_REQUIRED_BOUNDARIES,
  buildSprint5RuntimeProofManifest,
  runSprint5RuntimeProofCases,
  validateSprint5RuntimeProof,
} from "./fixtures/fieldgrid-sprint-5-runtime-proof.mjs";

function casesFor(boundary, mode) {
  return runSprint5RuntimeProofCases().filter(
    (result) => result.boundary === boundary && result.mode === mode,
  );
}

test("sprint 5 runtime proof cases all pass", () => {
  const errors = validateSprint5RuntimeProof();
  assert.deepEqual(errors, []);

  const results = runSprint5RuntimeProofCases();
  assert.ok(results.length >= 20, "runtime proof should include broad security coverage");
  assert.ok(results.every((result) => result.passed), "all runtime proof cases should pass");
});

test("sprint 5 covers happy and denial paths for each required security boundary", () => {
  for (const boundary of SPRINT5_REQUIRED_BOUNDARIES) {
    assert.ok(casesFor(boundary, "happy").length >= 1, `${boundary} should have a happy path`);
    assert.ok(casesFor(boundary, "denial").length >= 1, `${boundary} should have a denial path`);
  }
});

test("sprint 5 cases include API and backoffice entrypoints where runtime boundaries need both", () => {
  const dualEntrypointBoundaries = new Set([
    "host",
    "membership",
    "rbac",
    "support",
    "module",
    "sector",
    "region",
    "direct-id",
  ]);

  for (const result of runSprint5RuntimeProofCases()) {
    assert.ok(result.entrypoints.includes("api"), `${result.testId} should cover API`);
    if (dualEntrypointBoundaries.has(result.boundary)) {
      assert.ok(result.entrypoints.includes("backoffice"), `${result.testId} should cover backoffice`);
    }
  }
});

test("sprint 5 proves Veele is an ordinary tenant and host beats switcher", () => {
  const manifest = buildSprint5RuntimeProofManifest();
  const veele = manifest.tenants.find((tenant) => tenant.slug === "veele");
  const hostSwitcher = manifest.results.find((result) => result.testId === "FG-HOST-004");
  const veeleOrdinary = manifest.results.find((result) => result.testId === "FG-LIFE-004");

  assert.equal(veele?.platformException, false);
  assert.equal(hostSwitcher?.passed, true);
  assert.equal(veeleOrdinary?.passed, true);
});

test("sprint 5 proves core cross-tenant denials", () => {
  const results = runSprint5RuntimeProofCases();
  const requiredDenials = [
    "FG-DATA-001B",
    "FG-STORAGE-002",
    "FG-SUPPORT-004",
    "FG-MODULE-005",
    "FG-SECTOR-002",
    "FG-REGION-002",
  ];

  for (const testId of requiredDenials) {
    const result = results.find((candidate) => candidate.testId === testId);
    assert.equal(result?.mode, "denial", `${testId} should be a denial case`);
    assert.equal(result?.passed, true, `${testId} should pass`);
  }
});

test("sprint 5 runner validates from the command line", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/fieldgrid-sprint5-runtime-proof.mjs", "--check"],
    { encoding: "utf8" },
  );

  assert.match(output, /runtime security proof is valid/);
});
