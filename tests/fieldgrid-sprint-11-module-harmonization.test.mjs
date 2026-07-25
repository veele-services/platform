import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertIncludes(content, phrases, label) {
  const normalizedContent = content.replace(/\s+/gu, " ");
  for (const phrase of phrases) {
    assert.ok(
      normalizedContent.includes(phrase.replace(/\s+/gu, " ")),
      `${label} should mention ${phrase}`,
    );
  }
}

test("Sprint 11 keeps one canonical module permission map", () => {
  const moduleContract = read("lib/db/src/module-permissions.ts");
  const apiAuth = read("artifacts/api-server/src/middleware/auth.ts");
  const backofficeAuth = read("artifacts/backoffice/src/lib/auth/permissions.ts");

  assertIncludes(
    moduleContract,
    [
      "FIELDGRID_PERMISSION_MODULES",
      "customer_portal: \"customer_portal\"",
      "customer_users: \"customer_portal\"",
      "personnel_portal: \"personnel_portal\"",
      "customer_payment_batch_items: \"finance\"",
      "materials: \"materials\"",
      "inventory_items: \"inventory\"",
      "moduleForPermissionResource",
      "moduleForPermissionKey",
    ],
    "module permission contract",
  );

  assertIncludes(apiAuth, ["moduleForPermissionResource", "requireEnabledPermissionModule", "requireTenantModule"], "API auth");
  assertIncludes(backofficeAuth, ["moduleForPermissionResource", "resourceFromPermissionKey", "getCurrentEffectiveUserPermissions"], "backoffice auth");
  assert.ok(!apiAuth.includes("const PERMISSION_MODULES"), "API auth should not reintroduce a local module map");
  assert.ok(!backofficeAuth.includes("const PERMISSION_MODULES"), "backoffice auth should not reintroduce a local module map");
});

test("Sprint 11 applies module-off behavior across UI, direct URL, server action and portals", () => {
  const layout = read("artifacts/backoffice/src/app/(dashboard)/layout.tsx");
  const permissions = read("artifacts/backoffice/src/lib/auth/permissions.ts");
  const documents = read("artifacts/backoffice/src/app/actions/documents.ts");
  const customerTenant = read("artifacts/klant-pwa/src/lib/auth/tenant.ts");
  const personnelTenant = read("artifacts/personeel-pwa/src/lib/auth/tenant.ts");
  const personnelAssignments = read("artifacts/personeel-pwa/src/actions/assignments.ts");

  assertIncludes(layout, ["getCurrentEffectiveUserPermissions", "PermissionsProvider permissions={[...permissions]}"], "backoffice layout");
  assertIncludes(permissions, ["hasEnabledPermissionModule(resource)", "requireEnabledPermissionModule(resource)"], "backoffice permission helpers");
  assertIncludes(documents, ["requireCurrentTenantModule(\"documents\")", "getDocumentDownloadUrl"], "document server actions");
  assertIncludes(customerTenant, ["requireCurrentPortalModule", "return requireCurrentPortalModule(\"customer_portal\");"], "customer portal guard");
  assertIncludes(personnelTenant, ["requireCurrentPortalModule", "return requireCurrentPortalModule(\"personnel_portal\");"], "personnel portal guard");
  assertIncludes(personnelAssignments, ["requireCurrentPersonnelPortalTenantId", "if (!tenantId) return null;"], "personnel assignment actions");
});

test("Sprint 11 gives background jobs the shared module guard", () => {
  const moduleGuards = read("artifacts/api-server/src/lib/module-guards.ts");
  const reminders = read("artifacts/api-server/src/routes/payment-reminders.ts");
  const expiredQuotes = read("artifacts/api-server/src/routes/expired-quotes.ts");

  assertIncludes(
    moduleGuards,
    [
      "requireJobTenantModule",
      "type FieldgridModuleKey",
      "missing_tenant",
      "module_disabled",
      "isTenantModuleEnabled(tenantId, moduleKey)",
    ],
    "job module guard",
  );
  assertIncludes(reminders, ["requireJobTenantModule(invoice.customerTenantId, \"finance\")", "moduleDisabled++"], "payment reminder job");
  assertIncludes(expiredQuotes, ["requireJobTenantModule(q.customerTenantId, \"finance\")", "moduleDisabled++"], "expired quote job");
});

test("Sprint 11 exposes module dependency inspection in platform-admin", () => {
  const actions = read("artifacts/backoffice/src/app/actions/platform-tenants.ts");
  const page = read("artifacts/backoffice/src/app/(platform)/platform/tenants/[tenantId]/page.tsx");

  assertIncludes(
    actions,
    [
      "missingDependencyKeys",
      "enabledDependentKeys",
      "dependentKeysByModuleId",
      "dependencyKeysByModuleId",
      "moduleDependenciesTable",
    ],
    "platform tenant module model",
  );
  assertIncludes(
    page,
    [
      "Dependency inspectie",
      "Aanzetten geblokkeerd door",
      "Uitzetten geblokkeerd door actieve modules",
      "disabled={moduleToggleBlocked}",
    ],
    "platform tenant module UI",
  );
});

test("Sprint 11 canon maps module harmonization to test IDs", () => {
  const sprintDoc = read("docs/fieldgrid-sprint-11-module-enforcement.md");
  const sprintPlan = read("docs/fieldgrid-saas-proof-sprint-plan.md");

  assertIncludes(
    sprintDoc,
    [
      "module enforcement harmonisatie",
      "RBAC blijft noodzakelijk",
      "UI",
      "Directe URL",
      "Server action",
      "API",
      "Portalen",
      "Jobs",
      "FG-MODULE-001",
      "FG-MODULE-008",
      "geen nieuwe migratie",
    ],
    "Sprint 11 module harmonization doc",
  );
  assertIncludes(sprintPlan, ["Sprint 11 - Module enforcement harmonisatie"], "sprint plan");
});
