import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertIncludes(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should include ${phrase}`);
  }
}

test("sprint 11 adds additive provisioning and first-run schema", () => {
  const schema = read("lib/db/src/schema/tenant-provisioning.ts");
  const migration = read("lib/db/migrations/066_tenant_provisioning_onboarding.sql");
  const schemaIndex = read("lib/db/src/schema/index.ts");

  assertIncludes(
    `${schema}\n${migration}`,
    [
      "tenant_provisioning_runs",
      "tenant_owner_invites",
      "tenant_first_run_state",
      "owner_invite_status",
      "required_steps",
      "completed_steps",
      "ON DELETE SET NULL",
      "ON DELETE CASCADE",
      "CREATE TABLE IF NOT EXISTS",
    ],
    "provisioning schema and migration",
  );
  assertIncludes(schemaIndex, ["./tenant-provisioning"], "schema index");
});

test("sprint 11 exports transaction-safe provisioning service contracts", () => {
  const service = read("lib/db/src/tenant-provisioning.ts");
  const dbIndex = read("lib/db/src/index.ts");

  assertIncludes(
    service,
    [
      "provisionTenant",
      "assertTenantProvisioningIsUnique",
      "completeProvisionedTenantOwnerInvite",
      "rollbackProvisionedTenant",
      "db.transaction",
      "tenantSubscriptionsTable",
      "tenantModulesTable",
      "tenantSectorSettingsTable",
      "tenantRolesTable",
      "tenantFirstRunStateTable",
      "defaultTenantDomainForSlug",
      "isPlatformHost",
    ],
    "tenant provisioning service",
  );
  assertIncludes(dbIndex, ["./tenant-provisioning"], "db exports");
});

test("sprint 11 platform flow requires owner invite and exposes run status", () => {
  const action = read("artifacts/backoffice/src/app/actions/platform-provisioning.ts");
  const page = read("artifacts/backoffice/src/app/(platform)/platform/page.tsx");

  assertIncludes(
    action,
    [
      "inviteOwnerByEmail",
      "provisionPortalUserForActivation",
      "Owner e-mail is verplicht",
      "rollbackProvisionedTenant",
      "completeProvisionedTenantOwnerInvite",
      "listTenantProvisioningRuns",
      "tenant_provisioned",
    ],
    "platform provisioning action",
  );
  assertIncludes(
    page,
    [
      "createPlatformTenant",
      "listTenantProvisioningRuns",
      "name=\"ownerEmail\"",
      "required className",
      "Provisioning runs",
      "ownerInviteStatus",
    ],
    "platform provisioning page",
  );
});

test("sprint 11 adds tenant first-run checklist foundation", () => {
  const actions = read("artifacts/backoffice/src/app/actions/tenant-first-run.ts");
  const page = read("artifacts/backoffice/src/app/(dashboard)/first-run/page.tsx");

  assertIncludes(
    actions,
    [
      "getTenantFirstRunState",
      "completeTenantFirstRunStep",
      "skipTenantFirstRun",
      "tenantFirstRunStateTable",
      "branding",
      "users",
      "sectors",
      "modules",
    ],
    "tenant first-run actions",
  );
  assertIncludes(page, ["Tenant onboarding", "Markeer gereed", "Overslaan"], "tenant first-run page");
});

test("sprint 11 canon doc maps implementation to cross-tenant acceptance", () => {
  const sprintDoc = read("docs/fieldgrid-sprint-11-provisioning-onboarding.md");

  assertIncludes(
    sprintDoc,
    [
      "FG-PLATFORM-001",
      "FG-PLATFORM-004",
      "FG-PLATFORM-005",
      "FG-PLATFORM-006",
      "FG-HOST-006",
      "FG-RBAC-001",
      "FG-RBAC-003",
      "FG-MIG-001",
      "FG-MIG-002",
    ],
    "sprint 11 canon doc",
  );
});
