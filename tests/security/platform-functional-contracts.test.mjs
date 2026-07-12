import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url);
function readText(path) { return readFileSync(new URL(path, ROOT), "utf8"); }
function readJson(path) { return JSON.parse(readText(path)); }
function has(source, needle, message) { assert.ok(source.includes(needle), message || "missing " + needle); }
function lacks(source, needle, message) { assert.ok(!source.includes(needle), message || "unexpected " + needle); }

function functionBody(source, name) {
  const start = source.indexOf("function " + name);
  assert.notEqual(start, -1, "missing function " + name);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart, index + 1);
    }
  }
  assert.fail("unterminated function " + name);
}

test("platform audit artifacts cover requested flows and gap ids", () => {
  const audit = readText("docs/readiness/platform-functional-audit.md");
  const register = readJson("docs/readiness/platform-functional-gap-register.json");
  assert.equal(register.canonicalBaseSha, "f36e84dad5d1c595e4dd349ff5ce6bd439722576");
  assert.equal(register.scope, "audit-only");
  assert.equal(register.runtimeFixesIncluded, false);
  assert.equal(register.liveServicesAccessed, false);
  assert.equal(register.migrationsChanged, false);
  assert.equal(register.workflowsChanged, false);
  const requiredFlows = [
    "create tenant",
    "provision canonical tenant settings",
    "create/activate first owner",
    "configure domain",
    "configure sectors/modules/plan",
    "configure branding and e-mail transport",
    "activate/suspend/reactivate/archive",
    "tenant access denial while suspended",
    "support grant create/use/expire/revoke",
    "subscription/module changes reflected in backoffice and portals",
    "platform notification delivery",
    "ticket and support lifecycle",
    "release/knowledgebase visibility",
    "safe deletion/offboarding readiness",
  ];
  for (const flow of requiredFlows) {
    assert.ok(register.flows.includes(flow), "register missing flow " + flow);
    assert.ok(audit.includes(flow), "audit missing flow " + flow);
  }
  const ids = new Set(register.gaps.map((gap) => gap.id));
  for (let index = 1; index <= 22; index += 1) {
    const id = "PF-" + String(index).padStart(3, "0");
    assert.ok(ids.has(id), "missing gap " + id);
  }
});

test("platform auth and recovery gaps are source reproducible", () => {
  const platformAuth = readText("artifacts/backoffice/src/lib/auth/platform.ts");
  const adminGuard = functionBody(platformAuth, "requirePlatformAdmin");
  const requestGuard = functionBody(platformAuth, "requirePlatformAdminFromRequest");
  has(platformAuth, "isPlatformHost", "host helpers are present");
  lacks(adminGuard, "isPlatformHost", "terminal platform admin guard is not host-bound");
  lacks(requestGuard, "isPlatformHost", "request platform admin guard is not host-bound");
  const platformActions = readText("artifacts/backoffice/src/app/actions/platform.ts");
  has(platformActions, 'mfaStatus: "later"');
  has(platformActions, "allowExistingActive: true");
  const invites = readText("artifacts/backoffice/src/lib/auth/portal-invites.ts");
  has(invites, "generatePasswordResetCode");
  has(invites, "updateUserById");
  has(invites, "password:");
  for (const file of [
    "artifacts/backoffice/src/app/actions/auth.ts",
    "artifacts/klant-pwa/src/actions/auth.ts",
    "artifacts/personeel-pwa/src/actions/auth.ts",
  ]) {
    const source = readText(file);
    has(source, "getUser()", file + " depends on current session");
    has(source, "updateUser({ password", file + " updates password");
  }
});

