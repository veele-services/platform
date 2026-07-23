import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("legacy validation workflows are manual while exact-head remains authoritative", () => {
  const exact = read(".github/workflows/main-exact-head-validation.yml");

  for (const path of [
    ".github/workflows/fieldgrid-deploy-health-gate.yml",
    ".github/workflows/runtime-entrypoint-inventory.yml",
    ".github/workflows/runtime-safety-harness.yml",
  ]) {
    const workflow = read(path);
    assert.match(workflow, /workflow_dispatch:/u, path);
    assert.doesNotMatch(workflow, /\bpull_request:/u, path);
  }

  for (const marker of [
    "pnpm fieldgrid:test:contract-static",
    "pnpm fieldgrid:test:unit-domain",
    "pnpm fieldgrid:test:security-source",
    "pnpm fieldgrid:runtime-entrypoints:check",
    "pnpm fieldgrid:deploy-health-gate:test",
    "pnpm fieldgrid:test:baseline-differential",
    "name: Main exact-head gate",
  ]) {
    assert.match(
      exact,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
    );
  }
});

test("deploy-health does not repeat authoritative static lanes", () => {
  const exact = read(".github/workflows/main-exact-head-validation.yml");
  const deployHealth = exact.slice(
    exact.indexOf("  deploy-health:"),
    exact.indexOf("  fieldgrid-playwright:"),
  );

  assert.match(deployHealth, /pnpm fieldgrid:deploy-health-gate:test/u);
  assert.match(deployHealth, /pnpm fieldgrid:test:baseline-differential/u);
  assert.doesNotMatch(deployHealth, /migration-order-check/u);
  assert.doesNotMatch(deployHealth, /fieldgrid:test-layers/u);
  assert.doesNotMatch(deployHealth, /pnpm run typecheck/u);
});
