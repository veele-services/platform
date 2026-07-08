import { index, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const SENSITIVE_ACCESS_REQUEST_STATUSES = ["pending", "approved", "denied", "expired", "revoked"] as const;
export const SENSITIVE_ACCESS_APPROVAL_SOURCES = ["platform_owner", "tenant_owner", "dual", "break_glass"] as const;

export const sensitiveAccessRequestsTable = pgTable("sensitive_access_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  requestedByUserId: uuid("requested_by_user_id").notNull(),
  requestedRole: varchar("requested_role", { length: 60 }).notNull(),
  dataScope: varchar("data_scope", { length: 120 }).notNull(),
  dataClassificationLevel: integer("data_classification_level").notNull(),
  reason: text("reason").notNull(),
  supportTicketReference: varchar("support_ticket_reference", { length: 160 }),
  approvalRequiredFrom: varchar("approval_required_from", { length: 40 }).notNull(),
  approvedByUserId: uuid("approved_by_user_id"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  deniedByUserId: uuid("denied_by_user_id"),
  deniedAt: timestamp("denied_at", { withTimezone: true }),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [index("sensitive_access_requests_tenant_idx").on(table.tenantId), index("sensitive_access_requests_requester_idx").on(table.requestedByUserId), index("sensitive_access_requests_status_idx").on(table.status, table.expiresAt)]);

export const sensitiveAccessGrantsTable = pgTable("sensitive_access_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id").notNull().references(() => sensitiveAccessRequestsTable.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
  scope: varchar("scope", { length: 120 }).notNull(),
  permission: varchar("permission", { length: 40 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("sensitive_access_grants_user_tenant_idx").on(table.userId, table.tenantId), index("sensitive_access_grants_scope_idx").on(table.tenantId, table.scope, table.expiresAt)]);

export type SensitiveAccessRequest = typeof sensitiveAccessRequestsTable.$inferSelect;
export type SensitiveAccessGrant = typeof sensitiveAccessGrantsTable.$inferSelect;
