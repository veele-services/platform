import { z } from "zod";

const scope = z.object({ allTenants: z.boolean(), tenantIds: z.array(z.uuid()).max(100) })
  .refine(value => value.allTenants ? value.tenantIds.length === 0 : value.tenantIds.length > 0, "Kies het supportbereik.");
export const supportInviteSchema = z.object({ name: z.string().trim().min(2).max(160), email: z.email().trim().toLowerCase().max(320), allTenants: z.boolean(), tenantIds: z.array(z.uuid()).max(100), requestId: z.uuid() }).strict().refine(value => scope.safeParse(value).success, "Kies het supportbereik.");
export const supportChangeSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("update"), userId: z.uuid(), name: z.string().trim().min(2).max(160), allTenants: z.boolean(), tenantIds: z.array(z.uuid()).max(100), status: z.enum(["active", "revoked"]), version: z.number().int().positive(), requestId: z.uuid() }).strict().refine(value => scope.safeParse(value).success, "Kies het supportbereik."),
  z.object({ command: z.enum(["revoke", "resend"]), userId: z.uuid(), version: z.number().int().positive(), requestId: z.uuid() }).strict(),
]);
export const supportSnapshotSchema = z.object({
  members: z.array(z.object({ id: z.uuid(), name: z.string(), email: z.email(), status: z.enum(["active", "revoked"]), allTenants: z.boolean(), tenantIds: z.array(z.uuid()), version: z.number().int().positive(), invitedAt: z.string(), lastSignInAt: z.string().nullable(), deliveryStatus: z.enum(["pending", "sending", "sent", "failed", "uncertain", "suppressed"]) })),
  tenants: z.array(z.object({ id: z.uuid(), name: z.string() })),
  audit: z.array(z.object({ id: z.uuid(), action: z.string(), name: z.string(), createdAt: z.string() })),
});
export type SupportSnapshot = z.infer<typeof supportSnapshotSchema>;
export type SupportMember = SupportSnapshot["members"][number];
