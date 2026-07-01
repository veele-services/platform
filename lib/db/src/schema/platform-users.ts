import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const platformUsersTable = pgTable(
  "platform_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    role: varchar("role", { length: 40 }).notNull().default("support"),
    status: varchar("status", { length: 30 }).notNull().default("active"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("platform_users_user_idx").on(table.userId),
    index("platform_users_status_idx").on(table.status),
    index("platform_users_role_idx").on(table.role),
  ],
);

export const supportAccessGrantsTable = pgTable(
  "support_access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    platformUserId: uuid("platform_user_id")
      .notNull()
      .references(() => platformUsersTable.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("support_access_grants_tenant_idx").on(table.tenantId),
    index("support_access_grants_platform_user_idx").on(table.platformUserId),
    index("support_access_grants_active_idx")
      .on(table.tenantId, table.platformUserId, table.expiresAt)
      .where(sql`${table.revokedAt} IS NULL`),
  ],
);

export const supportAccessAuditLogTable = pgTable(
  "support_access_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    grantId: uuid("grant_id").references(() => supportAccessGrantsTable.id, { onDelete: "set null" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    platformUserId: uuid("platform_user_id")
      .notNull()
      .references(() => platformUsersTable.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 80 }).notNull(),
    resource: varchar("resource", { length: 120 }),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("support_access_audit_tenant_idx").on(table.tenantId),
    index("support_access_audit_platform_user_idx").on(table.platformUserId),
    index("support_access_audit_grant_idx").on(table.grantId),
  ],
);

export type PlatformUser = typeof platformUsersTable.$inferSelect;
export type SupportAccessGrant = typeof supportAccessGrantsTable.$inferSelect;
export type SupportAccessAuditLog = typeof supportAccessAuditLogTable.$inferSelect;
