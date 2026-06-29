import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const PLATFORM_ROLES = ["super_admin", "support", "billing_admin"] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const platformUsersTable = pgTable(
  "platform_users",
  {
    userId: uuid("user_id").primaryKey(),
    role: text("role").notNull().$type<PlatformRole>(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    check("platform_users_role_check", sql`${table.role} IN ('super_admin', 'support', 'billing_admin')`),
    index("platform_users_status_idx").on(table.status),
    index("platform_users_role_idx").on(table.role),
  ],
);

export type PlatformUser = typeof platformUsersTable.$inferSelect;