test("tenant provisioning lifecycle plan and sector gaps are source reproducible", () => {
  const tenants = readText("artifacts/backoffice/src/app/actions/platform-tenants.ts");
  const createTenant = functionBody(tenants, "createPlatformTenant");
  const lifecycle = functionBody(tenants, "updatePlatformTenantLifecycle");
  const planChange = functionBody(tenants, "updatePlatformTenantPlan");
  has(createTenant, "insert(tenantsTable)");
  lacks(createTenant, "provisionTenant", "legacy tenant create does not delegate");
  has(createTenant, "tenantSectorSettingsTable");
  has(lifecycle, 'lifecycleAction === "reactivate"');
  has(lifecycle, 'status: "active"');
  lacks(lifecycle, "archivedAt: null", "reactivation does not clear archive metadata");
  has(lifecycle, "auditPlatformTenantAction");
  has(planChange, "tenantSubscriptionsTable");
  lacks(planChange, "tenantModulesTable", "plan change does not reconcile overrides");
  const tenantContext = readText("lib/db/src/tenant-context.ts");
  has(tenantContext, "FIELDGRID_ROOT_DOMAIN");
  has(tenantContext, "DEFAULT_PLATFORM_HOSTS");
  const provisioning = readText("lib/db/src/tenant-provisioning.ts");
  has(provisioning, "isPlatformHost(primaryDomain)");
  has(provisioning, "input.sectorIds.length > 0");
  has(provisioning, "planModules.map((module) => module.moduleId)");
  const entitlements = readText("lib/db/src/tenant-entitlements.ts");
  assert.ok(entitlements.indexOf("const [tenantOverride]") < entitlements.indexOf("const plan = await getTenantPlanSnapshot"));
  for (const file of [
    "artifacts/backoffice/src/app/actions/customers.ts",
    "artifacts/backoffice/src/app/actions/objects.ts",
    "artifacts/backoffice/src/app/actions/personnel.ts",
    "artifacts/klant-pwa/src/actions/objects.ts",
    "artifacts/klant-pwa/src/actions/assignments.ts",
  ]) {
    const source = readText(file);
    has(source, "sectorId", file + " contains sector path");
    lacks(source, "resolveTenantSectorForWrite", file + " lacks tenant sector write resolver");
    lacks(source, "assertTenantSectorAllowed", file + " lacks tenant sector allow-list assertion");
  }
});

test("notification email support and sensitive access gaps are source reproducible", () => {
  const events = readText("lib/db/src/events.ts");
  has(events, "personnelTable.id");
  has(events, "customersTable.id");
  has(events, "eq(personnelTable.isActive, true)");
  has(events, "eq(customersTable.isActive, true)");
  lacks(events, "eq(personnelTable.tenantId, tenantId)");
  lacks(events, "eq(customersTable.tenantId, tenantId)");
  const notifications = readText("artifacts/backoffice/src/app/actions/platform-notifications.ts");
  const dispatch = functionBody(notifications, "createPlatformNotificationDispatch");
  has(dispatch, "platformNotificationDispatchesTable");
  has(dispatch, "platformNotificationRecipientsTable");
  has(dispatch, "not_configured");
  lacks(dispatch, "sendEmailWithResult");
  const email = readText("lib/db/src/email-service.ts");
  const legacySmtp = functionBody(email, "getLegacySmtpProvider");
  const resolveProvider = functionBody(email, "resolveActiveProvider");
  has(legacySmtp, "organizationSettingsTable");
  has(legacySmtp, "smtpEnabled");
  lacks(legacySmtp, "tenantId", "legacy SMTP provider is not tenant scoped");
  assert.ok(resolveProvider.indexOf("getLegacySmtpProvider") < resolveProvider.indexOf("getEnvResendProvider"));
  const permissions = readText("artifacts/backoffice/src/lib/auth/permissions.ts");
  const hasPermission = functionBody(permissions, "hasPermission");
  const hasPermissionFromRequest = functionBody(permissions, "hasPermissionFromRequest");
  has(hasPermission, "auditCurrentSupportPermission");
  lacks(hasPermissionFromRequest, "auditCurrentSupportPermission");
  lacks(hasPermissionFromRequest, "writeSupportAccessAuditLog");
  const sensitiveAccess = readText("artifacts/backoffice/src/app/actions/sensitive-access.ts");
  const requestSensitiveAccess = functionBody(sensitiveAccess, "requestSensitiveAccessFromForm");
  has(requestSensitiveAccess, "requirePlatformSupportUser");
  has(requestSensitiveAccess, 'approvalRequiredFrom: "platform_owner"');
  lacks(requestSensitiveAccess, "supportGrant", "request is not bound to an active support grant");
  const messages = readText("artifacts/personeel-pwa/src/actions/messages.ts");
  has(messages, "eq(personnelTable.userId, user.id)");
  lacks(messages, "requireCurrentPersonnelPortalTenantId");
});
