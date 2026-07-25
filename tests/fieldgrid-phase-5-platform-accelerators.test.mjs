import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  FIELDGRID_VISUAL_REGRESSION_VERSION,
  buildVisualRegressionPlan,
  visualRegressionTargetGroups,
  visualRegressionViewports,
} from "../scripts/fieldgrid-visual-regression-snapshots.mjs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
  }
}

test("phase 5 adds a platform accelerator surface with auditable actions", () => {
  const action = read(
    "artifacts/backoffice/src/app/actions/platform-accelerators.ts",
  );
  const page = read(
    "artifacts/backoffice/src/app/(platform)/platform/accelerators/page.tsx",
  );
  const platformPage = read(
    "artifacts/backoffice/src/app/(platform)/platform/page.tsx",
  );

  assertContains(
    `${action}\n${page}\n${platformPage}`,
    [
      "getPlatformAcceleratorsDashboard",
      "requestDemoTenantReset",
      "demo_tenant_reset_requested",
      "requestVisualRegressionSnapshot",
      "visual_regression_snapshot_requested",
      "requestPlatformExportAudit",
      "platform_export_requested",
      "Tenant health scorecard",
      "Notification preview sandbox",
      "Demo-tenant generator",
      "Export center",
      "/platform/accelerators",
      "Platformversnellers",
    ],
    "phase 5 platform accelerator UI",
  );
});

test("phase 5 exports cover platform tenant health and billing", () => {
  const tenantExport = read(
    "artifacts/backoffice/src/app/api/platform/exports/tenants/route.ts",
  );
  const billingExport = read(
    "artifacts/backoffice/src/app/api/platform/billing/export/route.ts",
  );
  const action = read(
    "artifacts/backoffice/src/app/actions/platform-accelerators.ts",
  );

  assertContains(
    `${tenantExport}\n${billingExport}\n${action}`,
    [
      "listPlatformTenantHealthForExport",
      "fieldgrid-platform-tenants",
      "health_score",
      "legacy_storage_paths",
      "listBillingExportRows",
      "fieldgrid-billing-subscriptions",
      "manual_billing_notes",
      "Cache-Control",
      "private, no-store",
    ],
    "phase 5 export routes",
  );
});

test("phase 5 visual regression plan covers backoffice and portals", () => {
  assert.equal(
    FIELDGRID_VISUAL_REGRESSION_VERSION,
    "fieldgrid-visual-regression-snapshots-v1",
  );
  assert.equal(visualRegressionViewports.length, 9);
  assert.deepEqual(
    visualRegressionTargetGroups.map((group) => group.id),
    [
      "platform-backoffice",
      "tenant-backoffice",
      "customer-portal",
      "personnel-portal",
    ],
  );

  const plan = buildVisualRegressionPlan(
    {
      FIELDGRID_BACKOFFICE_BASE_URL: "https://admin.fieldgrid.nl",
      FIELDGRID_TENANT_BACKOFFICE_BASE_URL: "https://demo-a.fieldgrid.nl",
      FIELDGRID_CUSTOMER_PORTAL_BASE_URL: "https://demo-a.fieldgrid.nl/klant",
      FIELDGRID_PERSONNEL_PORTAL_BASE_URL:
        "https://demo-a.fieldgrid.nl/personeel",
    },
    { target: "all", artifactDir: "artifacts/visual-regression" },
  );

  assert.deepEqual(plan.errors, []);
  assert.equal(plan.groups.length, 4);
  const platform = plan.groups.find(
    (group) => group.id === "platform-backoffice",
  );
  assert.ok(platform?.routes.includes("/admin/platform/accelerators"));
  assert.deepEqual(
    platform?.personas.map((persona) => persona.id),
    ["platform-owner", "platform-admin", "platform-support"],
  );
});

test("phase 5 scripts and docs publish the accelerator contract", () => {
  const pkg = read("package.json");
  const gitignore = read(".gitignore");
  const docs = read("docs/fieldgrid-phase-5-platform-accelerators.md");

  assertContains(
    `${pkg}\n${gitignore}\n${docs}`,
    [
      "fieldgrid:visual-regression-snapshots",
      "fieldgrid:visual-regression-snapshots:check",
      "fieldgrid:phase5-platform-accelerators:check",
      "/artifacts/visual-regression/",
      "Fase 5",
      "Demo-tenant generator",
      "Notification preview/sandbox",
      "Tenant health scorecard",
      "Visual regression snapshot-contracten",
      "Export center",
    ],
    "phase 5 scripts and docs",
  );
});

test("phase 5 visual regression check command validates its contract", () => {
  const output = execFileSync(
    "node",
    ["scripts/fieldgrid-visual-regression-snapshots.mjs", "--check"],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
    },
  );

  assert.match(output, /fieldgrid-visual-regression-snapshots-v1/u);
  assert.match(output, /platform-backoffice/u);
  assert.match(output, /customer-portal/u);
});
