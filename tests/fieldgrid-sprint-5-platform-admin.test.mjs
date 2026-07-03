import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should mention ${phrase}`);
  }
}

const platformTenantsActions = "artifacts/backoffice/src/app/actions/platform-tenants.ts";
const platformActions = "artifacts/backoffice/src/app/actions/platform.ts";
const platformPage = "artifacts/backoffice/src/app/(platform)/platform/page.tsx";
const tenantDetailPage = "artifacts/backoffice/src/app/(platform)/platform/tenants/[tenantId]/page.tsx";
const sprintContract = "docs/fieldgrid-sprint-5-platform-admin.md";
const testMatrix = "docs/fieldgrid-cross-tenant-testmatrix.md";

const PLATFORM_TEST_IDS = [
  "FG-PLATFORM-001",
  "FG-PLATFORM-002",
  "FG-PLATFORM-003",
  "FG-PLATFORM-004",
  "FG-PLATFORM-005",
  "FG-PLATFORM-006",
];

test("Sprint 5 platform tenant actions cover lifecycle, domains, plans, modules and sectors", () => {
  const actions = read(platformTenantsActions);

  assertContains(
    actions,
    [
      "requirePlatformAdmin",
      "createPlatformTenant",
      "updatePlatformTenantLifecycle",
      "updatePlatformTenantPlan",
      "addPlatformTenantDomain",
      "updatePlatformTenantDomain",
      "updatePlatformTenantModule",
      "updatePlatformTenantSector",
      "updatePlatformTenantSectorPolicy",
      "getPlatformTenantUsage",
      "tenant_created",
      "tenant_suspend",
      "tenant_domain_added",
      "tenant_plan_updated",
      "tenant_module_enabled",
      "tenant_sector_policy_updated",
    ],
    platformTenantsActions,
  );

  assertContains(
    actions,
    [
      "Module ${module.key} vereist eerst module",
      "kan niet uit zolang",
      "Sector is nog in gebruik",
      "Platformhosts kunnen niet aan een tenant worden gekoppeld",
      "type: \"subdomain\"",
      "tenantSectorSettingsTable",
      "tenantSubscriptionsTable",
      "tenantModulesTable",
    ],
    platformTenantsActions,
  );
});

test("Sprint 5 support form actions expose create and revoke safely", () => {
  const actions = read(platformActions);

  assertContains(
    actions,
    [
      "createSupportAccessGrantFromForm",
      "revokeSupportAccessGrantFromForm",
      "requirePlatformAdmin",
      "grant_created",
      "grant_revoked",
      "revalidatePlatformTenant",
    ],
    platformActions,
  );
});

test("platform overview has tenant creation and tenant detail navigation", () => {
  const page = read(platformPage);

  assertContains(
    page,
    [
      "createPlatformTenant",
      "Nieuwe tenant",
      "Tenant",
      "Plan",
      "Domein",
      "href={`/platform/tenants/${tenant.id}`}",
      "Je ziet alleen supportgrants",
    ],
    platformPage,
  );
});

test("tenant detail page exposes the platform-admin MVP sections", () => {
  const page = read(tenantDetailPage);

  assertContains(
    page,
    [
      "getPlatformTenantDetail",
      "listPlatformTenantDomains",
      "listPlatformTenantModules",
      "listPlatformTenantSectors",
      "listSupportAccessAuditLog",
      "Plan en lifecycle",
      "Domeinen",
      "Modules",
      "Sectorbeleid",
      "Support grants",
      "Gebruik",
      "Audit",
      "Suspend",
      "Reactiveren",
      "Archiveren",
      "Grant maken",
      "Revoke",
    ],
    tenantDetailPage,
  );
});

test("Sprint 5 contract maps platform-admin MVP to canonical test IDs", () => {
  const contract = read(sprintContract);
  const matrix = read(testMatrix);

  assertContains(
    contract,
    [
      "Platform-admin MVP beheer",
      "Geen schema- of migratiewijzigingen.",
      "tenant-shell",
      "dependency-validatie",
      "support grants UI",
      "Basis usage-overzicht",
      "Geen volledige provisioning/onboarding wizard",
    ],
    sprintContract,
  );

  for (const testId of PLATFORM_TEST_IDS) {
    assertContains(contract, [testId], sprintContract);
    assertContains(matrix, [testId], testMatrix);
  }

  assertContains(
    contract,
    ["FG-SUPPORT-002", "FG-SUPPORT-005", "FG-AUDIT-003", "FG-MODULE-006", "FG-SECTOR-004", "FG-SECTOR-005"],
    sprintContract,
  );
});
