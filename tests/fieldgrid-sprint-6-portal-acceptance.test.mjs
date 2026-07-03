import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import {
  SPRINT6_REQUIRED_FLOW_IDS,
  SPRINT6_REQUIRED_SURFACES,
  buildSprint6PortalAcceptanceManifest,
  runSprint6PortalAcceptanceCases,
  validateSprint6PortalAcceptance,
} from "./fixtures/fieldgrid-sprint-6-portal-acceptance.mjs";

function casesFor(surface, mode) {
  return runSprint6PortalAcceptanceCases().filter(
    (result) => result.surface === surface && result.mode === mode,
  );
}

test("sprint 6 portal acceptance cases all pass", () => {
  const errors = validateSprint6PortalAcceptance();
  assert.deepEqual(errors, []);

  const results = runSprint6PortalAcceptanceCases();
  assert.ok(results.length >= 12, "portal acceptance should include all required portal flows");
  assert.ok(results.every((result) => result.passed), "all portal acceptance cases should pass");
});

test("sprint 6 covers happy and denial paths for each portal surface", () => {
  for (const surface of SPRINT6_REQUIRED_SURFACES) {
    assert.ok(casesFor(surface, "happy").length >= 1, `${surface} should have a happy path`);
    assert.ok(casesFor(surface, "denial").length >= 1, `${surface} should have a denial path`);
  }
});

test("sprint 6 includes every required cross-tenant matrix flow", () => {
  const manifest = buildSprint6PortalAcceptanceManifest();
  const ids = new Set(manifest.cases.map((testCase) => testCase.testId));

  for (const flowId of SPRINT6_REQUIRED_FLOW_IDS) {
    assert.ok(ids.has(flowId), `${flowId} should be represented in sprint 6`);
  }
});

test("sprint 6 customer portal covers documents, invoices, reports, tickets, wrong host and module denial", () => {
  const manifest = buildSprint6PortalAcceptanceManifest();
  const customerEntities = manifest.portalEntities.filter((entity) => entity.surface === "customer-portal");
  const types = new Set(customerEntities.map((entity) => entity.entityType));

  for (const type of ["document", "invoice", "report", "ticket"]) {
    assert.ok(types.has(type), `customer portal should include ${type}`);
  }

  const results = runSprint6PortalAcceptanceCases();
  assert.equal(results.find((result) => result.testId === "FG-PORTAL-C-002")?.passed, true);
  assert.equal(results.find((result) => result.testId === "FG-PORTAL-C-003")?.passed, true);
  assert.equal(results.find((result) => result.testId === "FG-PORTAL-C-004")?.passed, true);
});

test("sprint 6 personnel app covers assignments, media, notifications, wrong host, module denial and planning freshness", () => {
  const manifest = buildSprint6PortalAcceptanceManifest();
  const personnelEntities = manifest.portalEntities.filter((entity) => entity.surface === "personnel-app");
  const types = new Set(personnelEntities.map((entity) => entity.entityType));

  for (const type of ["assignment", "assignment_media", "notification"]) {
    assert.ok(types.has(type), `personnel app should include ${type}`);
  }

  const results = runSprint6PortalAcceptanceCases();
  for (const testId of ["FG-PORTAL-P-002", "FG-PORTAL-P-003", "FG-PORTAL-P-004", "FG-PORTAL-P-005", "FG-PORTAL-P-005B"]) {
    assert.equal(results.find((result) => result.testId === testId)?.passed, true, `${testId} should pass`);
  }
});

test("sprint 6 cases are promotable to Playwright", () => {
  for (const result of runSprint6PortalAcceptanceCases()) {
    assert.ok(result.futureTestType.includes("Playwright"), `${result.testId} should be marked Playwright-promotable`);
  }
});

test("sprint 6 runner validates from the command line", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/fieldgrid-sprint6-portal-acceptance.mjs", "--check"],
    { encoding: "utf8" },
  );

  assert.match(output, /portal acceptance is valid/);
});
