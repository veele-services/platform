import { z } from "zod";

export const managementContextSchema = z.object({ managed: z.boolean(), role: z.string().nullable(), displayName: z.string().nullable().optional(), permissions: z.array(z.string()).nullable() });
export const managementRoleSchema = z.object({ id: z.uuid(), code: z.enum(["owner", "management", "planning", "administration", "support"]), name: z.string(), revision: z.number(), permissions: z.array(z.string()) });
export const managementUserSchema = z.object({ id: z.uuid(), userId: z.uuid(), name: z.string(), email: z.email(), status: z.enum(["invited", "active", "suspended", "revoked"]), roleId: z.uuid().nullable(), roleName: z.string(), revision: z.number(), invitedAt: z.string().nullable(), acceptedAt: z.string().nullable() });
export const managementCatalogSchema = z.object({ key: z.string(), name: z.string(), description: z.string(), module: z.string(), action: z.string(), dependencies: z.array(z.string()), sensitive: z.boolean() });
export const managementSnapshotSchema = z.object({ roles: z.array(managementRoleSchema), users: z.array(managementUserSchema), catalog: z.array(managementCatalogSchema), transfers: z.array(z.object({ id: z.uuid(), source: z.uuid(), target: z.uuid(), expiresAt: z.string() })), canManage: z.boolean() });
export const managementTransferSchema = z.object({ id: z.uuid(), expiresAt: z.string(), sourceName: z.string() }).nullable();
export type ManagementSnapshot = z.infer<typeof managementSnapshotSchema>;
export type ManagementRole = z.infer<typeof managementRoleSchema>;
export const managementInviteSchema = z.object({ name: z.string().trim().min(2).max(160), email: z.email().transform(value => value.trim().toLowerCase()), roleId: z.uuid(), requestId: z.uuid() }).strict();
export const managementCommandSchema = z.object({ command: z.enum(["save_role", "assign", "revoke", "resend", "transfer", "cancel_transfer", "accept_transfer"]), input: z.record(z.string(), z.unknown()), requestId: z.uuid() }).strict();

/** Optional permissions preserve reviewed legacy memberships until explicitly
 * assigned a management profile; an empty managed permission list denies all. */
export function hasManagementPermission(tenant: { permissions?: string[] | null }, capability: string): boolean {
  return tenant.permissions == null || tenant.permissions.includes(capability);
}
export const backofficePagePermission: Record<string, string> = {
  aanvragen: "commercial", planning: "planning", werkbonnen: "work_orders", taken: "tasks", klanten: "customers", objecten: "objects", personeel: "personnel", rapporten: "reports", facturen: "finance", nieuws: "news", opvolging: "followup", instellingen: "settings",
};
export function permissionForPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "app") return null;
  if (parts[1] === "gebruikers") return "management.users.read";
  if (["notificaties", "meldingen", "support"].includes(parts[1] ?? "")) return "backoffice.access";
  const pageModule = parts[1] ? backofficePagePermission[parts[1]] : "overview";
  return pageModule ? `backoffice.${pageModule}.read` : "backoffice.access";
}
export const managementModuleNames: Record<string, string> = { access: "Toegang", overview: "Overzicht", commercial: "Aanvragen en offertes", planning: "Planbord", work_orders: "Werkbonnen", tasks: "Taken en tarieven", customers: "Klanten", objects: "Objecten", personnel: "Personeel", reports: "Rapportcontrole", finance: "Facturen en betalingen", news: "Nieuws", followup: "Opvolging", settings: "Instellingen", tickets: "Tickets en support", notifications: "Notificaties", management: "Gebruikers en eigenaarschap" };
