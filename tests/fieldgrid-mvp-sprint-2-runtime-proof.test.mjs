import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  MVP_SPRINT2_RUNTIME_PROOF_VERSION,
  buildMvpSprint2RuntimeProofPlan,
  mvpSprint2RequiredGateIds,
  validateMvpSprint2RuntimeProofPlan,
} from "../scripts/fieldgrid-mvp-sprint2-runtime-proof.mjs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
  }
}

test("MVP Sprint 2 runtime proof defines the field-demo read-only gate", async () => {
  const plan = await buildMvpSprint2RuntimeProofPlan({
    env: {
      FIELDGRID_MVP_SPRINT2_MIGRATION_SMOKE_STATUS: "pass",
      FIELDGRID_MVP_SPRINT2_MIGRATION_SMOKE_URL:
        "https://github.com/veele-services/platform/actions/runs/28902141188",
      FIELDGRID_MVP_SPRINT2_STAGING_SMOKE_STATUS: "pass",
      FIELDGRID_MVP_SPRINT2_STAGING_SMOKE_URL:
        "https://staging.fieldgrid.nl/platform/staging-smoke",
      FIELDGRID_MVP_SPRINT2_STORAGE_DOWNLOAD_STATUS: "pass",
      FIELDGRID_MVP_SPRINT2_PORTAL_ACCEPTANCE_STATUS: "pass",
      FIELDGRID_MVP_SPRINT2_NOTIFICATION_EMAIL_STATUS: "pass",
      FIELDGRID_MVP_SPRINT2_PLATFORM_ADMIN_STATUS: "pass",
    },
  });
  const errors = await validateMvpSprint2RuntimeProofPlan(plan);

  assert.deepEqual(errors, []);
  assert.equal(plan.version, MVP_SPRINT2_RUNTIME_PROOF_VERSION);
  assert.equal(plan.destructive, false);
  assert.equal(plan.noTenantMutation, true);
  assert.equal(plan.pilotTenant.slug, "field-demo");
  assert.equal(plan.pilotTenant.host, "field-demo.staging.fieldgrid.nl");
  assert.equal(plan.pilotTenant.mutatingConfirm, "field-demo-only");
  assert.deepEqual(
    plan.gateItems.map((item) => item.id),
    mvpSprint2RequiredGateIds,
  );
  assert.ok(
    plan.gateItems.every((item) => item.owner && item.command && item.evidence),
  );
});

test("MVP Sprint 2 runtime proof script validates from the command line", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/fieldgrid-mvp-sprint2-runtime-proof.mjs", "--check"],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
    },
  );

  assert.match(output, /MVP Sprint 2 runtime proof contract is valid/u);
});

test("MVP Sprint 2 docs and package scripts expose the runtime gate", () => {
  const script = read("scripts/fieldgrid-mvp-sprint2-runtime-proof.mjs");
  const pkg = read("package.json");
  const runtimeDoc = read("docs/fieldgrid-mvp-sprint-2-runtime-proof.md");
  const checklist = read("docs/fieldgrid-first-external-tenant-checklist.md");
  const promotion = read("docs/fieldgrid-staging-promotion-checklist.md");

  assertContains(
    script,
    [
      "MVP_SPRINT2_RUNTIME_PROOF_VERSION",
      "FG-MVP2-MIGRATIONS",
      "FG-MVP2-STAGING-SMOKE",
      "FG-MVP2-LOGIN-HOST",
      "FG-MVP2-TENANT-ISOLATION",
      "FG-MVP2-STORAGE-DOWNLOAD",
      "FG-MVP2-PORTALS",
      "FG-MVP2-NOTIFICATIONS-EMAIL",
      "FG-MVP2-PLATFORM-ADMIN",
      "FIELDGRID_MVP_SPRINT2_MIGRATION_SMOKE_STATUS",
    ],
    "MVP Sprint 2 script",
  );

  assertContains(
    pkg,
    [
      "fieldgrid:mvp-sprint2-runtime-proof",
      "fieldgrid:mvp-sprint2-runtime-proof:check",
      "fieldgrid:mvp-sprint2-runtime-proof:strict",
    ],
    "package scripts",
  );

  assertContains(
    `${runtimeDoc}\n${checklist}\n${promotion}`,
    [
      "MVP Sprint 2",
      "Definition of done",
      "field-demo",
      "FIELDGRID_MUTATING_SMOKE_CONFIRM=field-demo-only",
      "https://github.com/veele-services/platform/actions/runs/28902141188",
      "pnpm fieldgrid:mvp-sprint2-runtime-proof:check",
      "pnpm fieldgrid:mvp-sprint2-runtime-proof:strict",
      "FG-MVP2-NOTIFICATIONS-EMAIL",
    ],
    "MVP Sprint 2 docs",
  );
});
