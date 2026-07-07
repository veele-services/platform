import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertContains(content, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(content.includes(phrase), `${label} should contain ${phrase}`);
  }
}

test("platform tenant actions support tenant admin CRUD and owner invite resend", () => {
  const actions = read("artifacts/backoffice/src/app/actions/platform-tenants.ts");

  assertContains(
    actions,
    [
      "addPlatformTenantAdmin",
      "updatePlatformTenantAdmin",
      "deletePlatformTenantAdmin",
      "updatePlatformTenantOwnerInvite",
      "tenantRolesTable",
      "tenantUserRolesTable",
      "tenantProvisioningRunsTable",
      "createAdminClient",
      "provisionPortalUserWithTemporaryPassword",
      "sendEmailWithResult",
      "tenant_admin_added",
      "tenant_admin_updated",
      "tenant_admin_deleted",
      "tenant_owner_invite_updated",
      "existing_auth_user",
    ],
    "platform tenant admin actions",
  );
});

test("platform tenant detail exposes tenant admin and owner invite management forms", () => {
  const page = read("artifacts/backoffice/src/app/(platform)/platform/tenants/[tenantId]/page.tsx");

  assertContains(
    page,
    [
      "Tenant admins",
      "Nieuwe tenant admin",
      "Tenanttoegang verwijderen",
      "Owner invites",
      "Wijzigen en opnieuw versturen",
      "Owner invite aanmaken",
      "addPlatformTenantAdminFormAction",
      "updatePlatformTenantAdminFormAction",
      "deletePlatformTenantAdminFormAction",
      "updatePlatformTenantOwnerInviteFormAction",
      "tenantRoleIds",
    ],
    "platform tenant detail users tab",
  );
});
