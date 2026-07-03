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

const apiAuth = "artifacts/api-server/src/middleware/auth.ts";
const paymentReminders = "artifacts/api-server/src/routes/payment-reminders.ts";
const expiredQuotes = "artifacts/api-server/src/routes/expired-quotes.ts";
const customerTenant = "artifacts/klant-pwa/src/lib/auth/tenant.ts";
const customerActions = "artifacts/klant-pwa/src/actions/customer.ts";
const personnelTenant = "artifacts/personeel-pwa/src/lib/auth/tenant.ts";
const personnelActions = "artifacts/personeel-pwa/src/actions/personnel.ts";
const personnelAssignments = "artifacts/personeel-pwa/src/actions/assignments.ts";
const sprintContract = "docs/fieldgrid-sprint-2-module-enforcement.md";
const testMatrix = "docs/fieldgrid-cross-tenant-testmatrix.md";

const MODULE_TEST_IDS = [
  "FG-MODULE-001",
  "FG-MODULE-002",
  "FG-MODULE-003",
  "FG-MODULE-004",
  "FG-MODULE-005",
  "FG-MODULE-006",
  "FG-MODULE-007",
  "FG-MODULE-008",
];

test("API permission middleware enforces module entitlements after tenant RBAC", () => {
  const auth = read(apiAuth);

  assertContains(
    auth,
    [
      "requireTenantModule",
      "type FieldgridModuleKey",
      "const PERMISSION_MODULES",
      "function moduleForPermissionResource",
      "async function requireEnabledPermissionModule",
      "Module niet beschikbaar voor deze tenant",
      "customers: \"customers\"",
      "objects: \"objects\"",
      "personnel: \"personnel\"",
      "assignments: \"assignments\"",
      "planning: \"planning\"",
      "reports: \"reporting\"",
      "documents: \"documents\"",
      "invoices: \"finance\"",
      "quotes: \"finance\"",
      "payments: \"finance\"",
      "customer_payment_batches: \"finance\"",
      "notifications: \"notifications\"",
      "smart_planning: \"smart_planning\"",
    ],
    apiAuth,
  );

  const rbacCheck = auth.indexOf("const permissions = await getUserPermissions(userId, tenantId);");
  const moduleCheck = auth.lastIndexOf("requireEnabledPermissionModule(req, res, resource, tenantId)");
  const nextCall = auth.lastIndexOf("next();");
  assert.notEqual(rbacCheck, -1, "RBAC check should exist");
  assert.notEqual(moduleCheck, -1, "module check should exist in requirePermission");
  assert.ok(rbacCheck < moduleCheck, "module check should run after tenant RBAC");
  assert.ok(moduleCheck < nextCall, "module check should run before the route handler");
});

test("customer portal identity requires the customer_portal module", () => {
  const tenant = read(customerTenant);
  const actions = read(customerActions);

  assertContains(
    tenant,
    [
      "requireTenantModule",
      "type FieldgridModuleKey",
      "export async function requireCurrentPortalModule",
      "await requireTenantModule(tenantId, moduleKey)",
      "export async function requireCurrentCustomerPortalTenantId",
      "return requireCurrentPortalModule(\"customer_portal\");",
    ],
    customerTenant,
  );

  assertContains(
    actions,
    [
      "requireCurrentCustomerPortalTenantId",
      "const tenantId = await requireCurrentCustomerPortalTenantId();",
    ],
    customerActions,
  );
  assert.doesNotMatch(actions, /import \{ getCurrentPortalTenantId \}/u);
});

test("personnel portal identity and assignment actions require the personnel_portal module", () => {
  const tenant = read(personnelTenant);
  const actions = read(personnelActions);
  const assignments = read(personnelAssignments);

  assertContains(
    tenant,
    [
      "requireTenantModule",
      "type FieldgridModuleKey",
      "export async function requireCurrentPortalModule",
      "await requireTenantModule(tenantId, moduleKey)",
      "export async function requireCurrentPersonnelPortalTenantId",
      "return requireCurrentPortalModule(\"personnel_portal\");",
    ],
    personnelTenant,
  );

  assertContains(
    actions,
    ["requireCurrentPersonnelPortalTenantId as getCurrentPortalTenantId"],
    personnelActions,
  );

  assertContains(
    assignments,
    [
      "isTenantModuleEnabled",
      "isTenantModuleEnabled(data.tenant_id, \"personnel_portal\")",
      "if (!data?.tenant_id) return null;",
    ],
    personnelAssignments,
  );
});

test("finance background jobs skip tenants without the finance module", () => {
  const reminders = read(paymentReminders);
  const quotes = read(expiredQuotes);

  assertContains(
    reminders,
    [
      "isTenantModuleEnabled",
      "customerTenantId:    customersTable.tenantId",
      "isTenantModuleEnabled(invoice.customerTenantId, \"finance\")",
      "let moduleDisabled = 0;",
      "moduleDisabled++",
      "res.json({ ok: true, sent, skipped, moduleDisabled });",
    ],
    paymentReminders,
  );

  assertContains(
    quotes,
    [
      "isTenantModuleEnabled",
      "customerTenantId: customersTable.tenantId",
      "isTenantModuleEnabled(q.customerTenantId, \"finance\")",
      "let moduleDisabled = 0;",
      "moduleDisabled++",
      "res.json({ ok: true, expired, notified, skipped, moduleDisabled });",
    ],
    expiredQuotes,
  );
});

test("Sprint 2 contract is tied to canonical module test IDs", () => {
  const contract = read(sprintContract);
  const matrix = read(testMatrix);

  assertContains(
    contract,
    [
      "module enforcement runtimebreed",
      "Geen nieuwe tabellen, kolommen of migraties.",
      "module disabled API",
      "background job",
      "customer_portal",
      "personnel_portal",
      "finance",
    ],
    sprintContract,
  );

  for (const testId of MODULE_TEST_IDS) {
    assertContains(contract, [testId], sprintContract);
    assertContains(matrix, [testId], testMatrix);
  }
});
