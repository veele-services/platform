import { describe, expect, it } from "vitest";
import { hasManagementPermission, managementInviteSchema, permissionForPath } from "./model";
import { managementPermissionLabel } from "./labels";

describe("explicit management page and permission model", () => {
 it("preserves only explicit legacy authority and denies empty managed roles", () => {
  expect(hasManagementPermission({}, "backoffice.finance.write")).toBe(true);
  expect(hasManagementPermission({ permissions: [] }, "backoffice.finance.write")).toBe(false);
  expect(hasManagementPermission({ permissions: ["backoffice.finance.read"] }, "backoffice.finance.write")).toBe(false);
 });
 it.each([["/app", "backoffice.overview.read"], ["/app/klanten/id", "backoffice.customers.read"], ["/app/personeel/actie-nodig", "backoffice.personnel.read"], ["/app/gebruikers", "management.users.read"], ["/app/notificaties/templates", "backoffice.access"], ["/staff", null], ["/platform", null]])("resolves %s separately from staff/platform", (path, permission) => expect(permissionForPath(path)).toBe(permission));
 it("rejects a supplied owner role or extra authority fields in invitation payload", () => {
  const input = { name: "Fictieve manager", email: "manager@example.test", roleId: "11111111-1111-4111-8111-111111111111", requestId: "22222222-2222-4222-8222-222222222222" };
  expect(managementInviteSchema.safeParse(input).success).toBe(true);
  expect(managementInviteSchema.safeParse({ ...input, roles: ["tenant_admin"] }).success).toBe(false);
 });
 it("uses Dutch product labels for concrete function permissions", () => expect(managementPermissionLabel({ key: "backoffice.functions.customer_portal_bind", name: "customer portal bind", module: "customers", action: "write" })).toBe("Klantportaaltoegang toekennen of intrekken"));
});
