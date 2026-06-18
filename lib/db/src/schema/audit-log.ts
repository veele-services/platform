import { pgTable, uuid, varchar, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Immutable append-only audit trail for all sensitive actions.
 * Never update or delete rows from this table.
 */
export const auditLogTable = pgTable("audit_log", {
  id:         uuid("id").primaryKey().defaultRandom(),
  /** Supabase Auth user ID — who performed the action */
  userId:     uuid("user_id").notNull(),
  /** e.g. "login", "logout", "create", "update", "delete", "role_change" */
  action:     varchar("action", { length: 100 }).notNull(),
  /** Module or entity type: "auth", "customers", "assignments", "roles" … */
  resource:   varchar("resource", { length: 100 }).notNull(),
  /** Primary key of the affected entity, if applicable */
  resourceId: text("resource_id"),
  /** Arbitrary JSON payload for extra context */
  metadata:   jsonb("metadata"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogTable.$inferSelect;
